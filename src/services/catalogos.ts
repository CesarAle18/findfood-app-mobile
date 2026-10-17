/**
 * Active catalogs for the forms (`GET /catalogos`): food types, units, vehicles, reasons…
 *
 * The app loads every catalog in one request per session (prefetched by `SignedInEffects`)
 * and each form reads its slice through `select`. Catalogs change rarely and the API has no
 * ETag, so the entry stays fresh for a day and is never garbage-collected.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";

import { api } from "@/api";
import type { TipoAlmacenamiento } from "@/api/types";

import { queryKeys, sortedUnique } from "./query-keys";

const CATALOGOS_STALE_TIME_MS = 24 * 60 * 60 * 1000;

// --- DTOs ------------------------------------------------------------------------------

export type Catalogo =
  | "categorias_alimento"
  | "tipos_alimento"
  | "unidades_medida"
  | "tipos_vehiculo"
  | "motivos"
  | "tipos_incidencia"
  | "tipos_destino_distribucion"
  | "aspectos_calificacion";

/** Scope of a reason (`motivos`), sent as `ambito` to filter them. */
export type AmbitoMotivo =
  | "RECHAZO_ASIGNACION"
  | "ABANDONO_ASIGNACION"
  | "CANCELACION_DONACION"
  | "RECHAZO_RECEPCION"
  | "RECHAZO_VERIFICACION";

/** The role a rating is about (`aspectos_calificacion.rol_calificado`). */
export type RolCalificado = "VOLUNTARIO" | "DONANTE";

export type Severidad = "BAJA" | "MEDIA" | "ALTA" | "CRITICA";

export interface CategoriaAlimentoDto {
  id: number;
  codigo: string;
  nombre: string;
  requiere_refrigeracion: boolean;
  vida_util_dias_ref: number | null;
}

export interface TipoAlimentoDto {
  id: number;
  codigo: string;
  nombre: string;
  categoria_alimento_id: number;
  /** Default unit of the food type. */
  unidad_medida_id: number;
  requiere_refrigeracion: boolean;
  tipo_almacenamiento: TipoAlmacenamiento;
  perecedero: boolean;
  vida_util_dias: number | null;
}

export interface UnidadMedidaDto {
  id: number;
  /** e.g. KG, L, ML, G, UND. */
  codigo: string;
  nombre: string;
  /** Kilograms per unit; null when the unit has no fixed conversion. */
  factor_a_kg: number | null;
}

export interface TipoVehiculoDto {
  id: number;
  codigo: string;
  nombre: string;
  capacidad_referencia_kg: number;
  permite_refrigeracion: boolean;
}

export interface MotivoDto {
  id: number;
  ambito: AmbitoMotivo;
  codigo: string;
  nombre: string;
  /** The request must then include an `observacion` (else 422 `comentario-requerido`). */
  requiere_comentario: boolean;
}

export interface TipoIncidenciaDto {
  id: number;
  codigo: string;
  nombre: string;
  severidad_default: Severidad;
  bloquea_donacion: boolean;
}

export interface TipoDestinoDistribucionDto {
  id: number;
  codigo: string;
  nombre: string;
}

/** An aspect a rating can highlight (API-08), e.g. PUNTUALIDAD for a volunteer. */
export interface AspectoCalificacionDto {
  id: number;
  rol_calificado: RolCalificado;
  codigo: string;
  nombre: string;
}

/** Every catalog; a response only carries the ones requested. */
export interface CatalogosDto {
  categorias_alimento: CategoriaAlimentoDto[];
  tipos_alimento: TipoAlimentoDto[];
  unidades_medida: UnidadMedidaDto[];
  tipos_vehiculo: TipoVehiculoDto[];
  motivos: MotivoDto[];
  tipos_incidencia: TipoIncidenciaDto[];
  tipos_destino_distribucion: TipoDestinoDistribucionDto[];
  aspectos_calificacion: AspectoCalificacionDto[];
}

// --- Requests ----------------------------------------------------------------------------

export function getCatalogos<K extends Catalogo>(
  incluir: readonly K[],
  ambito?: AmbitoMotivo,
  signal?: AbortSignal,
): Promise<Pick<CatalogosDto, K>> {
  return api.get<Pick<CatalogosDto, K>>("/catalogos", {
    query: { incluir: sortedUnique(incluir), ambito },
    signal,
  });
}

// --- Queries -----------------------------------------------------------------------------

/** Every catalog, in the order the API documents them. */
export const ALL_CATALOGOS: readonly Catalogo[] = [
  "categorias_alimento",
  "tipos_alimento",
  "unidades_medida",
  "tipos_vehiculo",
  "motivos",
  "tipos_incidencia",
  "tipos_destino_distribucion",
  // Every role: the selector filters by `rol_calificado`.
  "aspectos_calificacion",
];

const EMPTY_CATALOGOS: CatalogosDto = {
  categorias_alimento: [],
  tipos_alimento: [],
  unidades_medida: [],
  tipos_vehiculo: [],
  motivos: [],
  tipos_incidencia: [],
  tipos_destino_distribucion: [],
  aspectos_calificacion: [],
};

/** The whole catalog, once per session; a catalog missing from the response reads as empty. */
export function catalogosQuery() {
  return queryOptions({
    queryKey: queryKeys.catalogos.byIncluir(ALL_CATALOGOS),
    queryFn: async ({ signal }): Promise<CatalogosDto> => ({
      ...EMPTY_CATALOGOS,
      ...(await getCatalogos(ALL_CATALOGOS, undefined, signal)),
    }),
    staleTime: CATALOGOS_STALE_TIME_MS,
    gcTime: Infinity,
  });
}

// Module-level selectors: stable references, so `select` only reruns when the data changes.

export const selectTiposAlimento = (catalogos: CatalogosDto) => catalogos.tipos_alimento;
export const selectUnidades = (catalogos: CatalogosDto) => catalogos.unidades_medida;
export const selectTiposVehiculo = (catalogos: CatalogosDto) => catalogos.tipos_vehiculo;

type MotivoSelector = (catalogos: CatalogosDto) => MotivoDto[];

const motivoSelectors = new Map<AmbitoMotivo, MotivoSelector>();

/** The reasons of one scope; the same function every time for the same scope. */
export function selectMotivos(ambito: AmbitoMotivo): MotivoSelector {
  let selector = motivoSelectors.get(ambito);
  if (!selector) {
    selector = (catalogos) => catalogos.motivos.filter((motivo) => motivo.ambito === ambito);
    motivoSelectors.set(ambito, selector);
  }
  return selector;
}

type AspectoSelector = (catalogos: CatalogosDto) => AspectoCalificacionDto[];

const aspectoSelectors = new Map<RolCalificado, AspectoSelector>();

/** The rating aspects about one role; the same function every time for the same role. */
export function selectAspectosCalificacion(rol: RolCalificado): AspectoSelector {
  let selector = aspectoSelectors.get(rol);
  if (!selector) {
    selector = (catalogos) =>
      catalogos.aspectos_calificacion.filter((aspecto) => aspecto.rol_calificado === rol);
    aspectoSelectors.set(rol, selector);
  }
  return selector;
}

export function useTiposAlimento() {
  return useQuery({ ...catalogosQuery(), select: selectTiposAlimento });
}

export function useUnidades() {
  return useQuery({ ...catalogosQuery(), select: selectUnidades });
}

export function useTiposVehiculo() {
  return useQuery({ ...catalogosQuery(), select: selectTiposVehiculo });
}

export function useMotivos(ambito: AmbitoMotivo) {
  return useQuery({ ...catalogosQuery(), select: selectMotivos(ambito) });
}

/** The rating aspects about `rol` (the rated party), from the shared catalog request. */
export function useAspectosCalificacion(rol: RolCalificado) {
  return useQuery({ ...catalogosQuery(), select: selectAspectosCalificacion(rol) });
}
