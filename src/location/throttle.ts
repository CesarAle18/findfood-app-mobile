/**
 * Decides which location samples are worth sending to `POST /voluntario/ubicacion`: the OS
 * may deliver them far more often than the backend needs.
 */

export interface LocationSample {
  /** Epoch milliseconds when the position was taken. */
  at: number;
  lat: number;
  lng: number;
}

export interface ThrottleOptions {
  minIntervalMs: number;
  minDistanceM: number;
}

export const SEND_THROTTLE: ThrottleOptions = { minIntervalMs: 60_000, minDistanceM: 100 };

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle (haversine) distance between two points, in meters. */
export function distanceMeters(
  a: Pick<LocationSample, "lat" | "lng">,
  b: Pick<LocationSample, "lat" | "lng">,
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Send when nothing was sent yet, or when either the interval elapsed or the volunteer moved
 * far enough since the last sample sent. A sample older than the last one sent (delivered
 * out of order) never is.
 */
export function shouldSend(
  last: LocationSample | null,
  next: LocationSample,
  { minIntervalMs, minDistanceM }: ThrottleOptions,
): boolean {
  if (!last) return true;
  if (next.at < last.at) return false;
  return next.at - last.at >= minIntervalMs || distanceMeters(last, next) >= minDistanceM;
}
