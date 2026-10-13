/**
 * Coordinates between the API and the map. The API always speaks `{ lat, lng }`
 * (`Coordenada`), GeoJSON geometry is `[lng, lat]`, and react-native-maps wants
 * `{ latitude, longitude }`. Pure: no map or native module is imported here.
 */
import type { Coordenada } from "@/api/types";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MapRegion extends LatLng {
  latitudeDelta: number;
  longitudeDelta: number;
}

/** A GeoJSON LineString such as `GET /rutas/:id → geometria`. */
export interface LineStringGeometry {
  type: "LineString";
  coordinates: readonly (readonly [number, number])[];
}

/** Plaza de Bolívar: where maps open when there is nothing to show yet. */
export const BOGOTA_CENTER: LatLng = { latitude: 4.5981, longitude: -74.0761 };
/** Roughly a neighbourhood: close enough to place a pickup pin. */
const MIN_DELTA = 0.01;
/** Roughly the city, for the fallback region. */
const CITY_DELTA = 0.2;

export function toLatLng({ lat, lng }: Coordenada): LatLng {
  return { latitude: lat, longitude: lng };
}

/** Only `{ lat, lng }`: the API rejects extra fields (such as a region's deltas). */
export function fromLatLng({ latitude, longitude }: LatLng): Coordenada {
  return { lat: latitude, lng: longitude };
}

/** GeoJSON `[lng, lat]` pairs → map points; no geometry yields no points. */
export function lineStringToLatLngs(geometry: LineStringGeometry | null | undefined): LatLng[] {
  if (!geometry) return [];
  return geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
}

/**
 * A region that shows every point, widened by `padding` (0.4 = 40% extra span). With no
 * points it is Bogotá; with one, a neighbourhood around it.
 */
export function regionForPoints(points: readonly LatLng[], padding = 0.4): MapRegion {
  if (points.length === 0) {
    return { ...BOGOTA_CENTER, latitudeDelta: CITY_DELTA, longitudeDelta: CITY_DELTA };
  }
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(MIN_DELTA, (maxLat - minLat) * (1 + padding)),
    longitudeDelta: Math.max(MIN_DELTA, (maxLng - minLng) * (1 + padding)),
  };
}

/** The fields of `expo-location`'s `LocationGeocodedAddress` the suggestion reads. */
export interface GeocodedAddress {
  formattedAddress?: string | null;
  street: string | null;
  streetNumber: string | null;
  name: string | null;
  city: string | null;
}

/**
 * A reverse-geocoded address as one line for the address field, or null when the platform
 * knows nothing useful. Only a suggestion: the donor's typed address always wins.
 */
export function formatGeocodedAddress(address: GeocodedAddress | undefined): string | null {
  if (!address) return null;
  const formatted = address.formattedAddress?.trim();
  if (formatted) return formatted;
  const street = [address.street, address.streetNumber].filter(Boolean).join(" ");
  const line = [street || address.name, address.city].filter(Boolean).join(", ");
  return line || null;
}

/** `lat, lng` with 5 decimals (about a metre), for summaries. */
export function formatCoordenada({ lat, lng }: Coordenada): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
