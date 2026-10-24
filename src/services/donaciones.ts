/**
 * Donations of the signed-in donor (`/donaciones`): drafts, publishing, cancelling and
 * their state history. Volunteers read a donation's detail while they hold its offer or
 * assignment.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/api";
import type {
  Coordenada,
  EstadoAsignacion,
  EstadoDonacion,
  Paged,
  Paginacion,
  TipoAlmacenamiento,
} from "@/api/types";

import { invalidateOnSuccess, queryKeys, type Invalidation } from "./query-keys";
import type { SeguimientoDto } from "./rutas";

// --- DTOs ------------------------------------------------------------------------------

export type ModoRecoleccion = "VOLUNTARIO" | "FLOTA_BANCO";

/** A product of `POST /donaciones` (and of `PATCH`, where `items` replaces them all). */
export type ItemDonacionBody = {
  tipo_alimento_id: number;
  /** Defaults to the food type's unit. */
  unidad_medida_id?: number;
  descripcion?: string;
  cantidad: number;
  peso_estimado_kg: number;
  /** `YYYY-MM-DD`. */
  fecha_vencimiento?: string;
  /** Defaults to the food type's; a refrigerated type is never declared dry. */
  requiere_refrigeracion?: boolean;
  /** Path from `POST /evidencias/upload-url` with purpose PRODUCTO. */
  ruta_foto?: string;
  observaciones?: string;
};

/** `POST /donaciones`: creates a BORRADOR. Window bounds are ISO strings with offset. */
export type CrearDonacionBody = {
  titulo?: string;
  descripcion?: string;
  ventana_recogida_inicio: string;
  ventana_recogida_fin: string;
  direccion_recogida: string;
  referencia_recogida?: string;
  ubicacion_recogida: Coordenada;
  /** Alternative contact; the donor's phone is used when absent. */
  contacto_nombre?: string;
  contacto_telefono?: string;
  /** 1 to 30 products. */
  items: ItemDonacionBody[];
};

/** `PATCH /donaciones/:id`: only in BORRADOR or EXPIRADA. */
export type ActualizarDonacionBody = Partial<CrearDonacionBody>;

/** `POST /donaciones/:id/cancelar`: a reason of scope CANCELACION_DONACION. */
export type CancelarDonacionBody = {
  motivo_id: number;
  observacion?: string;
};

/** `GET /donaciones` filters; `desde`/`hasta` bound `created_at` (ISO). */
export type DonacionesFilters = Paginacion & {
  estado?: EstadoDonacion;
  desde?: string;
  hasta?: string;
};

/** A row of `GET /donaciones`, newest first. */
export interface DonacionResumenDto {
  id: string;
  codigo: string;
  estado: EstadoDonacion;
  titulo: string | null;
  peso_estimado_kg: number;
  peso_recibido_kg: number | null;
  requiere_refrigeracion: boolean;
  ventana_recogida_inicio: string;
  ventana_recogida_fin: string;
  direccion_recogida: string;
  score_urgencia: number | null;
  publicada_at: string | null;
  expira_publicacion_at: string | null;
  created_at: string;
  almacen_destino: { id: string; nombre: string } | null;
  cantidad_productos: number;
}

export interface DonacionItemDto {
  id: string;
  descripcion: string | null;
  cantidad: number;
  peso_estimado_kg: number;
  peso_real_kg: number | null;
  /** Date only: read the first 10 characters. */
  fecha_vencimiento: string | null;
  requiere_refrigeracion: boolean;
  observaciones: string | null;
  tipo_alimento: { id: number; codigo: string; nombre: string };
  unidad_medida: { id: number; codigo: string; nombre: string };
  /** Signed read URL, valid for 5 minutes. */
  foto_url: string | null;
}

/** The live (or completed) assignment of a donation. */
export interface AsignacionDonacionDto {
  id: string;
  estado: EstadoAsignacion;
  intento: number;
  expira_at: string;
  aceptada_at: string | null;
  ruta_id: string | null;
  flota_banco: boolean;
  /**
   * Whether the current user already rated this assignment (`POST …/calificacion`). Added by
   * API-08: an API without it reads as not rated (a repeat rating is harmless, it answers 200).
   */
  calificada_por_mi?: boolean;
  /** Shown to the owner once accepted; phone and plate only after acceptance. */
  voluntario: {
    nombres: string;
    apellidos: string | null;
    telefono: string | null;
    placa_vehiculo: string | null;
    tipo_vehiculo: string;
  } | null;
}

/** `GET /donaciones/:id` (also the answer of create, update, publish and cancel). */
export interface DonacionDetalleDto {
  id: string;
  codigo: string;
  estado: EstadoDonacion;
  modo_recoleccion: ModoRecoleccion;
  titulo: string | null;
  descripcion: string | null;
  peso_estimado_kg: number;
  peso_recogido_kg: number | null;
  peso_recibido_kg: number | null;
  requiere_refrigeracion: boolean;
  /** Date only: read the first 10 characters. */
  fecha_vencimiento_min: string | null;
  ventana_recogida_inicio: string;
  ventana_recogida_fin: string;
  direccion_recogida: string;
  referencia_recogida: string | null;
  ubicacion_recogida: Coordenada;
  score_urgencia: number | null;
  publicada_at: string | null;
  expira_publicacion_at: string | null;
  asignada_at: string | null;
  recogida_at: string | null;
  entregada_at: string | null;
  recibida_at: string | null;
  cancelada_at: string | null;
  observacion_cancelacion: string | null;
  created_at: string;
  updated_at: string;
  almacen_destino: {
    id: string;
    nombre: string;
    direccion: string;
    tipo: TipoAlmacenamiento;
  } | null;
  motivo_cancelacion: { codigo: string; nombre: string } | null;
  /** Hidden from a volunteer until they accept. */
  contacto: { nombre: string; telefono: string | null } | null;
  items: DonacionItemDto[];
  asignacion: AsignacionDonacionDto | null;
}

/** `POST /donaciones/:id/publicar`. */
export interface DonacionPublicadaDto extends DonacionDetalleDto {
  /** False when the matching could not start yet (the API retries it on its own). */
  oferta_en_curso: boolean;
}

export type AmbitoHistorial = "DONACION" | "ASIGNACION" | "PARADA" | "RUTA" | "INCIDENCIA" | "LOTE";

/** A row of `GET /donaciones/:id/historial`: the donation, its assignments and stops. */
export interface HistorialEstadoDto {
  id: number;
  ambito: AmbitoHistorial;
  estado_anterior: string | null;
  estado_nuevo: string;
  motivo: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  donacion_id: string | null;
  asignacion_id: string | null;
  parada_id: string | null;
  usuario_nombres: string | null;
  lat: number | null;
  lng: number | null;
}

/** Where the volunteer carries the donation: to its pickup point, then to the bank. */
export type FaseSeguimiento = "HACIA_RECOGIDA" | "HACIA_BANCO";

/**
 * `GET /donaciones/:id/seguimiento` (API-06): the volunteer on the way to the donor's pickup
 * and then to the bank, until delivery. It never names the route's other stops, only how
 * many come first.
 */
export interface SeguimientoDonacionDto {
  donacion_id: string;
  estado_donacion: EstadoDonacion;
  /** Inside the live window: the route is in progress and the donation not delivered yet. */
  activo: boolean;
  fase: FaseSeguimiento | null;
  /** Only while `activo`: the private Realtime channel `ruta:<id>` the donor may listen to. */
  ruta_id: string | null;
  /** Open stops the volunteer visits before the donor's target (pickup or bank). */
  paradas_antes: number;
  recogida: Coordenada & { direccion: string };
  banco: (Coordenada & { id: string; nombre: string; direccion: string }) | null;
  /** The volunteer's last stored sample (`ultima_ubicacion`, at most 30 min old). */
  voluntario_posicion: (Coordenada & { at: string; fuente: "ULTIMA_UBICACION" }) | null;
  /** Path and arrival estimate to the target, only when it is the volunteer's next stop. */
  tramo: NonNullable<SeguimientoDto["tramo"]> | null;
}

// --- Requests ----------------------------------------------------------------------------

const donacionPath = (id: string) => `/donaciones/${encodeURIComponent(id)}`;

export function getDonaciones(
  filters: DonacionesFilters = {},
  signal?: AbortSignal,
): Promise<Paged<DonacionResumenDto>> {
  return api.get<Paged<DonacionResumenDto>>("/donaciones", { query: filters, signal });
}

export function getDonacion(id: string, signal?: AbortSignal): Promise<DonacionDetalleDto> {
  return api.get<DonacionDetalleDto>(donacionPath(id), { signal });
}

export function getHistorialDonacion(
  id: string,
  signal?: AbortSignal,
): Promise<HistorialEstadoDto[]> {
  return api.get<HistorialEstadoDto[]>(`${donacionPath(id)}/historial`, { signal });
}

export function getSeguimientoDonacion(
  id: string,
  signal?: AbortSignal,
): Promise<SeguimientoDonacionDto> {
  return api.get<SeguimientoDonacionDto>(`${donacionPath(id)}/seguimiento`, { signal });
}

export function crearDonacion(body: CrearDonacionBody): Promise<DonacionDetalleDto> {
  return api.post<DonacionDetalleDto>("/donaciones", { body });
}

export function actualizarDonacion(
  id: string,
  body: ActualizarDonacionBody,
): Promise<DonacionDetalleDto> {
  return api.patch<DonacionDetalleDto>(donacionPath(id), { body });
}

export function publicarDonacion(id: string): Promise<DonacionPublicadaDto> {
  return api.post<DonacionPublicadaDto>(`${donacionPath(id)}/publicar`);
}

export function cancelarDonacion(
  id: string,
  body: CancelarDonacionBody,
): Promise<DonacionDetalleDto> {
  return api.post<DonacionDetalleDto>(`${donacionPath(id)}/cancelar`, { body });
}

// --- Queries -----------------------------------------------------------------------------

export function donacionesQuery(filters: DonacionesFilters = {}) {
  return queryOptions({
    queryKey: queryKeys.donaciones.list(filters),
    queryFn: ({ signal }) => getDonaciones(filters, signal),
  });
}

export function donacionQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.donaciones.detail(id),
    queryFn: ({ signal }) => getDonacion(id, signal),
  });
}

export function historialDonacionQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.donaciones.historial(id),
    queryFn: ({ signal }) => getHistorialDonacion(id, signal),
  });
}

export function seguimientoDonacionQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.donaciones.seguimiento(id),
    queryFn: ({ signal }) => getSeguimientoDonacion(id, signal),
  });
}

export function useDonaciones(filters: DonacionesFilters = {}) {
  return useQuery(donacionesQuery(filters));
}

export function useDonacion(id: string) {
  return useQuery(donacionQuery(id));
}

export function useHistorialDonacion(id: string) {
  return useQuery(historialDonacionQuery(id));
}

// --- Mutations ---------------------------------------------------------------------------

export type ActualizarDonacionVariables = { id: string; body: ActualizarDonacionBody };
export type CancelarDonacionVariables = { id: string; body: CancelarDonacionBody };

const { donaciones } = queryKeys;

/** What each mutation leaves stale. */
const invalidates = {
  /** A new draft shows up in the lists. */
  crear: () => [donaciones.lists()],
  /** Fields change, the state does not: the history stays as it is. */
  actualizar: (_: unknown, { id }: ActualizarDonacionVariables) => [
    donaciones.lists(),
    donaciones.detail(id),
  ],
  /** State change, recorded in the history. */
  publicar: (_: unknown, id: string) => [
    donaciones.lists(),
    donaciones.detail(id),
    donaciones.historial(id),
  ],
  /** State change, recorded in the history (its live offer closes too). */
  cancelar: (_: unknown, { id }: CancelarDonacionVariables) => [
    donaciones.lists(),
    donaciones.detail(id),
    donaciones.historial(id),
  ],
} satisfies Record<string, Invalidation<never, never>>;

export function useCrearDonacionMutation() {
  return useMutation({
    mutationFn: crearDonacion,
    onSuccess: invalidateOnSuccess(invalidates.crear),
  });
}

export function useActualizarDonacionMutation() {
  return useMutation({
    mutationFn: ({ id, body }: ActualizarDonacionVariables) => actualizarDonacion(id, body),
    onSuccess: invalidateOnSuccess(invalidates.actualizar),
  });
}

export function usePublicarDonacionMutation() {
  return useMutation({
    mutationFn: publicarDonacion,
    onSuccess: invalidateOnSuccess(invalidates.publicar),
  });
}

export function useCancelarDonacionMutation() {
  return useMutation({
    mutationFn: ({ id, body }: CancelarDonacionVariables) => cancelarDonacion(id, body),
    onSuccess: invalidateOnSuccess(invalidates.cancelar),
  });
}
