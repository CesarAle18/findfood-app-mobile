/**
 * Accepting an offer (`POST /asignaciones/:id/aceptar`), shared by the offer screen and the
 * floating offer alert: the request, the message of a failure, its problem `type` (so the
 * alert can tell a lost race from a lapsed deadline) and the move to the routes. Also the
 * capacity check both show before the volunteer decides.
 */
import { router } from "expo-router";
import { useState } from "react";

import { isApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import { acceptedWithoutRoute } from "@/domain/mappers/routes";
import { useAceptarOfertaMutation, type OfertaDto } from "@/services/asignaciones";

/**
 * Why the offer can no longer be accepted, from the problem `type` of a failed accept:
 * another volunteer won it or it closed (`unavailable`), or its deadline passed (`expired`).
 * Null for anything else (offline, a server error…): trying again may work.
 */
export type OfferClosedReason = "unavailable" | "expired";

const CLOSED_BY_PROBLEM: Readonly<Record<string, OfferClosedReason>> = {
  "oferta-tomada": "unavailable",
  "donacion-no-disponible": "unavailable",
  "oferta-ya-respondida": "unavailable",
  "oferta-vencida": "expired",
};

export function closedReasonOf(problemType: string | null): OfferClosedReason | null {
  return problemType === null ? null : (CLOSED_BY_PROBLEM[problemType] ?? null);
}

interface AcceptFailure {
  message: string;
  /** The problem slug, or null when the failure is not an API problem. */
  type: string | null;
}

export interface AcceptOfferOptions {
  /** Runs once the server confirmed, before moving to the routes. */
  onAccepted?: () => void;
  /** Runs when the accept failed, with the failure already in `error`. */
  onFailed?: (reason: OfferClosedReason | null) => void;
}

export function useAcceptOffer(offerId: string, { onAccepted, onFailed }: AcceptOfferOptions = {}) {
  const { mutateAsync: aceptar, isPending: accepting } = useAceptarOfertaMutation();
  const [failure, setFailure] = useState<AcceptFailure>();

  const accept = async () => {
    setFailure(undefined);
    try {
      await aceptar(offerId);
    } catch (error) {
      const type = isApiError(error) ? error.type : null;
      setFailure({ message: messageFor(error), type });
      onFailed?.(closedReasonOf(type));
      return;
    }
    onAccepted?.();
    // Back to the routes tab where it is in the stack; otherwise it replaces the screen.
    router.dismissTo("/voluntario/rutas");
  };

  return {
    accept,
    accepting,
    /** The message of the last failed accept, cleared by the next attempt. */
    error: failure?.message,
    closedReason: closedReasonOf(failure?.type ?? null),
  };
}

/** Estimated weight of the accepted pickups still waiting for a route. */
export function acceptedLoadKg(ofertas: readonly OfertaDto[]): number {
  return acceptedWithoutRoute(ofertas).reduce((total, row) => total + row.peso_estimado_kg, 0);
}

/**
 * One route carries the accepted pickups: more than the vehicle holds ends in
 * `excede-capacidad` when the route is created. Unknown capacity never warns.
 */
export function exceedsCapacity(
  offer: { weightKg: number; accepted: boolean },
  capacityKg: number | null,
  acceptedKg: number,
): boolean {
  return !offer.accepted && capacityKg !== null && offer.weightKg + acceptedKg > capacityKg;
}
