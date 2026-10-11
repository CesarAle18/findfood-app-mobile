import {
  AuthApiError,
  AuthError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
} from "@supabase/supabase-js";

import { ApiError } from "./errors";
import {
  authErrorMessages,
  messageFor,
  problemMessages,
  translateFieldMessage,
} from "./problem-messages";

const apiError = (type: string, status = 400) => new ApiError({ type, status, title: "x" });

// The contract: every problem slug the API (or the client) can answer with.
const PROBLEM_TYPES = [
  // Generic, by status and persistence.
  "solicitud-invalida",
  "no-autenticado",
  "prohibido",
  "no-encontrado",
  "metodo-no-permitido",
  "conflicto",
  "carga-demasiado-grande",
  "no-procesable",
  "demasiadas-solicitudes",
  "error-interno",
  "error",
  "validacion",
  "conflicto-unicidad",
  "referencia-invalida",
  "restriccion-violada",
  // Client side.
  "sin-conexion",
  "tiempo-agotado",
  "respuesta-invalida",
  // Auth.
  "token-invalido",
  "cuenta-inexistente",
  "cuenta-suspendida",
  "cuenta-inactiva",
  "cuenta-pendiente",
  "cambio-password-requerido",
  "rol-insuficiente",
  // Donations.
  "sin-perfil-donante",
  "ventana-invalida",
  "tipo-alimento-invalido",
  "unidad-invalida",
  "donacion-no-editable",
  "donacion-no-publicable",
  "sin-productos",
  "producto-vencido",
  "ventana-en-el-pasado",
  "ventana-muy-corta",
  "sin-almacen-disponible",
  "donacion-no-cancelable",
  "donacion-no-reasignable",
  "donacion-ya-recogida",
  "ventana-cerrada",
  // Assignment.
  "oferta-vencida",
  "oferta-ya-respondida",
  "donacion-no-disponible",
  "asignacion-no-aceptada",
  "asignacion-no-completada",
  "sin-voluntario",
  "ya-calificada",
  // Routing.
  "demasiadas-paradas",
  "sin-banco",
  "banco-sin-flota",
  "asignacion-invalida",
  "donacion-ya-en-ruta",
  "destinos-distintos",
  "fechas-distintas",
  "excede-capacidad",
  "donaciones-dispersas",
  "ruta-infactible",
  "no-ejecutor",
  "ruta-no-iniciable",
  "ruta-no-en-curso",
  "parada-cerrada",
  "precision-insuficiente",
  "evidencia-requerida",
  "peso-requerido",
  "item-invalido",
  "recogidas-pendientes",
  "parada-no-recogida",
  "ruta-no-cancelable",
  // Volunteers.
  "sin-perfil-voluntario",
  "edad-minima",
  "tipo-vehiculo-invalido",
  "solicitud-en-curso",
  "ya-es-voluntario",
  "placa-registrada",
  "franja-invalida",
  "franjas-solapadas",
  "sin-horario",
  "sin-ubicacion-base",
  // Evidence.
  "extension-no-permitida",
  "archivo-invalido",
  "archivo-no-subido",
  "padre-evidencia-invalido",
  "evidencia-id-en-uso",
  "evidencia-ajena",
  // Incidents.
  "tipo-incidencia-invalido",
  "incidencia-sin-contexto",
  "incidencia-cerrada",
  "incidencia-no-abierta",
  "incidencia-ajena",
];

const AUTH_CODES = [
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "email_exists",
  "otp_expired",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "weak_password",
  "same_password",
  "email_address_invalid",
  "signup_disabled",
  "validation_failed",
  "session_not_found",
  "refresh_token_not_found",
  // App-defined: email auth in a profile without Supabase (see src/auth/email-auth.ts).
  "auth_unavailable",
];

describe("problemMessages", () => {
  it("has a message for every problem type, and only for those", () => {
    expect(Object.keys(problemMessages).sort()).toEqual([...PROBLEM_TYPES].sort());
  });

  it.each(PROBLEM_TYPES)("%s has a Spanish sentence", (type) => {
    expect(problemMessages[type]).toMatch(/^[A-ZÁÉÍÓÚÑ¿¡].+\.$/);
  });

  it("has a message for every Supabase Auth code, and only for those", () => {
    expect(Object.keys(authErrorMessages).sort()).toEqual([...AUTH_CODES].sort());
    for (const message of Object.values(authErrorMessages)) {
      expect(message).toMatch(/^[A-ZÁÉÍÓÚÑ¿¡].+\.$/);
    }
  });
});

describe("messageFor", () => {
  it("translates an API problem by its type", () => {
    expect(messageFor(apiError("ventana-invalida", 422))).toBe(
      problemMessages["ventana-invalida"],
    );
  });

  it("ignores types that name Object.prototype members", () => {
    expect(messageFor(apiError("constructor", 422))).toBe(problemMessages["no-procesable"]);
    expect(messageFor(apiError("toString", 409))).toBe(problemMessages.conflicto);
  });

  it("never shows the API title or detail", () => {
    const error = new ApiError({
      type: "slug-nuevo",
      status: 422,
      title: "Internal title",
      detail: "stack trace",
    });
    expect(messageFor(error)).not.toMatch(/Internal title|stack trace/);
  });

  it.each([
    [400, "solicitud-invalida"],
    [401, "no-autenticado"],
    [403, "prohibido"],
    [404, "no-encontrado"],
    [405, "metodo-no-permitido"],
    [409, "conflicto"],
    [413, "carga-demasiado-grande"],
    [422, "no-procesable"],
    [429, "demasiadas-solicitudes"],
    [500, "error-interno"],
    [503, "error-interno"],
    [418, "error"],
    [0, "sin-conexion"],
  ])("falls back to the status for an unknown type (%i)", (status, type) => {
    expect(messageFor(apiError("slug-desconocido", status))).toBe(problemMessages[type]);
  });

  it("translates client-side failures", () => {
    expect(messageFor(ApiError.network(new TypeError("Network request failed")))).toBe(
      problemMessages["sin-conexion"],
    );
    expect(messageFor(ApiError.timeout())).toBe(problemMessages["tiempo-agotado"]);
  });

  it.each(AUTH_CODES)("translates the Supabase Auth code %s", (code) => {
    expect(messageFor(new AuthApiError("English message", 400, code))).toBe(
      authErrorMessages[code],
    );
  });

  it("translates a weak password error", () => {
    expect(messageFor(new AuthWeakPasswordError("Password is weak", 422, ["length"]))).toBe(
      authErrorMessages.weak_password,
    );
  });

  it("treats a Supabase fetch failure as a connection problem", () => {
    expect(messageFor(new AuthRetryableFetchError("Network request failed", 0))).toBe(
      problemMessages["sin-conexion"],
    );
  });

  it("falls back to the status for a Supabase gateway error or an unknown code", () => {
    expect(messageFor(new AuthRetryableFetchError("Bad Gateway", 502))).toBe(
      problemMessages["error-interno"],
    );
    expect(messageFor(new AuthApiError("Nope", 429, "some_new_code"))).toBe(
      problemMessages["demasiadas-solicitudes"],
    );
  });

  it("treats a Supabase error without code or status as unexpected", () => {
    expect(messageFor(new AuthError("Something odd"))).toBe(messageFor(undefined));
  });

  it("translates raw network and timeout errors", () => {
    expect(messageFor(new TypeError("Network request failed"))).toBe(
      problemMessages["sin-conexion"],
    );
    const timeout = new Error("The operation timed out.");
    timeout.name = "TimeoutError";
    expect(messageFor(timeout)).toBe(problemMessages["tiempo-agotado"]);
  });

  it.each([
    ["an Error", new Error("Cannot read properties of undefined")],
    ["a string", "boom"],
    ["null", null],
    ["undefined", undefined],
  ])("shows a generic message for %s, never its text", (_name, error) => {
    const message = messageFor(error);
    expect(message).toMatch(/^Ocurrió un error inesperado/);
    expect(message).not.toMatch(/Cannot read|boom/);
  });
});

describe("translateFieldMessage", () => {
  it.each([
    ["should not be empty", "No puede estar vacío."],
    ["should not be null or undefined", "Es obligatorio."],
    ["must be an email", "Debe ser un correo electrónico válido."],
    ["must be a string", "Debe ser texto."],
    ["must be a number conforming to the specified constraints", "Debe ser un número."],
    ["must be an integer number", "Debe ser un número entero."],
    ["must be a positive number", "Debe ser un número positivo."],
    ["must be a UUID", "Debe ser un identificador válido."],
    ["must be a valid ISO 8601 date string", "Debe ser una fecha válida."],
    ["must be a boolean value", "Debe ser verdadero o falso."],
    ["must be an array", "Debe ser una lista."],
    ["must be a valid phone number", "Debe ser un número de teléfono válido."],
    [
      "must be a valid representation of military time in the format HH:MM",
      "Debe ser una hora válida (HH:MM).",
    ],
    ["must be shorter than or equal to 100 characters", "Debe tener como máximo 100 caracteres."],
    ["must be longer than or equal to 8 characters", "Debe tener al menos 8 caracteres."],
    ["must be longer than or equal to 1 characters", "Debe tener al menos 1 carácter."],
    ["must not be less than 0.01", "Debe ser mayor o igual a 0.01."],
    ["must not be greater than 5000", "Debe ser menor o igual a 5000."],
    ["must contain at least 1 elements", "Debe tener al menos 1 elemento."],
    ["must contain no more than 25 elements", "Debe tener como máximo 25 elementos."],
    ["must be one of the following values: KG, L", "Debe ser uno de estos valores: KG, L."],
    ["must match /^\\d{10}$/ regular expression", "Tiene un formato no válido."],
  ])("translates %j", (message, expected) => {
    expect(translateFieldMessage(message)).toBe(expected);
  });

  it("translates class-validator `each` messages", () => {
    expect(translateFieldMessage("each value must be a string")).toBe("Cada valor debe ser texto.");
    expect(translateFieldMessage("each value must be a UUID")).toBe(
      "Cada valor debe ser un identificador válido.",
    );
  });

  it("keeps messages that are already in Spanish", () => {
    expect(translateFieldMessage("debe tener 10 dígitos")).toBe("Debe tener 10 dígitos.");
    expect(translateFieldMessage("El teléfono debe empezar por 3.")).toBe(
      "El teléfono debe empezar por 3.",
    );
  });

  it.each([
    "must be a valid IBAN",
    "each value must be a valid IBAN",
    "property foo should not exist",
    "",
  ])("shows a generic message for unknown English %j", (message) => {
    expect(translateFieldMessage(message)).toBe("Valor no válido.");
  });
});
