/**
 * The API's `sync` event (contract v1), broadcast on the private Realtime topic
 * `usuario:<auth uid>`: a hint that something the user can see changed. It carries no
 * business data and no state, only what to fetch again over REST, where roles and
 * ownership are enforced.
 *
 *   { v: 1, entidad, id?, donacion_id?, ruta_id?, asignacion_id?, tipo? }
 *
 * For `notificacion`, `tipo`, `donacion_id` and `asignacion_id` mirror the push `data`.
 */

export const SYNC_ENTIDADES = [
  "donacion",
  "asignacion",
  "parada",
  "ruta",
  "notificacion",
  "cuenta",
] as const;

export type SyncEntidad = (typeof SYNC_ENTIDADES)[number];

export interface SyncEvent {
  v: 1;
  entidad: SyncEntidad;
  /** The id of `entidad` itself. */
  id?: string;
  donacion_id?: string;
  ruta_id?: string;
  asignacion_id?: string;
  /** The notification code (`notificacion` only). */
  tipo?: string;
}

const ID_FIELDS = ["id", "donacion_id", "ruta_id", "asignacion_id"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isEntidad = (value: unknown): value is SyncEntidad =>
  SYNC_ENTIDADES.includes(value as SyncEntidad);

/**
 * The event, or null when the payload is not a v1 event: any other version, an unknown
 * entity, an id that is not a uuid or a `tipo` that is not a string. Fields outside the
 * contract are dropped, and null fields count as absent.
 */
export function parseSyncEvent(payload: unknown): SyncEvent | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const fields = payload as Record<string, unknown>;
  if (fields.v !== 1 || !isEntidad(fields.entidad)) return null;

  const event: SyncEvent = { v: 1, entidad: fields.entidad };
  for (const field of ID_FIELDS) {
    const value = fields[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" || !UUID.test(value)) return null;
    event[field] = value;
  }
  const { tipo } = fields;
  if (tipo !== undefined && tipo !== null) {
    if (typeof tipo !== "string") return null;
    event.tipo = tipo;
  }
  return event;
}
