/**
 * Runs location tracking while the signed-in volunteer should share their position: when
 * they are available (`me.voluntario.disponible`) or have a route in progress. Mounted from
 * `SignedInEffects`, so leaving the app phase (sign-out) or switching to the donor role
 * unmounts it and stops tracking.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import type { MeDto } from "@/api/types";
import type { MobileRole } from "@/auth/access";
import {
  startLocationTracking,
  stopLocationTracking,
  trackingStatusStore,
  type TrackingStatus,
} from "@/location/tracking";
import { ROUTES_IN_PROGRESS, rutasQuery } from "@/services/rutas";
import { useAccess, useMe } from "@/state/session";

/** Whether the account acts as an approved volunteer right now. */
export function isActiveVolunteer(activeRole: MobileRole | null, me: MeDto | undefined): boolean {
  return activeRole === "VOLUNTARIO" && me?.voluntario?.estado_verificacion === "APROBADA";
}

export function deriveShouldTrack({
  activeVolunteer,
  disponible,
  routesInProgress,
}: {
  activeVolunteer: boolean;
  disponible: boolean;
  routesInProgress: number;
}): boolean {
  return activeVolunteer && (disponible || routesInProgress > 0);
}

export function useVolunteerLocationTracking(): void {
  const { activeRole } = useAccess();
  const { data: me } = useMe();
  const activeVolunteer = isActiveVolunteer(activeRole, me);
  const { data: routes } = useQuery({
    ...rutasQuery(ROUTES_IN_PROGRESS),
    enabled: activeVolunteer,
  });
  const shouldTrack = deriveShouldTrack({
    activeVolunteer,
    disponible: me?.voluntario?.disponible ?? false,
    routesInProgress: routes?.total ?? 0,
  });

  useEffect(() => {
    if (!shouldTrack) return;
    void startLocationTracking({ allowBackground: true });
    return () => {
      void stopLocationTracking();
    };
  }, [shouldTrack]);
}

/** How tracking is running, for screens that explain a refused permission. */
export function useLocationTrackingStatus(): TrackingStatus {
  return useSyncExternalStore(
    trackingStatusStore.subscribe,
    trackingStatusStore.get,
    trackingStatusStore.get,
  );
}
