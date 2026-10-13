/**
 * In-app inbox of the signed-in user (`/me/notificaciones`), newest first.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/api";
import type { Paged, Paginacion } from "@/api/types";

import { invalidateOnSuccess, queryKeys, type Invalidation } from "./query-keys";

// --- DTOs ------------------------------------------------------------------------------

export type NotificacionesFilters = Paginacion & { solo_no_leidas?: boolean };

export interface NotificacionDto {
  id: string;
  /** Notification type code, e.g. ASIGNACION_ACEPTADA, DONACION_EXPIRADA. */
  tipo: string;
  titulo: string;
  cuerpo: string;
  /** Push payload (ids of the related donation or assignment, …). */
  data: Record<string, unknown> | null;
  donacion_id: string | null;
  asignacion_id: string | null;
  leida_at: string | null;
  created_at: string;
}

/** `GET /me/notificaciones`: a page plus the user's total unread count. */
export interface BandejaDto extends Paged<NotificacionDto> {
  no_leidas: number;
}

// --- Requests ----------------------------------------------------------------------------

const BANDEJA_PATH = "/me/notificaciones";

export function getNotificaciones(
  filters: NotificacionesFilters = {},
  signal?: AbortSignal,
): Promise<BandejaDto> {
  return api.get<BandejaDto>(BANDEJA_PATH, { query: filters, signal });
}

/** The API has no count endpoint: the smallest page of unread carries `no_leidas`. */
export async function getNotificacionesNoLeidas(signal?: AbortSignal): Promise<number> {
  const bandeja = await api.get<BandejaDto>(BANDEJA_PATH, {
    query: { solo_no_leidas: true, limite: 1 },
    signal,
  });
  return bandeja.no_leidas;
}

/** Also cancels its push if it was still queued. Answers 204. */
export function marcarNotificacionLeida(id: string): Promise<void> {
  return api.post<void>(`${BANDEJA_PATH}/${encodeURIComponent(id)}/leer`);
}

export function marcarTodasLeidas(): Promise<{ actualizadas: number }> {
  return api.post<{ actualizadas: number }>(`${BANDEJA_PATH}/leer-todas`);
}

// --- Queries -----------------------------------------------------------------------------

export function notificacionesQuery(filters: NotificacionesFilters = {}) {
  return queryOptions({
    queryKey: queryKeys.notificaciones.list(filters),
    queryFn: ({ signal }) => getNotificaciones(filters, signal),
  });
}

export function notificacionesNoLeidasQuery() {
  return queryOptions({
    queryKey: queryKeys.notificaciones.unreadCount(),
    queryFn: ({ signal }) => getNotificacionesNoLeidas(signal),
  });
}

export function useNotificaciones(filters: NotificacionesFilters = {}) {
  return useQuery(notificacionesQuery(filters));
}

/** Unread count for badges. */
export function useNotificacionesNoLeidas() {
  return useQuery(notificacionesNoLeidasQuery());
}

// --- Mutations ---------------------------------------------------------------------------

const { notificaciones } = queryKeys;

/** What each mutation leaves stale. */
const invalidates = {
  /** Its row in every page, and the unread count. */
  leer: () => [notificaciones.lists(), notificaciones.unreadCount()],
  leerTodas: () => [notificaciones.lists(), notificaciones.unreadCount()],
} satisfies Record<string, Invalidation<never, never>>;

export function useMarcarNotificacionLeidaMutation() {
  return useMutation({
    mutationFn: marcarNotificacionLeida,
    onSuccess: invalidateOnSuccess(invalidates.leer),
  });
}

export function useMarcarTodasLeidasMutation() {
  return useMutation({
    mutationFn: () => marcarTodasLeidas(),
    onSuccess: invalidateOnSuccess(invalidates.leerTodas),
  });
}
