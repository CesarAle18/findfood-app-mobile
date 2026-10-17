/**
 * Locates a typed address with the phone's geocoder, which needs no Maps key. Android
 * geocodes only with the foreground location permission: callers ask for it first. Never
 * invents a point: no answer is null.
 */
import * as Location from "expo-location";

import type { Coordenada } from "@/api/types";

/** Addresses are typed without the country; the geocoder searches worldwide otherwise. */
export function addressQuery(direccion: string): string {
  const trimmed = direccion.trim();
  return /colombia/i.test(trimmed) ? trimmed : `${trimmed}, Colombia`;
}

export async function geocodeAddress(direccion: string): Promise<Coordenada | null> {
  try {
    const [found] = await Location.geocodeAsync(addressQuery(direccion));
    return found ? { lat: found.latitude, lng: found.longitude } : null;
  } catch {
    return null;
  }
}
