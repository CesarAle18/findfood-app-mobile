/**
 * The reason picker and the confirm and back buttons of an offer reject, driven by
 * `useRejectOffer`. The offer screen puts it in its "Rechazar oferta" section; the floating
 * offer alert puts it in the card's reject panel.
 */
import type { RejectOfferState } from "@/screens/use-reject-offer";

import { MotivoField } from "./motivo-field";
import { Button } from "./ui";

export function RejectOfferForm({
  reject,
  onBack,
}: {
  reject: RejectOfferState;
  /** "Volver": leaves the reject without answering. Held while the reject is in flight. */
  onBack: () => void;
}) {
  const { selection, setSelection, error, rejecting, confirm } = reject;
  return (
    <>
      <MotivoField
        ambito="RECHAZO_ASIGNACION"
        value={selection}
        onChange={setSelection}
        error={error}
      />
      <Button variant="danger" loading={rejecting} onPress={() => void confirm()}>
        Confirmar rechazo
      </Button>
      <Button variant="outline" disabled={rejecting} onPress={onBack}>
        Volver
      </Button>
    </>
  );
}
