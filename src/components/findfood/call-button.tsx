import { useState } from "react";
import { Linking } from "react-native";

import { Button, FormMessage } from "./ui";

/** Digits and `+` only: what a `tel:` URL accepts from numbers typed with spaces or dashes. */
export function sanitizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/[^\d+]/g, "");
}

/**
 * Dials `phone`; renders nothing when there is no number to call (the API shares contacts
 * only after acceptance). No `canOpenURL` check: Android 11+ would need a manifest query
 * for `tel:`, so a failed open is caught and the number shown instead.
 */
export function CallButton({
  phone,
  label,
  variant = "outline",
}: {
  phone: string | null | undefined;
  label: string;
  variant?: "primary" | "outline";
}) {
  const [failed, setFailed] = useState(false);
  const clean = sanitizePhone(phone);
  if (!clean) return null;
  const call = async () => {
    setFailed(false);
    try {
      await Linking.openURL(`tel:${clean}`);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <FormMessage
        message={failed ? `No pudimos abrir la app de llamadas. Marca al ${phone}.` : undefined}
      />
      <Button variant={variant} onPress={() => void call()}>
        {label}
      </Button>
    </>
  );
}
