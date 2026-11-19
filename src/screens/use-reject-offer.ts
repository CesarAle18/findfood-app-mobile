/**
 * Rejecting an offer with a RECHAZO_ASIGNACION reason (`POST /asignaciones/:id/rechazar`),
 * shared by the offer screen and the floating offer alert: the reason and comment being
 * chosen, their validation, the request and the message of a failure. The API requires a
 * reason, so nothing is sent until one is chosen; none is ever picked on the volunteer's
 * behalf.
 */
import { useState } from "react";

import { isApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import { motivoBody, validateMotivo, type MotivoSelection } from "@/components/findfood/motivo-field";
import { useRechazarOfertaMutation } from "@/services/asignaciones";
import { useMotivos } from "@/services/catalogos";

import { closedReasonOf, type OfferClosedReason } from "./use-accept-offer";

export interface RejectOfferOptions {
  /** Runs once the reason is valid, right before the request leaves. */
  onStart?: () => void;
  /** Runs once the server confirmed the reject. */
  onRejected?: () => void;
  /** Runs when the reject failed, with the failure already in `error`. */
  onFailed?: (reason: OfferClosedReason | null) => void;
}

export function useRejectOffer(
  asignacionId: string,
  { onStart, onRejected, onFailed }: RejectOfferOptions = {},
) {
  const { data: motivos } = useMotivos("RECHAZO_ASIGNACION");
  const { mutateAsync: rechazar, isPending: rejecting } = useRechazarOfertaMutation();
  const [selection, setSelection] = useState<MotivoSelection>({ comentario: "" });
  const [error, setError] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState<OfferClosedReason | null>(null);

  const confirm = async () => {
    const invalid = validateMotivo(selection, motivos ?? []);
    setError(invalid);
    setClosedReason(null);
    const { motivoId } = selection;
    if (invalid !== null || motivoId === undefined) return;
    onStart?.();
    try {
      await rechazar({ id: asignacionId, body: motivoBody({ ...selection, motivoId }) });
    } catch (failure) {
      const reason = closedReasonOf(isApiError(failure) ? failure.type : null);
      setError(messageFor(failure));
      setClosedReason(reason);
      onFailed?.(reason);
      return;
    }
    onRejected?.();
  };

  return {
    selection,
    setSelection,
    /** The validation message, or the message of the last failed reject. */
    error,
    rejecting,
    /** Why the last failed reject found the offer closed; null otherwise. */
    closedReason,
    confirm,
  };
}

export type RejectOfferState = ReturnType<typeof useRejectOffer>;
