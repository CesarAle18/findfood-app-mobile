/**
 * Pickup routes of the signed-in volunteer (`/rutas`) and their stops (`/paradas`).
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/api";
import type {
  Coordenada,
  EstadoDonacion,
  EstadoParada,
  EstadoRuta,
  Paged,
  Paginacion,
  TipoParada,
} from "@/api/types";

import { invalidateOnSuccess, queryKeys, type Invalidation } from "./query-keys";

// --- DTOs ------------------------------------------------------------------------------

/** `POST /rutas`: 1 to 10 accepted donations, all to the same warehouse and day. */
export type CrearRutaBody = {
  donacion_ids: string[];
  /** Defaults to the last known position, or the volunteer's base. */
  origen?: Coordenada;
};

export type RutasFilters = Paginacion & { estado?: EstadoRuta };

/** A row of `GET /rutas`. */
export interface RutaResumenDto {
  id: string;
  codigo: string;
  estado: EstadoRuta;
  /** Date only: read the first 10 characters. */
  fecha_programada: string;
  distancia_total_km: number | null;
  duracion_estimada_min: number | null;
  peso_total_estimado_kg: number | null;
  iniciada_at: string | null;
  finalizada_at: string | null;
  almacen_destino: { id: string; nombre: string };
  /** Number of stops. */
  paradas: number;
}

/** A stop, as `POST /paradas/:id/{llegada,confirmar,fallida}` answer it. */
export interface ParadaDto {
  id: string;
  ruta_id: string;
  orden: number;
  tipo: TipoParada;
  estado: EstadoParada;
  /** Set on pickups (RECOGIDA). */
  donacion_id: string | null;
  /** Set on the delivery (ENTREGA). */
  almacen_id: string | null;
  direccion: string;
  lat: number;
  lng: number;
  hora_estimada_llegada: string | null;
  hora_real_llegada: string | null;
  peso_confirmado_kg: number | null;
  confirmacion_manual: boolean;
  precision_confirmacion_m: number | null;
  confirmada_at: string | null;
  observaciones: string | null;
}

/** A stop inside `GET /rutas/:id`, with its donation (null fields on the delivery). */
export interface ParadaRutaDto extends Omit<ParadaDto, "ruta_id"> {
  donacion_codigo: string | null;
  donacion_estado: EstadoDonacion | null;
  peso_estimado_kg: number | null;
  ventana_recogida_inicio: string | null;
  ventana_recogida_fin: string | null;
  referencia_recogida: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
}

/** GeoJSON of the planned path; coordinates are `[lng, lat]`. */
export interface GeometriaRutaDto {
  type: "LineString";
  coordinates: [number, number][];
}

/** `GET /rutas/:id` (also the answer of create, start and cancel). */
export interface RutaDetalleDto {
  id: string;
  codigo: string;
  estado: EstadoRuta;
  /** Date only: read the first 10 characters. */
  fecha_programada: string;
  distancia_total_km: number | null;
  duracion_estimada_min: number | null;
  duracion_real_min: number | null;
  peso_total_estimado_kg: number | null;
  proveedor_ruteo: string | null;
  iniciada_at: string | null;
  finalizada_at: string | null;
  cancelada_at: string | null;
  created_at: string;
  flota_banco: boolean;
  almacen_destino: { id: string; nombre: string; direccion: string };
  voluntario: {
    id: string;
    nombres: string;
    apellidos: string | null;
    telefono: string | null;
    placa_vehiculo: string;
  } | null;
  geometria: GeometriaRutaDto | null;
  /** In visiting order. */
  paradas: ParadaRutaDto[];
}

/** `POST /paradas/:id/llegada` (idempotent). */
export type LlegadaBody = { ubicacion?: Coordenada };

/** `POST /paradas/:id/confirmar`: needs at least one evidence photo of the stop first. */
export type ConfirmarParadaBody = {
  /** Device time (ISO) when confirming. */
  confirmada_en_dispositivo: string;
  /** Required on pickups: kilograms actually collected. */
  peso_confirmado_kg?: number;
  /** Actual weight per product. */
  items?: { item_id: string; peso_real_kg: number }[];
  ubicacion?: Coordenada;
  /** GPS accuracy in meters; above the API minimum, `confirmacion_manual` is required. */
  precision_m?: number;
  confirmacion_manual?: boolean;
  observaciones?: string;
};

/** `POST /paradas/:id/fallida`: pickups only; opens an incident. */
export type ParadaFallidaBody = {
  tipo_incidencia_id: number;
  /** 5 to 2000 characters. */
  descripcion: string;
  ubicacion?: Coordenada;
};

// --- Requests ----------------------------------------------------------------------------

const rutaPath = (id: string) => `/rutas/${encodeURIComponent(id)}`;
const paradaPath = (id: string) => `/paradas/${encodeURIComponent(id)}`;

export function getRutas(
  filters: RutasFilters = {},
  signal?: AbortSignal,
): Promise<Paged<RutaResumenDto>> {
  return api.get<Paged<RutaResumenDto>>("/rutas", { query: filters, signal });
}

export function getRuta(id: string, signal?: AbortSignal): Promise<RutaDetalleDto> {
  return api.get<RutaDetalleDto>(rutaPath(id), { signal });
}

export function crearRuta(body: CrearRutaBody): Promise<RutaDetalleDto> {
  return api.post<RutaDetalleDto>("/rutas", { body });
}

export function iniciarRuta(id: string): Promise<RutaDetalleDto> {
  return api.post<RutaDetalleDto>(`${rutaPath(id)}/iniciar`);
}

/** Only before it starts. */
export function cancelarRuta(id: string): Promise<RutaDetalleDto> {
  return api.post<RutaDetalleDto>(`${rutaPath(id)}/cancelar`);
}

export function registrarLlegada(paradaId: string, body: LlegadaBody = {}): Promise<ParadaDto> {
  return api.post<ParadaDto>(`${paradaPath(paradaId)}/llegada`, { body });
}

export function confirmarParada(paradaId: string, body: ConfirmarParadaBody): Promise<ParadaDto> {
  return api.post<ParadaDto>(`${paradaPath(paradaId)}/confirmar`, { body });
}

export function reportarParadaFallida(
  paradaId: string,
  body: ParadaFallidaBody,
): Promise<ParadaDto> {
  return api.post<ParadaDto>(`${paradaPath(paradaId)}/fallida`, { body });
}

// --- Queries -----------------------------------------------------------------------------

export function rutasQuery(filters: RutasFilters = {}) {
  return queryOptions({
    queryKey: queryKeys.rutas.list(filters),
    queryFn: ({ signal }) => getRutas(filters, signal),
  });
}

export function rutaQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.rutas.detail(id),
    queryFn: ({ signal }) => getRuta(id, signal),
  });
}

export function useRutas(filters: RutasFilters = {}) {
  return useQuery(rutasQuery(filters));
}

export function useRuta(id: string) {
  return useQuery(rutaQuery(id));
}

// --- Mutations ---------------------------------------------------------------------------

/** `id` is the stop's id. */
export type LlegadaVariables = { id: string; body?: LlegadaBody };
export type ConfirmarParadaVariables = { id: string; body: ConfirmarParadaBody };
export type ParadaFallidaVariables = { id: string; body: ParadaFallidaBody };

const { asignaciones, donaciones, perfil, rutas } = queryKeys;

/** The donation's history lists its stops' changes; a delivery stop has no donation. */
const historialDe = (parada: ParadaDto) =>
  parada.donacion_id ? [donaciones.historial(parada.donacion_id)] : [];

/** What each mutation leaves stale. */
const invalidates = {
  /** The assignments get their route, which the offers and the donations' details show. */
  crear: (_: unknown, { donacion_ids }: CrearRutaBody) => [
    rutas.lists(),
    asignaciones.ofertas(),
    ...donacion_ids.map((id) => donaciones.detail(id)),
  ],
  /** Its donations move to EN_RECOLECCION. */
  iniciar: (_: unknown, id: string) => [
    rutas.lists(),
    rutas.detail(id),
    asignaciones.ofertas(),
    donaciones.all,
  ],
  /** The assignments leave the route (the bank fleet's donations are published again). */
  cancelar: (_: unknown, id: string) => [
    rutas.lists(),
    rutas.detail(id),
    asignaciones.ofertas(),
    donaciones.all,
  ],
  /** The stop changes; a pickup stop also shows in its donation's history. */
  llegada: (parada: ParadaDto) => [rutas.detail(parada.ruta_id), ...historialDe(parada)],
  /**
   * A pickup moves its donation to EN_TRANSITO; a delivery completes the route, its
   * donations and assignments, and the volunteer's impact.
   */
  confirmar: (parada: ParadaDto) => [
    rutas.detail(parada.ruta_id),
    rutas.lists(),
    asignaciones.ofertas(),
    donaciones.all,
    perfil.impacto(),
  ],
  /** The stop fails and an incident opens; the donation keeps its state. */
  fallida: (parada: ParadaDto) => [rutas.detail(parada.ruta_id), ...historialDe(parada)],
} satisfies Record<string, Invalidation<never, never>>;

export function useCrearRutaMutation() {
  return useMutation({
    mutationFn: crearRuta,
    onSuccess: invalidateOnSuccess(invalidates.crear),
  });
}

export function useIniciarRutaMutation() {
  return useMutation({
    mutationFn: iniciarRuta,
    onSuccess: invalidateOnSuccess(invalidates.iniciar),
  });
}

export function useCancelarRutaMutation() {
  return useMutation({
    mutationFn: cancelarRuta,
    onSuccess: invalidateOnSuccess(invalidates.cancelar),
  });
}

export function useRegistrarLlegadaMutation() {
  return useMutation({
    mutationFn: ({ id, body }: LlegadaVariables) => registrarLlegada(id, body),
    onSuccess: invalidateOnSuccess(invalidates.llegada),
  });
}

export function useConfirmarParadaMutation() {
  return useMutation({
    mutationFn: ({ id, body }: ConfirmarParadaVariables) => confirmarParada(id, body),
    onSuccess: invalidateOnSuccess(invalidates.confirmar),
  });
}

export function useParadaFallidaMutation() {
  return useMutation({
    mutationFn: ({ id, body }: ParadaFallidaVariables) => reportarParadaFallida(id, body),
    onSuccess: invalidateOnSuccess(invalidates.fallida),
  });
}
