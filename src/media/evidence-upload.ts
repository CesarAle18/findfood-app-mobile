/**
 * Resumable photo upload: compress → upload to Storage → register with the API.
 *
 * Each stage returns a new `PendingEvidence`, reported through `onProgress`, so a failure
 * keeps everything done so far and a retry resumes from the stage that failed. The evidence
 * `id` is generated once, at capture: a retried registration resends the same `id`, which
 * the API treats as idempotent (201 with the existing record), so a network cut never
 * duplicates an evidence. Native work (image manipulation, the file PUT) is injected through
 * `EvidenceDeps`, so this module runs under Jest without native modules.
 */
import { randomUUID } from "expo-crypto";

import { ApiError } from "@/api/errors";
import type { Coordenada } from "@/api/types";
import type {
  EvidenciaDto,
  PadreEvidencia,
  PropositoSubida,
  RegistrarEvidenciaBody,
  SolicitarSubidaBody,
  SubidaDto,
  TipoEvidencia,
} from "@/services/evidencias";

/**
 * - `captured`: the picker's original file (any format, full size).
 * - `compressed`: a JPEG of at most 1600 px wide in the cache directory.
 * - `uploaded`: the JPEG is in Storage at `ruta`.
 * - `registered`: the API recorded the evidence under its parent.
 */
export type EvidenceStage = "captured" | "compressed" | "uploaded" | "registered";

export interface PendingEvidence {
  /** UUID generated on the device at capture; never regenerated on retry. */
  id: string;
  /** The picker's file until compressed, then the compressed JPEG. */
  localUri: string;
  /** Device time (ISO) when the photo was taken or picked. */
  capturadaAt: string;
  /** Always JPEG: compression converts every format (HEIC included). */
  mime: "image/jpeg";
  /** Original width from the picker, when known; skips a render to measure it. */
  width?: number;
  /** Bytes of the compressed JPEG. */
  size?: number;
  /** Storage path, once uploaded. */
  ruta?: string;
  stage: EvidenceStage;
}

/** Where the photo goes: the bucket and, for evidences, the registration under a parent. */
export interface EvidenceTarget {
  proposito: PropositoSubida;
  /** Omitted for files sent in another endpoint's body (product, vehicle, documents). */
  registro?: {
    tipo: TipoEvidencia;
    padre: PadreEvidencia;
    ubicacion?: Coordenada;
  };
}

/** What Storage answered to the PUT; non-2xx statuses resolve too. */
export interface UploadResponse {
  status: number;
  body: string;
}

export interface EvidenceDeps {
  /** Writes a JPEG (≤1600 px wide, quality 0.7) and returns its URI and size in bytes. */
  compressImage(uri: string, width?: number): Promise<{ uri: string; size: number }>;
  requestUploadUrl(body: SolicitarSubidaBody): Promise<SubidaDto>;
  /** PUTs the file's bytes to the signed URL; rejects only when no response arrived. */
  putFile(uri: string, url: string): Promise<UploadResponse>;
  register(body: RegistrarEvidenciaBody): Promise<EvidenciaDto>;
}

export type OnEvidenceProgress = (state: PendingEvidence) => void;

export function createPendingEvidence(
  asset: { uri: string; width?: number },
  newId: () => string = randomUUID,
  capturedAt: Date = new Date(),
): PendingEvidence {
  return {
    id: newId(),
    localUri: asset.uri,
    capturadaAt: capturedAt.toISOString(),
    mime: "image/jpeg",
    // The picker reports 0 when the system does not provide it.
    ...(asset.width ? { width: asset.width } : {}),
    stage: "captured",
  };
}

/**
 * Runs the remaining stages for `target` and resolves the final state. Without
 * `target.registro` it stops at `uploaded`. On failure it rejects with the stage's error;
 * the last state reported through `onProgress` is the one to retry with.
 */
export async function runEvidencePipeline(
  state: PendingEvidence,
  target: EvidenceTarget,
  deps: EvidenceDeps,
  onProgress?: OnEvidenceProgress,
): Promise<PendingEvidence> {
  let current = state;
  const advance = (next: PendingEvidence) => {
    current = next;
    onProgress?.(next);
  };

  if (current.stage === "captured") advance(await compress(current, deps));
  if (current.stage === "compressed") advance(await upload(current, target.proposito, deps));
  if (current.stage === "uploaded" && target.registro) {
    advance(await register(current, target.registro, deps));
  }
  return current;
}

/**
 * Compresses and uploads only, for files whose `ruta` goes in another endpoint's body
 * (`ruta_foto`, `url_foto_vehiculo`, `documento_frente`…). The result has `ruta` set.
 */
export function uploadFileOnly(
  state: PendingEvidence,
  proposito: PropositoSubida,
  deps: EvidenceDeps,
  onProgress?: OnEvidenceProgress,
): Promise<PendingEvidence> {
  return runEvidencePipeline(state, { proposito }, deps, onProgress);
}

// --- Stages ------------------------------------------------------------------------------

async function compress(state: PendingEvidence, deps: EvidenceDeps): Promise<PendingEvidence> {
  const { uri, size } = await deps.compressImage(state.localUri, state.width);
  return { ...state, localUri: uri, size, stage: "compressed" };
}

/**
 * Asks for a signed URL and PUTs the JPEG. A URL is never reused across attempts: each one
 * names a new object, and the `ruta` is only kept once its PUT succeeded. An expired URL
 * gets one fresh replacement within the same attempt.
 */
async function upload(
  state: PendingEvidence,
  proposito: PropositoSubida,
  deps: EvidenceDeps,
): Promise<PendingEvidence> {
  for (let attempt = 0; ; attempt++) {
    const { ruta, url_subida } = await deps.requestUploadUrl({ proposito, extension: "jpg" });
    const response = await deps.putFile(state.localUri, url_subida);
    const outcome = classifyUploadResponse(response);
    if (outcome === "uploaded") return { ...state, ruta, stage: "uploaded" };
    if (outcome === "failed" || attempt > 0) throw uploadError(response);
  }
}

async function register(
  state: PendingEvidence,
  { tipo, padre, ubicacion }: NonNullable<EvidenceTarget["registro"]>,
  deps: EvidenceDeps,
): Promise<PendingEvidence> {
  await deps.register({
    id: state.id,
    tipo,
    ruta: state.ruta!,
    capturada_at: state.capturadaAt,
    ...padre,
    ...(ubicacion ? { ubicacion } : {}),
    mime_type: state.mime,
    ...(state.size ? { tamano_bytes: state.size } : {}),
  });
  return { ...state, stage: "registered" };
}

// --- Storage answers ---------------------------------------------------------------------

/**
 * Supabase Storage (`PUT /object/upload/sign/<bucket>/<path>?token=…`) reports errors as
 * `{ statusCode, error, message }`, where `statusCode` is a string and the HTTP status may
 * be a generic 400:
 * - an existing object is `Duplicate` (`statusCode` "409"): a previous PUT already landed;
 * - an expired or invalid upload token is `InvalidJWT` / `Unauthorized` ("403" or HTTP
 *   401/403): the URL must be requested again.
 */
export function classifyUploadResponse({
  status,
  body,
}: UploadResponse): "uploaded" | "expired" | "failed" {
  if (status >= 200 && status < 300) return "uploaded";
  const problem = parseStorageError(body);
  if (status === 409 || problem.statusCode === "409" || problem.error === "Duplicate") {
    return "uploaded";
  }
  if (
    status === 401 ||
    status === 403 ||
    problem.statusCode === "401" ||
    problem.statusCode === "403" ||
    /invalidjwt|unauthorized|jwt expired|"exp" claim/i.test(`${problem.error ?? ""} ${problem.message ?? ""}`)
  ) {
    return "expired";
  }
  return "failed";
}

function parseStorageError(body: string): { statusCode?: string; error?: string; message?: string } {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") return {};
    const { statusCode, error, message } = parsed as Record<string, unknown>;
    return {
      statusCode: statusCode === undefined ? undefined : String(statusCode),
      error: typeof error === "string" ? error : undefined,
      message: typeof message === "string" ? message : undefined,
    };
  } catch {
    return {};
  }
}

/** An `ApiError` so `messageFor` shows the usual Spanish message for the status. */
function uploadError({ status, body }: UploadResponse): ApiError {
  const type =
    status === 413 ? "carga-demasiado-grande" : status >= 500 ? "error-interno" : "error";
  return new ApiError({
    type,
    status,
    title: "Storage upload failed",
    detail: body.slice(0, 200),
  });
}
