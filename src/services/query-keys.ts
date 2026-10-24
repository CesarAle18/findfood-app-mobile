/**
 * TanStack Query keys, in one place so mutations invalidate exactly what they affect.
 *
 * Keys are hierarchical: every key of a module starts with the module root, and
 * invalidation matches by prefix. So `queryKeys.donaciones.all` reaches every donation
 * query, `lists()` every list whatever its filters, and `detail(id)` only that detail:
 *
 *   ["donaciones"]                              all
 *   ["donaciones", "list"]                      lists()
 *   ["donaciones", "list", { estado }]          list(filters)
 *   ["donaciones", "detail"]                    details()
 *   ["donaciones", "detail", id]                detail(id)
 *   ["donaciones", "historial"]                 historiales()
 *   ["donaciones", "historial", id]             historial(id)
 *   ["donaciones", "seguimiento", id]           seguimiento(id)
 *
 * Roots never nest: `me` (GET /me) does not reach `perfil` (impact) or `notificaciones`,
 * although their routes live under /me.
 */
import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** Sorted and without repeats, so equal sets give equal keys and equal requests. */
export function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function entityKeys<Root extends string>(root: Root) {
  return {
    all: [root] as const,
    lists: () => [root, "list"] as const,
    list: (filters: object = {}) => [root, "list", filters] as const,
    details: () => [root, "detail"] as const,
    detail: (id: string) => [root, "detail", id] as const,
  };
}

const donaciones = entityKeys("donaciones");
const notificaciones = entityKeys("notificaciones");
const evidencias = entityKeys("evidencias");

export const queryKeys = {
  /** `GET /me`: the signed-in account, its roles and its pending steps. */
  me: ["me"] as const,
  perfil: {
    all: ["perfil"] as const,
    impacto: () => ["perfil", "impacto"] as const,
  },
  catalogos: {
    all: ["catalogos"] as const,
    /** `ambito` only filters `motivos`; null when absent so the key stays JSON-stable. */
    byIncluir: (incluir: readonly string[], ambito?: string) =>
      ["catalogos", sortedUnique(incluir), ambito ?? null] as const,
  },
  donaciones: {
    ...donaciones,
    /** Every donation history, for changes whose response does not name the donation. */
    historiales: () => ["donaciones", "historial"] as const,
    historial: (id: string) => ["donaciones", "historial", id] as const,
    /** The live tracking of one donation (`GET /donaciones/:id/seguimiento`). */
    seguimiento: (id: string) => ["donaciones", "seguimiento", id] as const,
  },
  asignaciones: {
    all: ["asignaciones"] as const,
    ofertas: () => ["asignaciones", "ofertas"] as const,
  },
  rutas: entityKeys("rutas"),
  /** Lists only, one per parent (`{ parada_id }`, `{ donacion_id }`, …). */
  evidencias: {
    all: evidencias.all,
    lists: evidencias.lists,
    list: evidencias.list,
  },
  notificaciones: {
    all: notificaciones.all,
    lists: notificaciones.lists,
    list: notificaciones.list,
    unreadCount: () => ["notificaciones", "unreadCount"] as const,
  },
};

/** What a mutation leaves stale, from its result and its variables. */
export type Invalidation<TData, TVariables> = (
  data: TData,
  variables: TVariables,
) => readonly QueryKey[];

/**
 * Marks `keys` stale and refetches the ones on screen. Not awaited on purpose: the
 * mutation settles as soon as the server answers, and screens catch up in the background
 * (a slow refetch, with its retries, never holds a button in its loading state).
 */
export function invalidateKeys(client: QueryClient, keys: readonly QueryKey[]): void {
  for (const queryKey of keys) void client.invalidateQueries({ queryKey });
}

/** `onSuccess` for `useMutation` that invalidates what `invalidation` returns. */
export function invalidateOnSuccess<TData, TVariables>(
  invalidation: Invalidation<TData, TVariables>,
) {
  return (
    data: TData,
    variables: TVariables,
    _onMutateResult: unknown,
    context: { client: QueryClient },
  ): void => {
    invalidateKeys(context.client, invalidation(data, variables));
  };
}
