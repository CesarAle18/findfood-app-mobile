/**
 * User-facing Spanish messages for every error the app can show: findfood-api problems
 * (by `type` slug), Supabase Auth errors (by `code`), connection failures and anything
 * unexpected. API titles and details are never shown: they are written for developers.
 */
import {
  type AuthError,
  isAuthError,
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";

import { isApiError } from "./errors";

const GENERIC_MESSAGES = {
  "solicitud-invalida": "La solicitud no es válida. Revisa los datos e inténtalo de nuevo.",
  "no-autenticado": "Tu sesión expiró. Inicia sesión de nuevo.",
  prohibido: "No tienes permiso para realizar esta acción.",
  "no-encontrado": "No encontramos lo que buscas. Es posible que ya no exista.",
  "metodo-no-permitido": "Esta acción no está disponible.",
  conflicto: "La información cambió mientras trabajabas. Actualiza e inténtalo de nuevo.",
  "carga-demasiado-grande": "Los datos o el archivo superan el tamaño permitido.",
  "no-procesable": "No pudimos procesar la solicitud. Revisa los datos e inténtalo de nuevo.",
  "demasiadas-solicitudes": "Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo.",
  "error-interno": "Tuvimos un problema en el servidor. Inténtalo de nuevo en unos minutos.",
  error: "No pudimos completar la solicitud. Inténtalo de nuevo.",
  validacion: "Algunos datos no son válidos. Revisa los campos marcados.",
  "conflicto-unicidad": "Ya existe un registro con esos datos.",
  "referencia-invalida": "Uno de los datos seleccionados ya no existe o no es válido.",
  "restriccion-violada": "La operación no cumple las reglas de la información registrada.",
};

const CLIENT_MESSAGES = {
  "sin-conexion": "No pudimos conectarnos. Revisa tu conexión a internet e inténtalo de nuevo.",
  "tiempo-agotado": "El servidor tardó demasiado en responder. Inténtalo de nuevo.",
  "respuesta-invalida": "Recibimos una respuesta inesperada del servidor. Inténtalo de nuevo.",
};

const AUTH_MESSAGES = {
  "token-invalido": "Tu sesión no es válida. Inicia sesión de nuevo.",
  "cuenta-inexistente": "No encontramos una cuenta de Find Food asociada a este usuario.",
  "cuenta-suspendida": "Tu cuenta está suspendida. Comunícate con soporte para más información.",
  "cuenta-inactiva": "Tu cuenta está inactiva. Comunícate con soporte para reactivarla.",
  "cuenta-pendiente": "Tu cuenta está pendiente de aprobación.",
  "cambio-password-requerido": "Debes cambiar tu contraseña antes de continuar.",
  "rol-insuficiente": "Tu rol no tiene permiso para realizar esta acción.",
};

const DONATION_MESSAGES = {
  "sin-perfil-donante": "Completa tu perfil de donante antes de continuar.",
  "ventana-invalida": "La hora de fin de la recogida debe ser posterior a la de inicio.",
  "tipo-alimento-invalido": "El tipo de alimento seleccionado no es válido.",
  "unidad-invalida": "La unidad de medida seleccionada no es válida.",
  "donacion-no-editable": "Esta donación ya no se puede editar.",
  "donacion-no-publicable": "Esta donación no se puede publicar en su estado actual.",
  "sin-productos": "Agrega al menos un producto a la donación.",
  "producto-vencido": "Uno de los productos ya está vencido.",
  "ventana-en-el-pasado": "La ventana de recogida no puede estar en el pasado.",
  "ventana-muy-corta": "La ventana de recogida es demasiado corta. Amplía el horario.",
  "sin-almacen-disponible": "No hay un almacén disponible para recibir esta donación.",
  "donacion-no-cancelable": "Esta donación ya no se puede cancelar.",
  "donacion-no-reasignable": "Esta donación no se puede reasignar.",
  "donacion-ya-recogida": "Esta donación ya fue recogida.",
  "ventana-cerrada": "La ventana de recogida ya se cerró.",
};

const ASSIGNMENT_MESSAGES = {
  "oferta-vencida": "Esta oferta ya venció.",
  "oferta-ya-respondida": "Ya respondiste a esta oferta.",
  "donacion-no-disponible": "Esta donación ya no está disponible.",
  "asignacion-no-aceptada": "La asignación todavía no ha sido aceptada.",
  "asignacion-no-completada": "La asignación todavía no se ha completado.",
  "sin-voluntario": "Esta donación todavía no tiene un voluntario asignado.",
  "ya-calificada": "Ya registraste una calificación para esta entrega.",
};

const ROUTING_MESSAGES = {
  "demasiadas-paradas": "La ruta tiene demasiadas paradas.",
  "sin-banco": "No hay un banco de alimentos asociado.",
  "banco-sin-flota": "El banco de alimentos no tiene vehículos disponibles.",
  "asignacion-invalida": "La asignación no es válida para esta ruta.",
  "donacion-ya-en-ruta": "Una de las donaciones ya pertenece a otra ruta.",
  "destinos-distintos": "Las donaciones van a destinos distintos y no pueden ir en la misma ruta.",
  "fechas-distintas": "Las donaciones son de fechas distintas y no pueden ir en la misma ruta.",
  "excede-capacidad": "La carga supera la capacidad del vehículo.",
  "donaciones-dispersas": "Las donaciones están demasiado lejos entre sí para una misma ruta.",
  "ruta-infactible": "No es posible armar una ruta con estas paradas y horarios.",
  "no-ejecutor": "No eres el responsable de esta ruta.",
  "ruta-no-iniciable": "Esta ruta todavía no se puede iniciar.",
  "ruta-no-en-curso": "Esta ruta no está en curso.",
  "parada-cerrada": "Esta parada ya está cerrada.",
  "precision-insuficiente":
    "La ubicación no es lo bastante precisa. Espera a tener mejor señal e inténtalo de nuevo.",
  "evidencia-requerida": "Adjunta la evidencia fotográfica para continuar.",
  "peso-requerido": "Indica el peso para continuar.",
  "item-invalido": "Uno de los productos no pertenece a esta parada.",
  "recogidas-pendientes": "Todavía hay recogidas pendientes en la ruta.",
  "parada-no-recogida": "Esta parada todavía no se ha recogido.",
  "ruta-no-cancelable": "Esta ruta ya no se puede cancelar.",
};

const VOLUNTEER_MESSAGES = {
  "sin-perfil-voluntario": "Completa tu registro como voluntario antes de continuar.",
  "edad-minima": "Debes ser mayor de edad para registrarte como voluntario.",
  "tipo-vehiculo-invalido": "El tipo de vehículo seleccionado no es válido.",
  "solicitud-en-curso": "Ya tienes una solicitud de voluntariado en revisión.",
  "ya-es-voluntario": "Ya estás registrado como voluntario.",
  "placa-registrada": "Esa placa ya está registrada.",
  "franja-invalida": "En cada franja horaria, la hora de fin debe ser posterior a la de inicio.",
  "franjas-solapadas": "Hay franjas horarias que se cruzan entre sí.",
  "sin-horario": "Agrega al menos una franja de disponibilidad.",
  "sin-ubicacion-base": "Indica tu ubicación base para continuar.",
};

const EVIDENCE_MESSAGES = {
  "extension-no-permitida": "Ese tipo de archivo no está permitido.",
  "archivo-invalido": "El archivo no es válido o está dañado.",
  "archivo-no-subido": "El archivo todavía no se ha subido. Inténtalo de nuevo.",
  "padre-evidencia-invalido": "La evidencia no corresponde a un registro válido.",
  "evidencia-id-en-uso": "Esta evidencia ya fue registrada.",
  "evidencia-ajena": "Esta evidencia pertenece a otro usuario.",
};

const INCIDENT_MESSAGES = {
  "tipo-incidencia-invalido": "El tipo de incidencia no es válido.",
  "incidencia-sin-contexto": "La incidencia debe estar asociada a una donación o a una ruta.",
  "incidencia-cerrada": "Esta incidencia ya está cerrada.",
  "incidencia-no-abierta": "Esta incidencia no está abierta.",
  "incidencia-ajena": "Esta incidencia pertenece a otro usuario.",
};

/** Message per problem `type` slug, from the API or from the client (status 0). */
export const problemMessages: Readonly<Record<string, string>> = {
  ...GENERIC_MESSAGES,
  ...CLIENT_MESSAGES,
  ...AUTH_MESSAGES,
  ...DONATION_MESSAGES,
  ...ASSIGNMENT_MESSAGES,
  ...ROUTING_MESSAGES,
  ...VOLUNTEER_MESSAGES,
  ...EVIDENCE_MESSAGES,
  ...INCIDENT_MESSAGES,
};

const EXPIRED_SESSION = "Tu sesión expiró. Inicia sesión de nuevo.";
const EXISTING_ACCOUNT = "Ya existe una cuenta con este correo electrónico.";

/** Message per Supabase Auth error `code`. */
export const authErrorMessages: Readonly<Record<string, string>> = {
  invalid_credentials: "El correo o la contraseña no son correctos.",
  email_not_confirmed: "Confirma tu correo electrónico antes de iniciar sesión.",
  user_already_exists: EXISTING_ACCOUNT,
  email_exists: EXISTING_ACCOUNT,
  // Supabase also answers a wrong code with `otp_expired`.
  otp_expired: "El enlace o el código no es válido o ya expiró. Solicita uno nuevo.",
  over_email_send_rate_limit:
    "Ya enviamos varios correos. Espera unos minutos antes de solicitar otro.",
  over_request_rate_limit: "Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  weak_password: "La contraseña es demasiado débil. Usa una más larga que combine letras y números.",
  same_password: "La nueva contraseña debe ser distinta de la actual.",
  email_address_invalid: "El correo electrónico no es válido.",
  signup_disabled: "El registro no está disponible en este momento.",
  validation_failed: "Algunos datos no son válidos. Revísalos e inténtalo de nuevo.",
  session_not_found: EXPIRED_SESSION,
  refresh_token_not_found: EXPIRED_SESSION,
  // App-defined (src/auth/email-auth.ts): email auth in a profile without Supabase.
  auth_unavailable:
    "Este perfil local no usa Supabase: la sesión se inicia con el token de desarrollo. Usa el perfil real para iniciar sesión o registrarte.",
};

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";

const STATUS_TYPES: Readonly<Record<number, string>> = {
  0: "sin-conexion",
  400: "solicitud-invalida",
  401: "no-autenticado",
  403: "prohibido",
  404: "no-encontrado",
  405: "metodo-no-permitido",
  409: "conflicto",
  413: "carga-demasiado-grande",
  422: "no-procesable",
  429: "demasiadas-solicitudes",
};

/**
 * Own-property lookup: `type` and `code` come from the server, and a value such as
 * "constructor" must not resolve to an inherited `Object.prototype` member.
 */
function lookup(table: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

function statusMessage(status: number): string {
  const type = STATUS_TYPES[status] ?? (status >= 500 ? "error-interno" : "error");
  return problemMessages[type];
}

function authMessage(error: AuthError): string {
  if (isAuthWeakPasswordError(error)) return authErrorMessages.weak_password;
  const byCode = error.code === undefined ? undefined : lookup(authErrorMessages, error.code);
  if (byCode) return byCode;
  // auth-js reports requests that never got an answer (offline, aborted) with status 0.
  if (isAuthRetryableFetchError(error) && !error.status) return problemMessages["sin-conexion"];
  return error.status ? statusMessage(error.status) : UNEXPECTED_MESSAGE;
}

const RAW_NETWORK_FAILURE = /network request failed|failed to fetch/i;

/** The Spanish message to show the user for any thrown or returned error. */
export function messageFor(error: unknown): string {
  if (isApiError(error)) return lookup(problemMessages, error.type) ?? statusMessage(error.status);
  if (isAuthError(error)) return authMessage(error);
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return problemMessages["tiempo-agotado"];
    if (error instanceof TypeError && RAW_NETWORK_FAILURE.test(error.message)) {
      return problemMessages["sin-conexion"];
    }
  }
  return UNEXPECTED_MESSAGE;
}

const INVALID_VALUE = "Valor no válido.";

const plural = (count: string, one: string, many: string) => (count === "1" ? one : many);

/**
 * class-validator default messages, without the property path (see `parseProblem`), as
 * Spanish clauses that keep the original numbers and values.
 */
const FIELD_RULES: readonly (readonly [RegExp, (...groups: string[]) => string])[] = [
  [/^should not be empty$/, () => "no puede estar vacío"],
  [/^should not be null or undefined$/, () => "es obligatorio"],
  [/^must be an email$/, () => "debe ser un correo electrónico válido"],
  [/^must be a string$/, () => "debe ser texto"],
  [/^must be a number conforming to the specified constraints$/, () => "debe ser un número"],
  [/^must be a number string$/, () => "debe contener solo números"],
  [/^must be an integer number$/, () => "debe ser un número entero"],
  [/^must be a positive number$/, () => "debe ser un número positivo"],
  [/^must be a negative number$/, () => "debe ser un número negativo"],
  [/^must be a boolean value$/, () => "debe ser verdadero o falso"],
  [/^must be a UUID$/, () => "debe ser un identificador válido"],
  [/^must be a valid ISO 8601 date string$/, () => "debe ser una fecha válida"],
  [/^must be a Date instance$/, () => "debe ser una fecha válida"],
  [
    /^must be a valid representation of military time in the format HH:MM$/,
    () => "debe ser una hora válida (HH:MM)",
  ],
  [/^must be an array$/, () => "debe ser una lista"],
  [/^must be an object$/, () => "tiene un formato no válido"],
  [/^must be a URL address$/, () => "debe ser una dirección web válida"],
  [/^must be a (?:valid )?phone number$/, () => "debe ser un número de teléfono válido"],
  [/^must be a latitude string or number$/, () => "debe ser una latitud válida"],
  [/^must be a longitude string or number$/, () => "debe ser una longitud válida"],
  [/^must be a valid enum value$/, () => "debe ser una de las opciones disponibles"],
  [/^must be one of the following values: (.+)$/, (values) => `debe ser uno de estos valores: ${values}`],
  [
    /^must be shorter than or equal to (\d+) characters$/,
    (n) => `debe tener como máximo ${n} ${plural(n, "carácter", "caracteres")}`,
  ],
  [
    /^must be longer than or equal to (\d+) characters$/,
    (n) => `debe tener al menos ${n} ${plural(n, "carácter", "caracteres")}`,
  ],
  [/^must not be less than (\S+)$/, (n) => `debe ser mayor o igual a ${n}`],
  [/^must not be greater than (\S+)$/, (n) => `debe ser menor o igual a ${n}`],
  [
    /^must contain at least (\d+) elements$/,
    (n) => `debe tener al menos ${n} ${plural(n, "elemento", "elementos")}`,
  ],
  [
    /^must contain no more than (\d+) elements$/,
    (n) => `debe tener como máximo ${n} ${plural(n, "elemento", "elementos")}`,
  ],
  [/^must match .+ regular expression$/, () => "tiene un formato no válido"],
];

function translateClause(message: string): string | undefined {
  for (const [pattern, translate] of FIELD_RULES) {
    const match = pattern.exec(message);
    if (match) return translate(...match.slice(1));
  }
  return undefined;
}

const ENGLISH_WORDS = /\b(?:must|should|be|is|are|the|each|value|property|not|than)\b/i;
const SPANISH_TEXT =
  /[áéíóúñü¿¡]|\b(?:debe|deben|es|son|no|el|la|los|las|un|una|de|del|entre|mayor|menor|campo|valor)\b/i;

const sentence = (text: string) => {
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
};

/**
 * Translates one API validation message for a form field. Known class-validator defaults
 * become Spanish, messages the API already writes in Spanish pass through, and any other
 * English message becomes a generic "Valor no válido.".
 */
export function translateFieldMessage(message: string): string {
  const text = message.trim();
  const each = /^each value (.+)$/.exec(text);
  if (each) {
    const clause = translateClause(each[1]);
    return clause ? `Cada valor ${clause}.` : INVALID_VALUE;
  }
  const clause = translateClause(text);
  if (clause) return sentence(clause);
  if (text !== "" && !ENGLISH_WORDS.test(text) && SPANISH_TEXT.test(text)) return sentence(text);
  return INVALID_VALUE;
}
