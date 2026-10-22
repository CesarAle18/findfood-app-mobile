/**
 * Address search through findfood-api (`/geo/*`), which proxies Google Places and
 * Geocoding with the server key. Read-only: the point the app saves is still the pin the
 * user confirms, sent as `Coordenada` to `/donaciones` or `/voluntario/solicitud`.
 *
 * Without Google the API answers 503 `geo-no-disponible`; callers fall back to the
 * phone's geocoder (`@/location/geocode`).
 */
import { api } from "@/api";
import type { Coordenada } from "@/api/types";

/** Problem type when the API has no Google key or Google did not answer. */
export const GEO_NO_DISPONIBLE = "geo-no-disponible";

export interface SugerenciaDto {
  place_id: string;
  /** Street address or place name. */
  principal: string;
  /** Neighborhood, city. */
  secundario: string | null;
}

export interface LugarDto {
  place_id: string;
  direccion: string;
  ubicacion: Coordenada;
}

/** Google's `location_type`, from the most to the least precise. */
export type PrecisionGeo = "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE";

export interface GeocodificacionDto {
  direccion: string;
  ubicacion: Coordenada;
  precision: PrecisionGeo;
}

/**
 * A neighborhood or street centroid can sit kilometers from the real door, and that point
 * decides which volunteers the hard filters keep (`ST_DWithin`): ask to adjust the pin.
 */
export function isApproximate(precision: PrecisionGeo): boolean {
  return precision === "GEOMETRIC_CENTER" || precision === "APPROXIMATE";
}

/**
 * `sesion` is one UUID per search, repeated until a suggestion is picked with getLugar:
 * Google bills the whole session once.
 */
export function autocompletarDireccion(
  q: string,
  sesion: string,
  cerca?: Coordenada | null,
  signal?: AbortSignal,
): Promise<{ sugerencias: SugerenciaDto[] }> {
  return api.get("/geo/autocompletar", {
    query: { q, sesion, lat: cerca?.lat, lng: cerca?.lng },
    signal,
  });
}

export function getLugar(placeId: string, sesion: string): Promise<LugarDto> {
  return api.get(`/geo/lugares/${encodeURIComponent(placeId)}`, { query: { sesion } });
}

export function geocodificar(direccion: string): Promise<GeocodificacionDto> {
  return api.get("/geo/geocodificar", { query: { direccion } });
}

export function geocodificarInversa(point: Coordenada): Promise<{ direccion: string }> {
  return api.get("/geo/inversa", { query: { lat: point.lat, lng: point.lng } });
}
