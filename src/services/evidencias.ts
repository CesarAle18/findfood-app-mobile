/**
 * Evidence photos (`/evidencias`). The file goes straight to Storage with a signed URL
 * (`solicitarSubida`); the API then records it (`registrarEvidencia`) under exactly one
 * parent: a donation, a stop, a reception or an incident.
 */
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";

import { api } from "@/api";
import type { Coordenada } from "@/api/types";

import { invalidateOnSuccess, queryKeys, type Invalidation } from "./query-keys";

// --- DTOs ------------------------------------------------------------------------------

/** Decides the bucket: evidence, product photo, identity document or vehicle photo. */
export type PropositoSubida = "EVIDENCIA" | "PRODUCTO" | "DOCUMENTO_IDENTIDAD" | "VEHICULO";

/** `pdf` only for DOCUMENTO_IDENTIDAD. */
export type ExtensionSubida = "jpg" | "jpeg" | "png" | "webp" | "heic" | "pdf";

/** `POST /evidencias/upload-url`; both default on the API (EVIDENCIA, jpg). */
export type SolicitarSubidaBody = {
  proposito?: PropositoSubida;
  extension?: ExtensionSubida;
};

export interface SubidaDto {
  /** Storage path to send back when registering (`ruta`, `ruta_foto`, …). */
  ruta: string;
  url_subida: string;
  token: string;
  expira_en_segundos: number;
}

/**
 * PUBLICACION goes under a donation, RECOGIDA and ENTREGA under a stop, RECEPCION under a
 * reception, INCIDENCIA under an incident.
 */
export type TipoEvidencia = "PUBLICACION" | "RECOGIDA" | "ENTREGA" | "RECEPCION" | "INCIDENCIA";

type CampoPadre = "donacion_id" | "parada_id" | "recepcion_id" | "incidencia_id";

/** Exactly one parent id, e.g. `{ parada_id }`. */
export type PadreEvidencia = {
  [K in CampoPadre]: { [P in K]: string } & { [P in Exclude<CampoPadre, K>]?: never };
}[CampoPadre];

export type MimeEvidencia =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "application/pdf";

/** `POST /evidencias`: resending the same `id` is idempotent (offline queue). */
export type RegistrarEvidenciaBody = PadreEvidencia & {
  /** UUID generated on the device. */
  id: string;
  tipo: TipoEvidencia;
  /** `ruta` from `POST /evidencias/upload-url`, already uploaded. */
  ruta: string;
  /** Device time (ISO) when captured. */
  capturada_at: string;
  ubicacion?: Coordenada;
  precision_m?: number;
  /** SHA-256, lowercase hex. */
  hash_archivo?: string;
  mime_type?: MimeEvidencia;
  tamano_bytes?: number;
};

/** A recorded evidence (`POST /evidencias` answer). */
export interface EvidenciaDto {
  id: string;
  tipo: TipoEvidencia;
  ruta: string;
  donacion_id: string | null;
  parada_id: string | null;
  recepcion_id: string | null;
  incidencia_id: string | null;
  capturada_at: string;
  created_at: string;
  precision_m: number | null;
  hash_archivo: string | null;
  mime_type: string | null;
  tamano_bytes: number | null;
  subida_por: string;
  lat: number | null;
  lng: number | null;
}

/** A row of `GET /evidencias`, oldest capture first. */
export interface EvidenciaConUrlDto extends EvidenciaDto {
  /** Signed read URL, valid for 5 minutes. */
  url_lectura: string | null;
}

// --- Requests ----------------------------------------------------------------------------

export function solicitarSubida(body: SolicitarSubidaBody = {}): Promise<SubidaDto> {
  return api.post<SubidaDto>("/evidencias/upload-url", { body });
}

export function registrarEvidencia(body: RegistrarEvidenciaBody): Promise<EvidenciaDto> {
  return api.post<EvidenciaDto>("/evidencias", { body });
}

export function getEvidencias(
  padre: PadreEvidencia,
  signal?: AbortSignal,
): Promise<EvidenciaConUrlDto[]> {
  return api.get<EvidenciaConUrlDto[]>("/evidencias", { query: padre, signal });
}

// --- Queries -----------------------------------------------------------------------------

export function evidenciasQuery(padre: PadreEvidencia) {
  return queryOptions({
    queryKey: queryKeys.evidencias.list(padre),
    queryFn: ({ signal }) => getEvidencias(padre, signal),
  });
}

export function useEvidencias(padre: PadreEvidencia) {
  return useQuery(evidenciasQuery(padre));
}

// --- Mutations ---------------------------------------------------------------------------

const CAMPOS_PADRE: readonly CampoPadre[] = [
  "donacion_id",
  "parada_id",
  "recepcion_id",
  "incidencia_id",
];

/** The parent of a registration, shaped like the `useEvidencias` argument. */
function padreDe(body: RegistrarEvidenciaBody): PadreEvidencia {
  const campo = CAMPOS_PADRE.find((c) => body[c]) ?? "donacion_id";
  return { [campo]: body[campo] } as PadreEvidencia;
}

/** What each mutation leaves stale. */
const invalidates = {
  /** The evidence list of its parent. */
  registrar: (_: unknown, body: RegistrarEvidenciaBody) => [
    queryKeys.evidencias.list(padreDe(body)),
  ],
  /** A signed upload URL changes nothing until the evidence is registered. */
  solicitarSubida: () => [],
} satisfies Record<string, Invalidation<never, never>>;

export function useSolicitarSubidaMutation() {
  return useMutation({
    mutationFn: (body: SolicitarSubidaBody) => solicitarSubida(body),
    onSuccess: invalidateOnSuccess(invalidates.solicitarSubida),
  });
}

export function useRegistrarEvidenciaMutation() {
  return useMutation({
    mutationFn: registrarEvidencia,
    onSuccess: invalidateOnSuccess(invalidates.registrar),
  });
}
