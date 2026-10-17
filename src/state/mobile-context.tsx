/**
 * UI-only state shared between screens: the donation draft (new donation → review). The
 * volunteer's availability is `me.voluntario.disponible` (see AvailabilityToggle). Remote data lives in TanStack Query (`@/services/*`,
 * `useMe()`), never here.
 */
import {
  createContext,
  use,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from "react";

import { newDonationDraft, type DonationDraft } from "@/domain/donation-draft";

interface MobileState {
  draft: DonationDraft;
  setDraft: Dispatch<SetStateAction<DonationDraft>>;
}

const Context = createContext<MobileState | null>(null);

export function MobileProvider({
  children,
  initialDraft,
}: PropsWithChildren<{ /** Starting draft (tests); a fresh one by default. */ initialDraft?: DonationDraft }>) {
  const [draft, setDraft] = useState(() => initialDraft ?? newDonationDraft());
  return (
    <Context value={{ draft, setDraft }}>{children}</Context>
  );
}

export function useMobile(): MobileState {
  const value = use(Context);
  if (!value) throw new Error("useMobile requiere MobileProvider");
  return value;
}
