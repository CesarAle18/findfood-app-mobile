/**
 * Donation queries shaped for the donor and volunteer screens: requests come from
 * `@/services/donaciones`, and `select` maps them to the presentation model. A field the app
 * cannot read falls back on its own (see `donationRowFromResumen`, `donationViewFromDetalle`);
 * any other mapping failure surfaces as the query's error (ErrorState) instead of crashing
 * the screen.
 */
import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";

import type { EstadoDonacion, Paged } from "@/api/types";
import { fromIsoToBogota } from "@/domain/mappers/dates";
import {
  donationRowFromResumen,
  donationViewFromDetalle,
  type DonationView,
} from "@/domain/mappers/donations";
import { MappingError } from "@/domain/mappers/errors";
import {
  donacionesQuery,
  donacionQuery,
  getDonaciones,
  type DonacionDetalleDto,
  type DonacionResumenDto,
} from "@/services/donaciones";
import { queryKeys } from "@/services/query-keys";

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

export type DonationFilter = "todas" | "seguimiento" | "entregadas";

export function matchesFilter(estado: EstadoDonacion, filter: DonationFilter): boolean {
  if (filter === "seguimiento") return isTracking(estado);
  if (filter === "entregadas") return isDelivered(estado);
  return true;
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
  return { dto, view: donationViewFromDetalle(dto, Date.now()) };
}

/** The `?id=` (donation UUID) of the current route, or undefined when absent or empty. */
export function useDonationId(): string | undefined {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return typeof id === "string" && id !== "" ? id : undefined;
}

/** `GET /donaciones/:id`; idle without an id (the screen shows its empty state). */
export function useDonationDetail(id: string | undefined) {
  return useQuery({
    ...donacionQuery(id ?? ""),
    enabled: Boolean(id),
    select: selectDetail,
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
