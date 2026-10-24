/**
 * Donation queries shaped for the donor and volunteer screens: requests come from
 * `@/services/donaciones`, and `select` maps them to the presentation model. A field the app
 * cannot read falls back on its own (see `donationRowFromResumen`, `tolerantDonationFromDetalle`);
 * any other mapping failure surfaces as the query's error (ErrorState) instead of crashing
 * the screen.
 */
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";

import type { EstadoDonacion, Paged } from "@/api/types";
import { fromIsoToBogota } from "@/domain/mappers/dates";
import {
  donationRowFromResumen,
  tolerantDonationFromDetalle,
  type DonationView,
} from "@/domain/mappers/donations";
import { MappingError } from "@/domain/mappers/errors";
import {
  donacionesQuery,
  donacionQuery,
  getDonaciones,
  historialDonacionQuery,
  seguimientoDonacionQuery,
  type DonacionDetalleDto,
  type DonacionResumenDto,
  type HistorialEstadoDto,
  type SeguimientoDonacionDto,
} from "@/services/donaciones";
import { invalidateKeys, queryKeys } from "@/services/query-keys";

export const DONATIONS_PAGE_SIZE = 20;

/** States the donor follows live: from publishing until the volunteer reaches the bank. */
const TRACKING_STATES: ReadonlySet<EstadoDonacion> = new Set<EstadoDonacion>([
  "PUBLICADA",
  "ASIGNADA",
  "EN_RECOLECCION",
  "EN_TRANSITO",
]);

/** Handed over at the bank (received or waiting for the bank's check). */
const DELIVERED_STATES: ReadonlySet<EstadoDonacion> = new Set<EstadoDonacion>([
  "ENTREGADA",
  "RECIBIDA",
]);

export const isTracking = (estado: EstadoDonacion) => TRACKING_STATES.has(estado);
export const isDelivered = (estado: EstadoDonacion) => DELIVERED_STATES.has(estado);

/**
 * The tabs of Mis donaciones: En seguimiento = PUBLICADA…EN_TRANSITO, Entregadas =
 * ENTREGADA/RECIBIDA, Todas = every state (drafts, cancelled, expired… included).
 */
export type DonationFilter = "todas" | "seguimiento" | "entregadas";

export function matchesFilter(estado: EstadoDonacion, filter: DonationFilter): boolean {
  if (filter === "seguimiento") return isTracking(estado);
  if (filter === "entregadas") return isDelivered(estado);
  return true;
}

/**
 * The loaded rows a tab shows. `GET /donaciones` filters by one `estado` only, so the tabs
 * filter the loaded pages here; Todas keeps the same array (stable list data).
 */
export function filterDonations(rows: DonationView[], filter: DonationFilter): DonationView[] {
  return filter === "todas" ? rows : rows.filter((row) => matchesFilter(row.estado, filter));
}

export interface DonationPages {
  rows: DonationView[];
  /** Every donation of the donor, loaded or not. */
  total: number;
}

/** The next page's offset, or undefined after the last page. */
export function nextOffset(last: Paged<unknown>): number | undefined {
  const next = last.desplazamiento + last.datos.length;
  return last.datos.length > 0 && next < last.total ? next : undefined;
}

/**
 * The loaded pages as one list. Offsets shift when a donation is created between two page
 * requests, so a row can come back on the next page: only its first copy is kept (ids are
 * the list keys).
 */
export function selectPages(data: InfiniteData<Paged<DonacionResumenDto>>): DonationPages {
  const now = Date.now();
  const seen = new Set<string>();
  const rows: DonationView[] = [];
  for (const dto of data.pages.flatMap((page) => page.datos)) {
    if (seen.has(dto.id)) continue;
    seen.add(dto.id);
    // Tolerant: one row with a window the app cannot read never fails the whole list.
    rows.push(donationRowFromResumen(dto, now));
  }
  return { rows, total: data.pages[0]?.total ?? 0 };
}

/** `GET /donaciones`, newest first, one page of `DONATIONS_PAGE_SIZE` at a time. */
export function useDonationPages() {
  return useInfiniteQuery({
    // Under `lists()`, so every donation mutation invalidates it too.
    queryKey: queryKeys.donaciones.list({ paginas: DONATIONS_PAGE_SIZE }),
    queryFn: ({ pageParam, signal }) =>
      getDonaciones({ limite: DONATIONS_PAGE_SIZE, desplazamiento: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    select: selectPages,
  });
}

function selectLatest(page: Paged<DonacionResumenDto>): DonationView | null {
  const latest = page.datos[0];
  return latest ? donationRowFromResumen(latest, Date.now()) : null;
}

/** The donor's newest donation, or null when there is none. */
export function useLatestDonation() {
  return useQuery({ ...donacionesQuery({ limite: 1 }), select: selectLatest });
}

export interface DonationDetail {
  dto: DonacionDetalleDto;
  view: DonationView;
}

function selectDetail(dto: DonacionDetalleDto): DonationDetail {
  // Tolerant field by field, like the list: an unreadable window or expiry never hides the
  // donation the list already shows.
  return { dto, view: tolerantDonationFromDetalle(dto, Date.now()) };
}

/** The `?id=` (donation UUID) of the current route, or undefined when absent or empty. */
export function useDonationId(): string | undefined {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return typeof id === "string" && id !== "" ? id : undefined;
}

/**
 * `GET /donaciones/:id`; idle without an id (the screen shows its empty state). With `live`,
 * it polls while PUBLICADA (`pollWhilePublished`), only in the foreground.
 */
export function useDonationDetail(id: string | undefined, { live = false } = {}) {
  return useQuery({
    ...donacionQuery(id ?? ""),
    enabled: Boolean(id),
    select: selectDetail,
    refetchInterval: live ? pollWhilePublished : false,
    refetchIntervalInBackground: false,
  });
}

/** `DD/MM/AAAA · HH:mm` in Bogotá, or null without a (readable) timestamp. */
export function formatInstant(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const { date, time } = fromIsoToBogota(iso);
    return `${date} · ${time}`;
  } catch (error) {
    // Only an unreadable timestamp reads as "no data"; anything else is a bug.
    if (!(error instanceof MappingError)) throw error;
    return null;
  }
}

/** `HH:mm` in Bogotá, or null without a (readable) timestamp. */
export function formatTimeOfDay(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return fromIsoToBogota(iso).time;
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return null;
  }
}

/** How often a published donation is fetched again while it waits for a volunteer. */
export const PUBLISHED_POLL_MS = 15_000;

/**
 * `refetchInterval` of the published donation: poll only while PUBLICADA (the API assigns a
 * volunteer on its own). Reads the raw detail, as TanStack hands it before `select`.
 */
export function pollWhilePublished(query: {
  state: { data?: Pick<DonacionDetalleDto, "estado"> };
}): number | false {
  return query.state.data?.estado === "PUBLICADA" ? PUBLISHED_POLL_MS : false;
}

/** States the API lets the donor cancel from. */
const CANCELLABLE_STATES: ReadonlySet<EstadoDonacion> = new Set<EstadoDonacion>([
  "BORRADOR",
  "PUBLICADA",
  "ASIGNADA",
  "EXPIRADA",
]);

export const canCancel = (estado: EstadoDonacion) => CANCELLABLE_STATES.has(estado);

/** The happy path of a published donation, in order. */
const FLOW: readonly EstadoDonacion[] = [
  "PUBLICADA",
  "ASIGNADA",
  "EN_RECOLECCION",
  "EN_TRANSITO",
  "ENTREGADA",
  "RECIBIDA",
];

export interface PublishedStep {
  label: string;
  /** When it happened (`DD/MM/AAAA · HH:mm`), or null when unknown or not reached. */
  at: string | null;
  reached: boolean;
  /** The next step the donation waits for. */
  current: boolean;
}

/** The latest history entry that moved the donation itself into `estado`. */
function enteredAt(historial: readonly HistorialEstadoDto[], estado: EstadoDonacion) {
  let latest: string | null = null;
  for (const row of historial) {
    if (row.ambito !== "DONACION" || row.estado_nuevo !== estado) continue;
    if (latest === null || Date.parse(row.created_at) > Date.parse(latest)) latest = row.created_at;
  }
  return latest;
}

/**
 * The steps of "Donación publicada", from the detail's own timestamps and, where it has
 * none (EN_RECOLECCION) or lost them (republished), from the state history.
 */
export function publishedSteps(
  dto: DonacionDetalleDto,
  historial: readonly HistorialEstadoDto[],
): PublishedStep[] {
  const rank = FLOW.indexOf(dto.estado);
  const steps: [string, EstadoDonacion, string | null][] = [
    ["Donación publicada", "PUBLICADA", dto.publicada_at ?? enteredAt(historial, "PUBLICADA")],
    ["Voluntario asignado", "ASIGNADA", dto.asignada_at ?? enteredAt(historial, "ASIGNADA")],
    ["En camino a recogida", "EN_RECOLECCION", enteredAt(historial, "EN_RECOLECCION")],
    ["Entregada en el banco", "ENTREGADA", dto.entregada_at ?? enteredAt(historial, "ENTREGADA")],
  ];
  const mapped = steps.map(([label, estado, iso]) => ({
    label,
    at: formatInstant(iso),
    // Off the flow (cancelled, expired…) only what has a timestamp was reached.
    reached: iso !== null || (rank >= 0 && rank >= FLOW.indexOf(estado)),
    current: false,
  }));
  const next = rank >= 0 ? mapped.findIndex((step) => !step.reached) : -1;
  if (next >= 0) mapped[next].current = true;
  return mapped;
}

/** `GET /donaciones/:id/historial`; idle without an id. */
export function useDonationHistory(id: string | undefined, refetchInterval: number | false) {
  return useQuery({
    ...historialDonacionQuery(id ?? ""),
    enabled: Boolean(id),
    refetchInterval,
    refetchIntervalInBackground: false,
  });
}

/** States in which a volunteer holds the donation and may be on the way with it. */
const LIVE_TRACKING_STATES: ReadonlySet<EstadoDonacion> = new Set<EstadoDonacion>([
  "ASIGNADA",
  "EN_RECOLECCION",
  "EN_TRANSITO",
]);

export const hasLiveTracking = (estado: EstadoDonacion) => LIVE_TRACKING_STATES.has(estado);

/** How often the live tracking is fetched again while the volunteer is on the way. */
export const TRACKING_POLL_MS = 30_000;

/** How often it is fetched while the window is still closed (the route has not started). */
export const TRACKING_IDLE_POLL_MS = 60_000;

/**
 * `refetchInterval` of the live tracking: fast inside the live window, slow until the
 * volunteer starts the route. `enabled` stops it once the donation leaves the live states.
 */
export function pollWhileActive(query: {
  state: { data?: Pick<SeguimientoDonacionDto, "activo"> };
}): number {
  return query.state.data?.activo ? TRACKING_POLL_MS : TRACKING_IDLE_POLL_MS;
}

/**
 * `GET /donaciones/:id/seguimiento` while a volunteer holds the donation (`estado` is the
 * detail's). It polls every 30 s inside the live window (60 s before the route starts), only
 * in the foreground. When the
 * window closes (delivered) or the tracking reports a state the detail does not show yet
 * (picked up), the detail and its history are refreshed, so the rest of Seguimiento follows.
 */
export function useDonationTracking(id: string | undefined, estado: EstadoDonacion | undefined) {
  const client = useQueryClient();
  const tracking = useQuery({
    ...seguimientoDonacionQuery(id ?? ""),
    enabled: Boolean(id) && estado !== undefined && hasLiveTracking(estado),
    refetchInterval: pollWhileActive,
    refetchIntervalInBackground: false,
  });
  const activo = tracking.data?.activo;
  const estadoSeguido = tracking.data?.estado_donacion;
  const wasActive = useRef(false);
  useEffect(() => {
    if (!id || activo === undefined) return;
    const closed = wasActive.current && !activo;
    wasActive.current = activo;
    if (closed || estadoSeguido !== estado) {
      invalidateKeys(client, [queryKeys.donaciones.detail(id), queryKeys.donaciones.historial(id)]);
    }
  }, [activo, estadoSeguido, estado, client, id]);
  return tracking;
}
