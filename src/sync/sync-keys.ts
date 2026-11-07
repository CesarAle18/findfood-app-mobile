/**
 * What a change made elsewhere leaves stale, in one place for every signal that announces
 * one: the Realtime `sync` events (`keysForSyncEvent`) and the pushes received or tapped
 * (`keysForPushData`). Signals only invalidate: queries on screen refetch, the others go
 * stale and refetch when their screen opens.
 *
 * Signals are role-agnostic: one user can be donor and volunteer at once, and a query
 * that is not cached costs nothing to invalidate.
 */
import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/services/query-keys";

import type { SyncEvent } from "./sync-event";

/** One `invalidateQueries` filter: the key and every key under it, unless `exact`. */
export interface SyncTarget {
  queryKey: QueryKey;
  exact?: boolean;
}

/**
 * The fields of a push `data` (`{ tipo, donacion_id?, asignacion_id?, notificacion_id }`)
 * that name what changed. A notification about to open, or a `notificacion` sync event,
 * has the same fields.
 */
export type PushData = Readonly<{ tipo?: unknown; donacion_id?: unknown; asignacion_id?: unknown }>;

const { asignaciones, donaciones, me, notificaciones, perfil, rutas } = queryKeys;

const prefix = (queryKey: QueryKey): SyncTarget => ({ queryKey });

/**
 * Only the route itself: its live ETA (`seguimientoKey` of `@/location/live-route`) is
 * nested under the detail and calls Google on every fetch, so signals never refetch it.
 */
const routeDetail = (id: string): SyncTarget[] => [{ queryKey: rutas.detail(id), exact: true }];

/** One donation's detail and history. */
const donationDetail = (id: string): SyncTarget[] => [
  prefix(donaciones.detail(id)),
  prefix(donaciones.historial(id)),
];

/** Its detail and history, and the donor's live tracking of it. */
const donationProgress = (id: string): SyncTarget[] => [
  ...donationDetail(id),
  prefix(donaciones.seguimiento(id)),
];

/** `targets(id)` when there is an id, nothing otherwise. */
const ifId = (id: string | null | undefined, targets: (id: string) => SyncTarget[]) =>
  id ? targets(id) : [];

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/** What a Realtime `sync` event leaves stale. */
export function keysForSyncEvent(event: SyncEvent): SyncTarget[] {
  switch (event.entidad) {
    // A state change moves it between tabs, counts in the donor's impact and opens or
    // closes the volunteers' offers and route stops.
    case "donacion":
      return [
        prefix(donaciones.lists()),
        ...ifId(event.id, donationProgress),
        prefix(perfil.impacto()),
        prefix(asignaciones.ofertas()),
        prefix(rutas.lists()),
      ];
    // An offer made, accepted, rejected or expired: the volunteer's offers, the donor's
    // view of who picks the donation up, and the route that takes it.
    case "asignacion":
      return [
        prefix(asignaciones.ofertas()),
        ...ifId(event.donacion_id, donationDetail),
        prefix(rutas.lists()),
        ...ifId(event.ruta_id, routeDetail),
      ];
    // An arrival, a pickup or a delivery: the route and the donation's progress (a
    // delivery stop names no donation).
    case "parada":
      return [
        ...ifId(event.ruta_id, routeDetail),
        prefix(rutas.lists()),
        ...ifId(event.donacion_id, donationProgress),
      ];
    // Planned, started, cancelled or finished by the volunteer or the staff.
    case "ruta":
      return [
        prefix(rutas.lists()),
        ...ifId(event.id, routeDetail),
        prefix(asignaciones.ofertas()),
        prefix(donaciones.lists()),
      ];
    case "notificacion":
      return keysForPushData(event);
    // Approval, suspension or a change of roles, made by the staff.
    case "cuenta":
      return [prefix(me), prefix(perfil.all)];
  }
}

/**
 * What a push leaves stale by its `tipo`: a new offer, the offers; a cancelled donation
 * can drop an accepted offer and a stop from a route; a reviewed volunteer request changes
 * `GET /me` (its state and, once approved, the VOLUNTARIO role), which nothing else would
 * fetch again while the app stays open.
 */
function targetsForTipo(tipo: string | null): SyncTarget[] {
  switch (tipo) {
    case "VERIFICACION_APROBADA":
    case "VERIFICACION_RECHAZADA":
      return [prefix(me)];
    case "ASIGNACION_OFRECIDA":
      return [prefix(asignaciones.ofertas())];
    case "DONACION_CANCELADA":
      return [prefix(asignaciones.ofertas()), prefix(rutas.all)];
    default:
      return [];
  }
}

/**
 * What a push (received or tapped) leaves stale: the inbox and its badge, the donation it
 * is about wherever it shows (its detail, history, tracking, the lists and the donor's
 * impact), and what its `tipo` changes.
 */
export function keysForPushData(data: PushData | null | undefined): SyncTarget[] {
  return [
    prefix(notificaciones.all),
    ...ifId(optionalString(data?.donacion_id), (id) => [
      ...donationProgress(id),
      prefix(donaciones.lists()),
      prefix(perfil.impacto()),
    ]),
    ...targetsForTipo(optionalString(data?.tipo)),
  ];
}

/**
 * Invalidates each target once; a key asked for both exactly and by prefix keeps the
 * prefix. `cancelRefetch: false` keeps a refetch already in flight instead of restarting
 * it, so a burst of signals costs one request. Not awaited, like `invalidateKeys`.
 */
export function invalidateTargets(client: QueryClient, targets: readonly SyncTarget[]): void {
  const unique = new Map<string, SyncTarget>();
  for (const target of targets) {
    const hash = hashKey(target.queryKey);
    const seen = unique.get(hash);
    if (!seen || (seen.exact && !target.exact)) unique.set(hash, target);
  }
  for (const { queryKey, exact } of unique.values()) {
    const filters = exact ? { queryKey, exact } : { queryKey };
    void client.invalidateQueries(filters, { cancelRefetch: false });
  }
}
