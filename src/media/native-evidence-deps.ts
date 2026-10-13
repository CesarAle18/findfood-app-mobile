/**
 * The real `EvidenceDeps`: expo-image-manipulator for compression, expo-file-system for the
 * binary PUT to Supabase Storage, and the `/evidencias` requests. File bytes never enter JS
 * (no base64): the manipulator writes to the cache directory and `File.upload` streams the
 * file natively.
 */
import { File, UploadType } from "expo-file-system";
import { ImageManipulator, SaveFormat, type ImageRef } from "expo-image-manipulator";

import { ApiError } from "@/api/errors";
import { registrarEvidencia, solicitarSubida } from "@/services/evidencias";

import type { EvidenceDeps, UploadResponse } from "./evidence-upload";

/** Widest side kept for uploads; larger photos are scaled down, keeping their ratio. */
export const MAX_UPLOAD_WIDTH = 1600;
/** JPEG quality of the uploaded copy (0–1). */
export const UPLOAD_QUALITY = 0.7;

/**
 * Re-encodes as JPEG (HEIC and PNG included) and scales down to `MAX_UPLOAD_WIDTH` only when
 * the photo is wider. `width` comes from the picker; when unknown the image is rendered once
 * to measure it.
 */
export async function compressImage(uri: string, width?: number) {
  let image: ImageRef;
  if (width) {
    const context = ImageManipulator.manipulate(uri);
    if (width > MAX_UPLOAD_WIDTH) context.resize({ width: MAX_UPLOAD_WIDTH });
    image = await context.renderAsync();
  } else {
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    image =
      original.width > MAX_UPLOAD_WIDTH
        ? await ImageManipulator.manipulate(original).resize({ width: MAX_UPLOAD_WIDTH }).renderAsync()
        : original;
  }
  const saved = await image.saveAsync({ compress: UPLOAD_QUALITY, format: SaveFormat.JPEG });
  return { uri: saved.uri, size: new File(saved.uri).size };
}

/**
 * Same request as supabase-js `uploadToSignedUrl` with a binary body: PUT to the signed URL
 * (its `?token=` authorizes it), `x-upsert: false`, the file's content type and a one-hour
 * cache. Non-2xx answers resolve; `classifyUploadResponse` decides what they mean.
 */
export async function putFile(uri: string, url: string): Promise<UploadResponse> {
  try {
    const { status, body } = await new File(uri).upload(url, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: "image/jpeg",
      headers: { "x-upsert": "false", "cache-control": "max-age=3600" },
    });
    return { status, body };
  } catch (error) {
    throw ApiError.network(error);
  }
}

export const nativeEvidenceDeps: EvidenceDeps = {
  compressImage,
  requestUploadUrl: solicitarSubida,
  putFile,
  register: registrarEvidencia,
};
