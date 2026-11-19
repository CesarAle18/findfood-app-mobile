/**
 * The queue behind the floating offer alert: which live offer to show now and how many
 * more wait behind it. Pure, so the host only feeds it the offers list, the offers the
 * volunteer set aside this session ("Ahora no") and the current time.
 */
import type { OfertaDto } from "@/services/asignaciones";

import { offerFromOferta, type OfferView } from "./mappers/offers";
import { liveOffers } from "./mappers/routes";

/** An offer view plus what the alert shows apart: the progress bar and the route block. */
export interface QueuedOffer extends OfferView {
  /** The raw `ofrecida_at`: the countdown bar runs from it to `expira_at`. */
  offeredAtIso: string;
  /** The pickup address alone (`address` joins the reference to it). */
  street: string;
  /** The donor's pickup instructions, or null when left blank. */
  reference: string | null;
  refrigerated: boolean;
}

export interface OfferQueue {
  /** The offer closest to lapsing, or null when none waits for an answer. */
  current: QueuedOffer | null;
  /** How many more offers wait behind it ("+N más"). */
  remaining: number;
}

/** One offer row as the alert shows it. */
export function queuedOffer(oferta: OfertaDto): QueuedOffer {
  return {
    ...offerFromOferta(oferta),
    offeredAtIso: oferta.ofrecida_at,
    street: oferta.direccion_recogida,
    reference: oferta.referencia_recogida?.trim() || null,
    refrigerated: oferta.requiere_refrigeracion,
  };
}

/**
 * Live offers (OFRECIDA, `expira_at` still ahead of `now`) the volunteer has not set aside,
 * once each, closest deadline first; ties go by id so a refetch never swaps the shown one.
 * An unreadable deadline is left out: nothing could count it down.
 */
export function pendingOffers(
  ofertas: readonly OfertaDto[],
  dismissed: ReadonlySet<string>,
  now: number,
): OfferQueue {
  const byId = new Map<string, { oferta: OfertaDto; deadline: number }>();
  for (const oferta of liveOffers(ofertas)) {
    const deadline = Date.parse(oferta.expira_at);
    if (Number.isNaN(deadline) || deadline <= now) continue;
    if (dismissed.has(oferta.id) || byId.has(oferta.id)) continue;
    byId.set(oferta.id, { oferta, deadline });
  }
  const pending = [...byId.values()].sort(
    (a, b) => a.deadline - b.deadline || (a.oferta.id < b.oferta.id ? -1 : 1),
  );
  const [first] = pending;
  return {
    current: first ? queuedOffer(first.oferta) : null,
    remaining: Math.max(0, pending.length - 1),
  };
}
