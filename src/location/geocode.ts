/**
 * Address lookups. Google (through findfood-api, `@/services/geo`) goes first; when the
 * API cannot search (no Google key, offline, quota) the phone's geocoder answers, which
 * needs no Maps key. Android geocodes on the phone only with the foreground location
 * permission: callers ask for it before `geocodeAddress`. Never invents a point: no
 * answer is null.
 */
import * as Location from "expo-location";

import { ApiError } from "@/api/errors";
import type { Coordenada } from "@/api/types";
import { isInServiceArea } from "@/domain/mappers/geo";
import { geocodificar, geocodificarInversa, isApproximate } from "@/services/geo";

export interface GeocodedPoint {
  point: Coordenada;
  /** A neighborhood or street centroid, not the door: ask the user to adjust the pin. */
  approximate: boolean;
}

/** Addresses are typed without the country; the geocoder searches worldwide otherwise. */
export function addressQuery(direccion: string): string {
  const trimmed = direccion.trim();
  return /colombia/i.test(trimmed) ? trimmed : `${trimmed}, Colombia`;
}

/**
 * Google through the API. null: Google says the address does not exist. undefined: the
 * API cannot search right now, so the caller falls back to the phone's geocoder.
 */
export async function geocodeWithApi(
  direccion: string,
): Promise<GeocodedPoint | null | undefined> {
  try {
    const found = await geocodificar(direccion.trim());
    if (!found?.ubicacion) return undefined;
    return { point: found.ubicacion, approximate: isApproximate(found.precision) };
  } catch (error) {
    return error instanceof ApiError && error.status === 404 ? null : undefined;
  }
}

/** The phone's geocoder. A match outside the service area counts as not found. */
export async function geocodeAddress(direccion: string): Promise<Coordenada | null> {
  try {
    const [found] = await Location.geocodeAsync(addressQuery(direccion));
    if (!found) return null;
    const point = { lat: found.latitude, lng: found.longitude };
    return isInServiceArea(point) ? point : null;
  } catch {
    return null;
  }
}

/** Pins dropped on the same spot (5 decimals ≈ 1 m) reuse the answer: Google bills each. */
const reverseCache = new Map<string, string | null>();
const REVERSE_CACHE_SIZE = 50;

/**
 * Point → address with Google. null: no address there. undefined: the API cannot search,
 * so the caller falls back to `Location.reverseGeocodeAsync`.
 */
export async function reverseGeocodeWithApi(point: Coordenada): Promise<string | null | undefined> {
  const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  if (reverseCache.has(key)) return reverseCache.get(key);
  let answer: string | null;
  try {
    const found = await geocodificarInversa(point);
    if (!found?.direccion) return undefined;
    answer = found.direccion;
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) return undefined;
    answer = null;
  }
  if (reverseCache.size >= REVERSE_CACHE_SIZE) {
    reverseCache.delete(reverseCache.keys().next().value!);
  }
  reverseCache.set(key, answer);
  return answer;
}

/** For tests: forget cached reverse lookups. */
export function clearReverseGeocodeCache(): void {
  reverseCache.clear();
}
