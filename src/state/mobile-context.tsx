/**
 * UI-only state shared between screens: the donation draft (new donation → review) and the
 * volunteer's availability toggle. Remote data lives in TanStack Query (`@/services/*`,
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

import { initialDonationDraft, type DonationDraft } from "@/domain/donation-draft";

interface MobileState {
  // TODO(F3): replace with `me.voluntario.disponible` and PATCH /voluntario/estado.
  available: boolean;
  setAvailable: (value: boolean) => void;
  draft: DonationDraft;
  setDraft: Dispatch<SetStateAction<DonationDraft>>;
}

const Context = createContext<MobileState | null>(null);

export function MobileProvider({ children }: PropsWithChildren) {
  const [available, setAvailable] = useState(true);
  const [draft, setDraft] = useState(initialDonationDraft);
  return (
    <Context value={{ available, setAvailable, draft, setDraft }}>{children}</Context>
  );
}

export function useMobile(): MobileState {
  const value = use(Context);
  if (!value) throw new Error("useMobile requiere MobileProvider");
  return value;
}
