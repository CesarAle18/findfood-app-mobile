/**
 * Offers and assignments of the signed-in volunteer (`/asignaciones`), and the mutual
 * rating after a completed pickup.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/api";
import type { EstadoAsignacion, EstadoDonacion } from "@/api/types";

import { invalidateOnSuccess, queryKeys, type Invalidation } from "./query-keys";

// --- DTOs ------------------------------------------------------------------------------

export interface OfertaProductoDto {
  /** Food type name. */
  tipo: string;
  cantidad: number;
  /** Unit code (KG, L, …). */
  unidad: string;
  peso_estimado_kg: number;
  requiere_refrigeracion: boolean;
}

/**
 * A row of `GET /asignaciones/ofertas`: live offers (OFRECIDA, not expired) and accepted
 * assignments, accepted first. The donor's contact is only filled once accepted.
 */
export interface OfertaDto {
  id: string;
  estado: Extract<EstadoAsignacion, "OFRECIDA" | "ACEPTADA">;
  intento: number;
  ofrecida_at: string;
  expira_at: string;
  aceptada_at: string | null;
  distancia_km: number | null;
  ruta_id: string | null;
  donacion_id: string;
  codigo: string;
  titulo: string | null;
  donacion_estado: EstadoDonacion;
  peso_estimado_kg: number;
  requiere_refrigeracion: boolean;
  ventana_recogida_inicio: string;
  ventana_recogida_fin: string;
  direccion_recogida: string;
  referencia_recogida: string | null;
  lat: number;
  lng: number;
  almacen_id: string | null;
  almacen_nombre: string | null;
  almacen_direccion: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  /** Null when the donation has no products. */
  productos: OfertaProductoDto[] | null;
}

/** Reject (scope RECHAZO_ASIGNACION) or abandon (scope ABANDONO_ASIGNACION). */
export type RespuestaConMotivoBody = {
  motivo_id: number;
  observacion?: string;
};

/** `POST /asignaciones/:id/calificacion`: once per party, after COMPLETADA. */
export type CalificacionBody = {
  /** Integer 0-5. */
  puntaje: number;
  comentario?: string;
};

export interface RespuestaAsignacionDto {
  id: string;
  estado: EstadoAsignacion;
}

export interface AbandonoDto extends RespuestaAsignacionDto {
  /** False when the window left no room: the donation expired instead. */
  donacion_republicada: boolean;
}

export interface CalificacionDto {
  id: string;
  puntaje: number;
  comentario: string | null;
  created_at: string;
}

// --- Requests ----------------------------------------------------------------------------

const asignacionPath = (id: string) => `/asignaciones/${encodeURIComponent(id)}`;

export function getOfertas(signal?: AbortSignal): Promise<OfertaDto[]> {
  return api.get<OfertaDto[]>("/asignaciones/ofertas", { signal });
}

export function aceptarOferta(id: string): Promise<RespuestaAsignacionDto> {
  return api.post<RespuestaAsignacionDto>(`${asignacionPath(id)}/aceptar`);
}

export function rechazarOferta(
  id: string,
  body: RespuestaConMotivoBody,
): Promise<RespuestaAsignacionDto> {
  return api.post<RespuestaAsignacionDto>(`${asignacionPath(id)}/rechazar`, { body });
}

export function abandonarAsignacion(id: string, body: RespuestaConMotivoBody): Promise<AbandonoDto> {
  return api.post<AbandonoDto>(`${asignacionPath(id)}/abandonar`, { body });
}

export function calificarAsignacion(id: string, body: CalificacionBody): Promise<CalificacionDto> {
  return api.post<CalificacionDto>(`${asignacionPath(id)}/calificacion`, { body });
}

// --- Queries -----------------------------------------------------------------------------

export function ofertasQuery() {
  return queryOptions({
    queryKey: queryKeys.asignaciones.ofertas(),
    queryFn: ({ signal }) => getOfertas(signal),
  });
}

export function useOfertas() {
  return useQuery(ofertasQuery());
}

// --- Mutations ---------------------------------------------------------------------------

export type RespuestaConMotivoVariables = { id: string; body: RespuestaConMotivoBody };
export type CalificacionVariables = { id: string; body: CalificacionBody };

const { asignaciones, donaciones, rutas } = queryKeys;

/** What each mutation leaves stale. */
const invalidates = {
  /** The donation becomes ASIGNADA: its lists, detail and history change. */
  aceptar: () => [asignaciones.ofertas(), donaciones.all],
  /**
   * The donation stays PUBLICADA, but its detail no longer shows this offer and its history
   * records the rejected assignment. The response carries no donation id, so every history.
   */
  rechazar: () => [asignaciones.ofertas(), donaciones.details(), donaciones.historiales()],
  /**
   * The donation is published again (or expires) and its stop leaves the route, which also
   * changes the stop count and weight shown in route lists.
   */
  abandonar: () => [asignaciones.ofertas(), donaciones.all, rutas.lists(), rutas.details()],
  /** Ratings only change the other party's averages, which no query of this user shows. */
  calificar: () => [],
} satisfies Record<string, Invalidation<never, never>>;

export function useAceptarOfertaMutation() {
  return useMutation({
    mutationFn: aceptarOferta,
    onSuccess: invalidateOnSuccess(invalidates.aceptar),
  });
}

export function useRechazarOfertaMutation() {
  return useMutation({
    mutationFn: ({ id, body }: RespuestaConMotivoVariables) => rechazarOferta(id, body),
    onSuccess: invalidateOnSuccess(invalidates.rechazar),
  });
}

export function useAbandonarAsignacionMutation() {
  return useMutation({
    mutationFn: ({ id, body }: RespuestaConMotivoVariables) => abandonarAsignacion(id, body),
    onSuccess: invalidateOnSuccess(invalidates.abandonar),
  });
}

export function useCalificarAsignacionMutation() {
  return useMutation({
    mutationFn: ({ id, body }: CalificacionVariables) => calificarAsignacion(id, body),
    onSuccess: invalidateOnSuccess(invalidates.calificar),
  });
}
