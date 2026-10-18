/**
 * One position fix for a single action (arriving at a stop, confirming it), as opposed to
 * the continuous tracking in `tracking.ts`. Never throws: a missing permission, a disabled
 * GPS or a slow fix all resolve to null, and the caller falls back to manual confirmation.
 */
import * as Location from "expo-location";

import type { Coordenada } from "@/api/types";

/** Mirrors the API parameter `GPS_PRECISION_MIN_M`: coarser fixes need manual confirmation. */
export const GPS_PRECISION_MIN_M = 50;

const DEFAULT_TIMEOUT_MS = 10_000;

export interface CurrentFix {
  ubicacion: Coordenada;
  /** Accuracy radius in meters; null when the platform does not report it. */
  precision_m: number | null;
}

/** Asks only when the user was never asked; a refusal is respected until settings change. */
async function hasForegroundPermission(): Promise<boolean> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return true;
  if (current.status !== Location.PermissionStatus.UNDETERMINED) return false;
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

async function readFix(): Promise<CurrentFix | null> {
  if (!(await hasForegroundPermission())) return null;
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    ubicacion: { lat: coords.latitude, lng: coords.longitude },
    precision_m: coords.accuracy ?? null,
  };
}

/** The device's position now, or null when it is unavailable within `timeoutMs`. */
export async function getCurrentFix({
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: { timeoutMs?: number } = {}): Promise<CurrentFix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([readFix(), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether the API will reject the fix unless the volunteer confirms manually. */
export function needsManualConfirmation(fix: CurrentFix | null): boolean {
  return fix === null || fix.precision_m === null || fix.precision_m > GPS_PRECISION_MIN_M;
}
