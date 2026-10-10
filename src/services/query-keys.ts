/**
 * TanStack Query keys, in one place so mutations invalidate exactly what they affect.
 *
 * Each API module gets its own namespace whose keys all start with the module root, so
 * `invalidateQueries({ queryKey: queryKeys.<module>.all })` reaches every query of the
 * module. New modules are added as new namespaces, e.g.:
 *
 *   donaciones: {
 *     all: ["donaciones"] as const,
 *     list: (filters: DonacionesFilters) => ["donaciones", "list", filters] as const,
 *     detail: (id: string) => ["donaciones", "detail", id] as const,
 *   },
 */
export const queryKeys = {
  /** `GET /me`: the signed-in account, its roles and its pending steps. */
  me: ["me"] as const,
};
