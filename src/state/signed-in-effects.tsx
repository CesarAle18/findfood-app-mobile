/**
 * Side effects that run only while the user is signed into the app (`phase === "app"`).
 *
 * Mounted once under `SessionProvider`. Each concern is its own hook called from
 * `ActiveEffects`, so later ones (push registration, location tracking) slot in beside the
 * catalog prefetch without touching the others. Leaving the app phase unmounts them all.
 * Push registration only runs for accounts that receive pushes (DONANTE or VOLUNTARIO).
 * Location tracking only runs for an approved volunteer acting as one (see
 * useVolunteerLocationTracking).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useVolunteerLocationTracking } from "@/location/use-volunteer-location-tracking";
import { usePushRegistration } from "@/notifications/push";
import { catalogosQuery } from "@/services/catalogos";
import { useAccess } from "@/state/session";

export function SignedInEffects() {
  const { phase } = useAccess();
  return phase === "app" ? <ActiveEffects /> : null;
}

function ActiveEffects() {
  const { canDonor, canVolunteer } = useAccess();
  useCatalogPrefetch();
  usePushRegistration(canDonor || canVolunteer);
  useVolunteerLocationTracking();
  return null;
}

/** Loads the whole catalog once per session, so forms open with their options ready. */
export function useCatalogPrefetch() {
  const queryClient = useQueryClient();
  useEffect(() => {
    // A fresh catalog makes this a no-op; a failure stays in the query for the forms to retry.
    void queryClient.prefetchQuery(catalogosQuery());
  }, [queryClient]);
}
