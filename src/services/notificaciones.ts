/**
 * In-app inbox of the signed-in user (`/me/notificaciones`), newest first.
 */
import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { api } from "@/api";
import type { Paged, Paginacion } from "@/api/types";

import { queryKeys } from "./query-keys";

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

export const NOTIFICACIONES_PAGE_SIZE = 20;

/** Loaded inbox pages, as TanStack caches an infinite query. */
export type BandejaPages = InfiniteData<BandejaDto, number>;

/** The next page's offset, or undefined once `total` is reached. */
export function nextNotificacionesOffset(last: BandejaDto): number | undefined {
  const next = last.desplazamiento + last.limite;
  return last.limite > 0 && next < last.total ? next : undefined;
}

/**
 * `GET /me/notificaciones`, newest first, one page of `NOTIFICACIONES_PAGE_SIZE` at a time.
 * Under `lists()`, so the read mutations reach every filter.
 */
export function notificacionesQuery({ soloNoLeidas = false }: { soloNoLeidas?: boolean } = {}) {
  return infiniteQueryOptions({
    queryKey: queryKeys.notificaciones.list({ soloNoLeidas }),
    queryFn: ({ pageParam, signal }) =>
      getNotificaciones(
        { solo_no_leidas: soloNoLeidas, limite: NOTIFICACIONES_PAGE_SIZE, desplazamiento: pageParam },
        signal,
      ),
    initialPageParam: 0,
    getNextPageParam: nextNotificacionesOffset,
  });
}

export function notificacionesNoLeidasQuery() {
  return queryOptions({
    queryKey: queryKeys.notificaciones.unreadCount(),
    queryFn: ({ signal }) => getNotificacionesNoLeidas(signal),
  });
}

export function useNotificaciones(filter: { soloNoLeidas?: boolean } = {}) {
  return useInfiniteQuery(notificacionesQuery(filter));
}

/** Unread count for badges. */
export function useNotificacionesNoLeidas() {
  return useQuery(notificacionesNoLeidasQuery());
}

// --- Mutations ---------------------------------------------------------------------------

const { notificaciones } = queryKeys;

/** What the cache held before an optimistic read, to restore it if the request fails. */
interface InboxSnapshot {
  lists: [QueryKey, BandejaPages | undefined][];
  unread: number | undefined;
}

function isUnreadIn(data: BandejaPages | undefined, id: string): boolean {
  return !!data?.pages.some((page) => page.datos.some((row) => row.id === id && row.leida_at === null));
}

/**
 * Applies a read to every cached list page and to the badge count, after stopping the
 * fetches that would overwrite it. Returns the previous cache for `restoreInbox`.
 */
async function readOptimistically(
  client: QueryClient,
  markRow: (row: NotificacionDto) => boolean,
  unreadAfter: (unread: number) => number,
): Promise<InboxSnapshot> {
  await client.cancelQueries({ queryKey: notificaciones.all });
  const snapshot: InboxSnapshot = {
    lists: client.getQueriesData<BandejaPages>({ queryKey: notificaciones.lists() }),
    unread: client.getQueryData<number>(notificaciones.unreadCount()),
  };
  const leidaAt = new Date().toISOString();
  client.setQueriesData<BandejaPages>({ queryKey: notificaciones.lists() }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            no_leidas: unreadAfter(page.no_leidas),
            datos: page.datos.map((row) =>
              row.leida_at === null && markRow(row) ? { ...row, leida_at: leidaAt } : row,
            ),
          })),
        }
      : data,
  );
  if (snapshot.unread !== undefined) {
    client.setQueryData(notificaciones.unreadCount(), unreadAfter(snapshot.unread));
  }
  return snapshot;
}

function restoreInbox(client: QueryClient, snapshot: InboxSnapshot | undefined): void {
  if (!snapshot) return;
  for (const [queryKey, data] of snapshot.lists) client.setQueryData(queryKey, data);
  client.setQueryData(notificaciones.unreadCount(), snapshot.unread);
}

/** Settled either way: the server's counts replace the optimistic ones. */
function refetchInbox(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: notificaciones.all });
}

/** Marks one notification read at once (rows and counts); rolls back if the POST fails. */
export function useMarcarNotificacionLeidaMutation() {
  return useMutation({
    mutationFn: marcarNotificacionLeida,
    onMutate: async (id: string, { client }) => {
      const cached = client.getQueriesData<BandejaPages>({ queryKey: notificaciones.lists() });
      // Counts only drop when the row is unread somewhere in the cache (taps on read rows
      // and repeated taps leave them alone).
      if (!cached.some(([, data]) => isUnreadIn(data, id))) return undefined;
      return readOptimistically(
        client,
        (row) => row.id === id,
        (unread) => Math.max(0, unread - 1),
      );
    },
    onError: (_error, _id, snapshot, { client }) => restoreInbox(client, snapshot),
    onSettled: (_data, _error, _id, _snapshot, { client }) => refetchInbox(client),
  });
}

/** Marks every notification read at once; rolls back if the POST fails. */
export function useMarcarTodasLeidasMutation() {
  return useMutation({
    mutationFn: () => marcarTodasLeidas(),
    onMutate: (_variables: void, { client }) =>
      readOptimistically(
        client,
        () => true,
        () => 0,
      ),
    onError: (_error, _variables, snapshot, { client }) => restoreInbox(client, snapshot),
    onSettled: (_data, _error, _variables, _snapshot, { client }) => refetchInbox(client),
  });
}
