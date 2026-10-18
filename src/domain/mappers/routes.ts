/**
 * Pure helpers over a volunteer's route (`GET /rutas/:id`) and offers
 * (`GET /asignaciones/ofertas`), shared by Home, Rutas and the stop screens.
 */
import type { EstadoParada } from "@/api/types";
import type { OfertaDto } from "@/services/asignaciones";
import type { ParadaRutaDto } from "@/services/rutas";

import { fromPickupWindow } from "./dates";
import { MappingError } from "./errors";

/** Mirrors the API parameter `MAX_PARADAS_POR_RUTA` (pickups; the delivery is added). */
export const MAX_STOPS_PER_ROUTE = 5;

/** A stop the volunteer still has to visit (EN_SITIO: arrived, not confirmed yet). */
const OPEN_STOP_STATES: readonly EstadoParada[] = ["PENDIENTE", "EN_SITIO"];

type Stop = Pick<ParadaRutaDto, "id" | "orden" | "estado">;

const byOrder = <T extends Stop>(paradas: readonly T[]): T[] =>
  [...paradas].sort((a, b) => a.orden - b.orden);

const isOpen = (parada: Stop) => OPEN_STOP_STATES.includes(parada.estado);

/** The stops still to visit, in visiting order. */
export function pendingStops<T extends Stop>(paradas: readonly T[]): T[] {
  return byOrder(paradas).filter(isOpen);
}

/** The first stop still to visit, or null once every stop is closed. */
export function nextStop<T extends Stop>(paradas: readonly T[]): T | null {
  return pendingStops(paradas)[0] ?? null;
}

/** `2 de 3`: the stop's position in visiting order. */
export function stopProgress(paradas: readonly Stop[], parada: Stop): string {
  const position = byOrder(paradas).findIndex((other) => other.id === parada.id) + 1;
  return `${position} de ${paradas.length}`;
}

/** Kilograms confirmed at the completed pickups. */
export function collectedKg(
  paradas: readonly Pick<ParadaRutaDto, "tipo" | "estado" | "peso_confirmado_kg">[],
): number {
  return paradas.reduce(
    (total, parada) =>
      parada.tipo === "RECOGIDA" && parada.estado === "COMPLETADA"
        ? total + (parada.peso_confirmado_kg ?? 0)
        : total,
    0,
  );
}

/** Offers the volunteer can still accept or reject. */
export function liveOffers(ofertas: readonly OfertaDto[]): OfertaDto[] {
  return ofertas.filter((oferta) => oferta.estado === "OFRECIDA");
}

/** Accepted pickups waiting for the volunteer to put them in a route. */
export function acceptedWithoutRoute(ofertas: readonly OfertaDto[]): OfertaDto[] {
  return ofertas.filter((oferta) => oferta.estado === "ACEPTADA" && oferta.ruta_id === null);
}

/**
 * The assignment of each accepted donation: route stops only name the donation, and
 * abandoning needs the assignment.
 */
export function asignacionByDonacion(ofertas: readonly OfertaDto[]): Map<string, string> {
  return new Map(
    ofertas
      .filter((oferta) => oferta.estado === "ACEPTADA")
      .map((oferta) => [oferta.donacion_id, oferta.id]),
  );
}

/**
 * Why the selected pickups cannot form a route, checked before `POST /rutas`; null when
 * they can. The server still checks dates, capacity and feasibility.
 */
export function validateRouteSelection(
  selected: readonly Pick<OfertaDto, "almacen_id">[],
): string | null {
  if (selected.length === 0) return "Selecciona al menos una recogida para armar la ruta.";
  if (selected.length > MAX_STOPS_PER_ROUTE) {
    return `Una ruta admite como máximo ${MAX_STOPS_PER_ROUTE} recogidas.`;
  }
  if (new Set(selected.map((oferta) => oferta.almacen_id)).size > 1) {
    return "Las recogidas seleccionadas van a almacenes distintos. Elige recogidas del mismo almacén.";
  }
  return null;
}

/**
 * The display line of a pickup window, or null without one (the delivery stop) or when the
 * API sent an unreadable one: a stop never disappears over its window.
 */
export function pickupWindowLabel(inicio: string | null, fin: string | null): string | null {
  if (inicio === null || fin === null) return null;
  try {
    return fromPickupWindow(inicio, fin).display;
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return null;
  }
}
