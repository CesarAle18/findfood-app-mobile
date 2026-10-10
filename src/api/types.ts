/**
 * DTOs of findfood-api (`/v1`), written by hand from the API responses. Field names keep
 * the API's Spanish snake_case so responses are used as-is.
 */

/** Account roles; only DONANTE and VOLUNTARIO have screens in the mobile app. */
export type Rol = "DONANTE" | "VOLUNTARIO" | "ASESOR_BANCO" | "ADMIN";

/** Steps the account must complete before using the app (`GET /me` `pendientes`). */
export type Pendiente =
  | "TELEFONO"
  | "CONFIRMAR_CORREO"
  | "CAMBIAR_PASSWORD"
  | "ACEPTAR_TERMINOS";

/** Donor profile summary embedded in `GET /me`; refined with the donor module. */
export interface MeDonanteDto {
  id: string;
  activo: boolean;
  total_donaciones: number;
  total_kg_donados: number;
  calificacion_promedio: number | null;
  [field: string]: unknown;
}

/** Volunteer profile summary embedded in `GET /me`; refined with the volunteer module. */
export interface MeVoluntarioDto {
  id: string;
  [field: string]: unknown;
}

/** `GET /me`: also answered for accounts with `pendientes`. */
export interface MeDto {
  id: string;
  email: string;
  nombres: string | null;
  /** Null for accounts created with Google until the profile is completed. */
  apellidos: string | null;
  telefono: string | null;
  url_foto: string | null;
  estado: string;
  debe_cambiar_password: boolean;
  idioma: string | null;
  acepto_terminos_at: string | null;
  created_at: string;
  email_verificado: boolean;
  roles: Rol[];
  pendientes: Pendiente[];
  donante: MeDonanteDto | null;
  voluntario: MeVoluntarioDto | null;
}

/** Paginated list envelope. */
export interface Paged<T> {
  datos: T[];
  total: number;
  limite: number;
  desplazamiento: number;
}
