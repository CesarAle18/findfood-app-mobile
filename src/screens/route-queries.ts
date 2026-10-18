/**
 * The volunteer's current route, shared by Home and Rutas: the route in progress, else the
 * next planned one, with its detail. Both lists use the shared keys, so the location
 * tracking's EN_CURSO request and these screens read one cache entry.
 */
import { useQuery } from "@tanstack/react-query";

import { ROUTES_IN_PROGRESS, ROUTES_PLANNED, rutaQuery, rutasQuery } from "@/services/rutas";

export function useCurrentRoute({ enabled = true }: { enabled?: boolean } = {}) {
  const enCurso = useQuery({ ...rutasQuery(ROUTES_IN_PROGRESS), enabled });
  const planificadas = useQuery({ ...rutasQuery(ROUTES_PLANNED), enabled });
  const inProgress = enCurso.data?.datos[0] ?? null;
  const summary = inProgress ?? planificadas.data?.datos[0] ?? null;
  const ruta = useQuery({ ...rutaQuery(summary?.id ?? ""), enabled: enabled && summary !== null });

  const { refetch: refetchEnCurso } = enCurso;
  const { refetch: refetchPlanificadas } = planificadas;
  const { refetch: refetchRuta } = ruta;
  const refetch = async () => {
    // `refetch` ignores `enabled`: never ask for a detail without a route.
    await Promise.all([
      refetchEnCurso(),
      refetchPlanificadas(),
      ...(summary === null ? [] : [refetchRuta()]),
    ]);
  };

  // A route in progress settles the choice; otherwise the planned list must answer too.
  const plannedMatters = inProgress === null;
  const isPending =
    enCurso.isPending ||
    (plannedMatters && planificadas.isPending) ||
    (summary !== null && ruta.isPending);
  const isError =
    enCurso.isError || (plannedMatters && planificadas.isError) || (summary !== null && ruta.isError);

  return {
    /** The chosen row of `GET /rutas`; null when the volunteer has no open route. */
    summary,
    /** `GET /rutas/:id` of `summary` (disabled without one). */
    ruta,
    isPending: isPending && !isError,
    isError,
    /** The first failure among the requests that matter, for the error state. */
    error: isError
      ? (enCurso.error ?? (plannedMatters ? planificadas.error : null) ?? ruta.error)
      : null,
    refetch,
    totals: { enCurso: enCurso.data?.total ?? 0, planificadas: planificadas.data?.total ?? 0 },
  };
}
