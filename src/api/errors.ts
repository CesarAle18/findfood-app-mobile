/**
 * Errors raised by the findfood-api client.
 *
 * The API answers every error with RFC 9457 `application/problem+json`:
 * `{ type, title, status, detail?, instance, ...extensions }`, where `type` is a plain
 * slug (`ventana-invalida`) and extension members sit at the top level.
 */

/** `fields` key for messages that do not belong to a specific form field. */
export const FORM_ERROR_KEY = "_form";

/** Problem type of field validation errors (400 with `errores: string[]`). */
export const VALIDATION_ERROR_TYPE = "validacion";

export interface ApiErrorInit {
  type: string;
  /** HTTP status, or 0 when the request never got a response. */
  status: number;
  title: string;
  detail?: string;
  instance?: string;
  fields?: Record<string, string[]>;
  extensions?: Record<string, unknown>;
  cause?: unknown;
}

export class ApiError extends Error {
  /** Problem slug, or a client-side slug (`sin-conexion`, `tiempo-agotado`) with status 0. */
  readonly type: string;
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly instance?: string;
  /** Messages per field path in dot notation (`items.0.cantidad`); see FORM_ERROR_KEY. */
  readonly fields: Record<string, string[]>;
  /** Problem members beyond the RFC 9457 standard ones. */
  readonly extensions: Record<string, unknown>;

  constructor(init: ApiErrorInit) {
    super(init.detail ? `${init.title}: ${init.detail}` : init.title);
    this.name = "ApiError";
    this.type = init.type;
    this.status = init.status;
    this.title = init.title;
    this.detail = init.detail;
    this.instance = init.instance;
    this.fields = init.fields ?? {};
    this.extensions = init.extensions ?? {};
    // Assigned directly instead of through the `cause` constructor option, which is
    // not verified on Hermes.
    if (init.cause !== undefined) this.cause = init.cause;
  }

  /** The request failed before any response arrived (offline, DNS, TLS...). */
  static network(cause: unknown): ApiError {
    return new ApiError({
      type: "sin-conexion",
      status: 0,
      title: "Network request failed",
      cause,
    });
  }

  /** The client stopped waiting for a response. */
  static timeout(): ApiError {
    return new ApiError({ type: "tiempo-agotado", status: 0, title: "Request timed out" });
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const GENERIC_PROBLEMS: Record<number, readonly [type: string, title: string]> = {
  400: ["solicitud-invalida", "Bad request"],
  401: ["no-autenticado", "Unauthorized"],
  403: ["prohibido", "Forbidden"],
  404: ["no-encontrado", "Not found"],
  405: ["metodo-no-permitido", "Method not allowed"],
  409: ["conflicto", "Conflict"],
  413: ["carga-demasiado-grande", "Payload too large"],
  422: ["no-procesable", "Unprocessable content"],
  429: ["demasiadas-solicitudes", "Too many requests"],
};

function genericProblem(status: number): readonly [type: string, title: string] {
  return (
    GENERIC_PROBLEMS[status] ??
    (status >= 500 ? ["error-interno", "Server error"] : ["error", "Request failed"])
  );
}

const STANDARD_MEMBERS = new Set(["type", "title", "status", "detail", "instance"]);

type ProblemBody = Record<string, unknown> & { type: string };

function isProblemBody(body: unknown): body is ProblemBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const { type } = body as { type?: unknown };
  return typeof type === "string" && type !== "";
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Builds the error for a non-2xx response. `body` is the parsed JSON, the raw text,
 * or null when the response had no body.
 */
export function parseProblem(status: number, body: unknown): ApiError {
  const [genericType, genericTitle] = genericProblem(status);
  if (!isProblemBody(body)) {
    return new ApiError({ type: genericType, status, title: genericTitle });
  }

  const type = body.type === "about:blank" ? genericType : body.type;
  const title = text(body.title);
  const detail = text(body.detail);
  const extensions = Object.fromEntries(
    Object.entries(body).filter(([key]) => !STANDARD_MEMBERS.has(key)),
  );
  const fields =
    type === VALIDATION_ERROR_TYPE && Array.isArray(body.errores)
      ? validationFields(body.errores)
      : leadingFields([title, detail]);

  return new ApiError({
    type,
    status,
    title: title ?? genericTitle,
    detail,
    instance: text(body.instance),
    fields,
    extensions,
  });
}

// A field path made of lowercase identifiers and indexes: `telefono`, `items.0.cantidad`,
// `items[0].unidad_medida_id`.
const FIELD_PATH = /^[a-z_][a-z0-9_]*(?:\.(?:[a-z_][a-z0-9_]*|\d+)|\[\d+\])*$/;
// Business titles are free Spanish text, so a leading word only counts as a path when
// it has path punctuation (`fecha_vencimiento`, `items[0].x`), never a plain word.
const PATH_PUNCTUATION = /[_.[]/;
// class-validator messages that do not start with the property path. Nested errors get
// the parent path prepended (`items.0.property x should not exist`).
const WHITELIST_MESSAGE = /^(?:\S+\.)?property \S+ should not exist$/;
const EACH_MESSAGE = /^(?:(\S+)\.)?each value in (\S+)\s+([\s\S]+)$/;

interface FieldMessage {
  path: string;
  message: string;
}

function normalizePath(path: string): string {
  return path.replace(/\[(\d+)\]/g, ".$1");
}

/** Splits `"<path> <message>"`; undefined when the first word is not a field path. */
function splitFieldMessage(value: string, strict: boolean): FieldMessage | undefined {
  const match = /^(\S+)\s+([\s\S]+)$/.exec(value.trim());
  if (!match) return undefined;
  const [, path, message] = match;
  if (!FIELD_PATH.test(path) || (strict && !PATH_PUNCTUATION.test(path))) return undefined;
  return { path: normalizePath(path), message: message.trim() };
}

function splitValidationMessage(value: string): FieldMessage | undefined {
  if (WHITELIST_MESSAGE.test(value)) return undefined;
  const each = EACH_MESSAGE.exec(value);
  if (each) {
    const [, parent, property, message] = each;
    const path = parent ? `${parent}.${property}` : property;
    return FIELD_PATH.test(path)
      ? { path: normalizePath(path), message: `each value ${message.trim()}` }
      : undefined;
  }
  return splitFieldMessage(value, false);
}

function addMessage(fields: Record<string, string[]>, path: string, message: string) {
  const messages = fields[path] ?? [];
  if (!messages.includes(message)) messages.push(message);
  fields[path] = messages;
}

function validationFields(errores: unknown[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const entry of errores) {
    const message = text(entry)?.trim();
    if (!message) continue;
    const field = splitValidationMessage(message);
    if (field) addMessage(fields, field.path, field.message);
    else addMessage(fields, FORM_ERROR_KEY, message);
  }
  return fields;
}

function leadingFields(texts: (string | undefined)[]): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const value of texts) {
    const field = value === undefined ? undefined : splitFieldMessage(value, true);
    if (field) addMessage(fields, field.path, field.message);
  }
  return fields;
}
