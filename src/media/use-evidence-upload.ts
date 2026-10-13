/**
 * React state around the resumable upload pipeline: one photo at a time, with a `retry`
 * that resumes from the stage that failed (same evidence `id`, no repeated PUT once
 * uploaded). Registration goes through `useRegistrarEvidenciaMutation`, so a success
 * invalidates the parent's evidence list.
 */
import { useRef, useState } from "react";

import { messageFor } from "@/api/problem-messages";
import { useRegistrarEvidenciaMutation } from "@/services/evidencias";

import {
  createPendingEvidence,
  runEvidencePipeline,
  type EvidenceDeps,
  type EvidenceTarget,
  type PendingEvidence,
} from "./evidence-upload";
import { nativeEvidenceDeps } from "./native-evidence-deps";
import type { PickedPhoto } from "./use-photo-capture";

export type EvidenceUploadStatus = "idle" | "working" | "error" | "done";

/** `id` is set only when the evidence was registered with the API. */
export interface UploadedPhoto {
  ruta: string;
  id?: string;
}

export function useEvidenceUpload(
  target: EvidenceTarget,
  {
    onUploaded,
    deps = nativeEvidenceDeps,
  }: { onUploaded?: (result: UploadedPhoto) => void; deps?: Omit<EvidenceDeps, "register"> } = {},
) {
  const { mutateAsync: registrar } = useRegistrarEvidenciaMutation();
  const [pending, setPending] = useState<PendingEvidence | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The latest state, read by `retry` even before React re-renders. */
  const latest = useRef<PendingEvidence | null>(null);

  const track = (state: PendingEvidence) => {
    latest.current = state;
    setPending(state);
  };

  const run = async (state: PendingEvidence) => {
    track(state);
    setWorking(true);
    setError(null);
    try {
      const done = await runEvidencePipeline(state, target, { ...deps, register: registrar }, track);
      if (done.ruta) {
        onUploaded?.(done.stage === "registered" ? { ruta: done.ruta, id: done.id } : { ruta: done.ruta });
      }
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setWorking(false);
    }
  };

  /** Starts over with a new photo (and a new evidence id). */
  const start = (photo: PickedPhoto) => run(createPendingEvidence(photo));

  /** Resumes the current photo from the stage that failed. */
  const retry = async () => {
    if (latest.current) await run(latest.current);
  };

  const finalStage = target.registro ? "registered" : "uploaded";
  const status: EvidenceUploadStatus = working
    ? "working"
    : error !== null
      ? "error"
      : pending?.stage === finalStage
        ? "done"
        : "idle";

  return { pending, status, error, start, retry };
}
