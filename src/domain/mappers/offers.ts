/**
 * Offers of `GET /asignaciones/ofertas` → what the offer screen shows, in Bogotá time.
 */
import type { Coordenada } from "@/api/types";
import type { OfertaDto } from "@/services/asignaciones";

import { fromIsoToBogota, fromPickupWindow } from "./dates";
import { UNKNOWN_PICKUP_WINDOW } from "./donations";

export interface OfferView {
  /** The assignment id (accept / reject). */
  id: string;
  /** Human code of the donation (`DON-1048`). */
  code: string;
  title: string;
  /** "45 kg · Refrigeración requerida". */
  summary: string;
  pickupWindow: string;
  /** Pickup address, plus the donor's reference when given. */
  address: string;
  /** The pickup point, for the offer's map. */
  point: Coordenada;
  /** "2,8 km", or null when the API could not compute it. */
  distance: string | null;
  /** Bogotá `HH:mm` when the offer lapses. */
  expiresAt: string;
  /** The raw `expira_at`, for the live countdown. */
  expiresAtIso: string;
  /** Estimated weight of the donation, compared with the volunteer's capacity. */
  weightKg: number;
  donacionId: string;
  /** The donor's contact: the API shares it only once the offer is accepted. */
  contactName: string | null;
  contactPhone: string | null;
  accepted: boolean;
  /** "Pan · 25 KG" per product. */
  products: string[];
}

function windowDisplay(dto: OfertaDto): string {
  try {
    return fromPickupWindow(dto.ventana_recogida_inicio, dto.ventana_recogida_fin).display;
  } catch {
    return UNKNOWN_PICKUP_WINDOW;
  }
}

export function offerFromOferta(dto: OfertaDto): OfferView {
  const cold = dto.requiere_refrigeracion ? "Refrigeración requerida" : "Sin refrigeración";
  const reference = dto.referencia_recogida?.trim();
  return {
    id: dto.id,
    code: dto.codigo,
    title: dto.titulo?.trim() || "Donación sin título",
    summary: `${dto.peso_estimado_kg} kg · ${cold}`,
    pickupWindow: windowDisplay(dto),
    address: reference ? `${dto.direccion_recogida} · ${reference}` : dto.direccion_recogida,
    point: { lat: dto.lat, lng: dto.lng },
    distance:
      dto.distancia_km === null ? null : `${dto.distancia_km.toFixed(1).replace(".", ",")} km`,
    expiresAt: fromIsoToBogota(dto.expira_at).time,
    expiresAtIso: dto.expira_at,
    weightKg: dto.peso_estimado_kg,
    donacionId: dto.donacion_id,
    contactName: dto.contacto_nombre?.trim() || null,
    contactPhone: dto.contacto_telefono,
    accepted: dto.estado === "ACEPTADA",
    products: (dto.productos ?? []).map(
      (producto) => `${producto.tipo} · ${producto.cantidad} ${producto.unidad}`,
    ),
  };
}

/**
 * The offer a screen opened with `?asignacionId=` shows, or null once it left the list
 * (expired, taken or rejected). Without an id, the first offer still waiting for an answer.
 */
export function selectOffer(
  ofertas: readonly OfertaDto[],
  asignacionId: string | undefined,
): OfertaDto | null {
  if (asignacionId) return ofertas.find((oferta) => oferta.id === asignacionId) ?? null;
  return ofertas.find((oferta) => oferta.estado === "OFRECIDA") ?? null;
}
