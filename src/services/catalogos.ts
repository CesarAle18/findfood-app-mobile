/**
 * Active catalogs for the forms (`GET /catalogos`): food types, units, vehicles, reasons…
 *
 * Catalogs change rarely, so they stay fresh for an hour. Requests are normalized (each
 * catalog once, sorted) so the same set of catalogs always shares one cache entry.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";

import { api } from "@/api";
import type { TipoAlmacenamiento } from "@/api/types";

import { queryKeys, sortedUnique } from "./query-keys";

const CATALOGOS_STALE_TIME_MS = 60 * 60 * 1000;

// --- DTOs ------------------------------------------------------------------------------

export type Catalogo =
  | "categorias_alimento"
  | "tipos_alimento"
  | "unidades_medida"
  | "tipos_vehiculo"
  | "motivos"
  | "tipos_incidencia"
  | "tipos_destino_distribucion";

/** Scope of a reason (`motivos`), sent as `ambito` to filter them. */
export type AmbitoMotivo =
  | "RECHAZO_ASIGNACION"
  | "ABANDONO_ASIGNACION"
  | "CANCELACION_DONACION"
  | "RECHAZO_RECEPCION"
  | "RECHAZO_VERIFICACION";

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
  /** The request must then include an `observacion`. */
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

/** Every catalog; a response only carries the ones requested. */
export interface CatalogosDto {
  categorias_alimento: CategoriaAlimentoDto[];
  tipos_alimento: TipoAlimentoDto[];
  unidades_medida: UnidadMedidaDto[];
  tipos_vehiculo: TipoVehiculoDto[];
  motivos: MotivoDto[];
  tipos_incidencia: TipoIncidenciaDto[];
  tipos_destino_distribucion: TipoDestinoDistribucionDto[];
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

export function catalogosQuery<K extends Catalogo>(incluir: readonly K[], ambito?: AmbitoMotivo) {
  return queryOptions({
    queryKey: queryKeys.catalogos.byIncluir(incluir, ambito),
    queryFn: ({ signal }) => getCatalogos(incluir, ambito, signal),
    staleTime: CATALOGOS_STALE_TIME_MS,
  });
}

/** e.g. `useCatalogos(["tipos_alimento", "unidades_medida"])`. */
export function useCatalogos<K extends Catalogo>(incluir: readonly K[], ambito?: AmbitoMotivo) {
  return useQuery(catalogosQuery(incluir, ambito));
}
