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

/*
 * Conventions of every response (checked against the API source):
 * - Dates and timestamps are ISO strings in UTC. Date-only columns (`fecha_vencimiento`,
 *   `fecha_programada`) also arrive as `YYYY-MM-DDT00:00:00.000Z`: read their first 10
 *   characters, never convert their time zone (mapping lives in F1-06).
 * - SQL numeric and bigint columns arrive as JSON numbers (the API's serialization
 *   interceptor converts Prisma's Decimal and BigInt).
 * - Catalog ids (`*_id` of catalogs) are small integers; entity ids are UUID strings.
 */

/** A point (WGS84), as the API sends and receives it. */
export interface Coordenada {
  lat: number;
  lng: number;
}

export type EstadoDonacion =
  | "BORRADOR"
  | "PUBLICADA"
  | "ASIGNADA"
  | "EN_RECOLECCION"
  | "EN_TRANSITO"
  | "ENTREGADA"
  | "RECIBIDA"
  | "RECHAZADA"
  | "CANCELADA"
  | "EXPIRADA";

export type EstadoAsignacion =
  | "OFRECIDA"
  | "ACEPTADA"
  | "RECHAZADA"
  | "EXPIRADA"
  | "ABANDONADA"
  | "COMPLETADA"
  | "CANCELADA";

export type EstadoRuta = "PLANIFICADA" | "EN_CURSO" | "COMPLETADA" | "CANCELADA";

export type EstadoParada = "PENDIENTE" | "EN_SITIO" | "COMPLETADA" | "FALLIDA" | "OMITIDA";

export type TipoParada = "RECOGIDA" | "ENTREGA";

/** Condition of the collected food, reported when confirming a pickup (API-10). */
export type EstadoProducto = "BUENO" | "REGULAR" | "MALO";

export type EstadoVerificacion = "NO_INICIADA" | "PENDIENTE" | "APROBADA" | "RECHAZADA";

export type TipoAlmacenamiento = "SECO" | "REFRIGERADO";

/** Query params of paginated lists: `limite` 1-100 (default 20), `desplazamiento` ≥ 0. */
export type Paginacion = {
  limite?: number;
  desplazamiento?: number;
};

/** A weekly availability window, Bogotá time (`dia_semana` 0 = Sunday … 6 = Saturday). */
export interface FranjaDto {
  dia_semana: number;
  /** `HH:MM`. */
  hora_inicio: string;
  /** `HH:MM`, after `hora_inicio` (a window never crosses midnight). */
  hora_fin: string;
}

/** Donor profile summary embedded in `GET /me` (null while the donor profile is inactive). */
export interface MeDonanteDto {
  id: string;
  activo: boolean;
  total_donaciones: number;
  total_kg_donados: number;
  calificacion_promedio: number | null;
}

/** Latest identity verification of a volunteer request. */
export interface VerificacionVoluntarioDto {
  estado: EstadoVerificacion;
  observacion: string | null;
  /** Name of the rejection reason. */
  motivo: string | null;
  solicitada_at: string;
  revisada_at: string | null;
}

/** Volunteer profile embedded in `GET /me`: present from the volunteer request on. */
export interface MeVoluntarioDto {
  id: string;
  estado_verificacion: EstadoVerificacion;
  disponible: boolean;
  placa_vehiculo: string;
  capacidad_carga_kg: number;
  tiene_refrigeracion: boolean;
  radio_cobertura_km: number;
  total_entregas: number;
  calificacion_promedio: number | null;
  tipo_vehiculo: { id: number; codigo: string; nombre: string };
  ubicacion_base: Coordenada | null;
  /** Active windows, ordered by day and start. */
  disponibilidad: FranjaDto[];
  verificacion: VerificacionVoluntarioDto | null;
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
