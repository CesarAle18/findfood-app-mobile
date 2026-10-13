/**
 * Takes or picks a photo, compresses it and uploads it, showing the thumbnail and the
 * upload status (Subiendo… / error with Reintentar / Lista).
 *
 * - `mode="evidence"` registers the photo as an evidence of `tipo` under `padre`.
 * - `mode="file"` only uploads it and reports the Storage `ruta` for another endpoint's
 *   body (product photo, vehicle, identity documents).
 *
 * Limitation: screens not yet bound to a real entity have no `padre`. An evidence field
 * without `padre` uploads the photo and reports its `ruta` through `onUploaded`, but does
 * not register it; registration happens once the screen knows its parent.
 */
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import type { EvidenceTarget } from "@/media/evidence-upload";
import { useEvidenceUpload, type UploadedPhoto } from "@/media/use-evidence-upload";
import { choosePhotoSource, usePhotoCapture } from "@/media/use-photo-capture";
import { colors } from "@/design/tokens";
import type { PadreEvidencia, PropositoSubida, TipoEvidencia } from "@/services/evidencias";

import { Icon } from "./icon";
import { PermissionNotice } from "./permission-notice";
import { Button, Copy, Row, Stack } from "./ui";

export interface PhotoFieldProps {
  label: string;
  mode: "evidence" | "file";
  proposito: PropositoSubida;
  /** Evidence type; required to register in `evidence` mode. */
  tipo?: TipoEvidencia;
  /** Parent entity; without it an evidence is uploaded but not registered (see above). */
  padre?: PadreEvidencia;
  onUploaded?: (result: UploadedPhoto) => void;
  disabled?: boolean;
  /** Shorter empty state, for side-by-side fields. */
  compact?: boolean;
}

const THUMBNAIL = 72;

export function PhotoField({
  label,
  mode,
  proposito,
  tipo,
  padre,
  onUploaded,
  disabled = false,
  compact = false,
}: PhotoFieldProps) {
  const target: EvidenceTarget =
    mode === "evidence" && tipo && padre ? { proposito, registro: { tipo, padre } } : { proposito };
  const { pending, status, error, start, retry } = useEvidenceUpload(target, { onUploaded });
  const { pick, cameraGate, requestCamera } = usePhotoCapture();
  /** The user tried the camera and did not get it: explain how to enable it. */
  const [cameraRefused, setCameraRefused] = useState(false);
  const working = status === "working";

  const choose = async () => {
    const source = await choosePhotoSource();
    if (!source) return;
    const photo = await pick(source);
    setCameraRefused(source === "camera" && photo === null);
    if (photo) await start(photo);
  };

  return (
    <Stack gap={8}>
      {pending ? (
        <Row>
          <Image
            source={{ uri: pending.localUri }}
            recyclingKey={pending.id}
            contentFit="cover"
            style={styles.thumbnail}
            accessibilityLabel={`${label}: foto seleccionada`}
          />
          <View style={styles.status}>
            <Copy
              weight="medium"
              style={status === "error" ? { color: colors.danger } : undefined}
            >
              {statusText[status]}
            </Copy>
            {error !== null ? <Copy tone="secondary">{error}</Copy> : null}
            {!working ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${label}: cambiar foto`}
                disabled={disabled}
                onPress={() => void choose()}
                style={styles.change}
              >
                <Copy tone="primary" weight="medium">
                  Cambiar foto
                </Copy>
              </Pressable>
            ) : null}
          </View>
        </Row>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: agregar foto`}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void choose()}
          style={[styles.empty, compact && styles.compact, disabled && { opacity: 0.5 }]}
        >
          <Icon name="camera" size={30} color={colors.secondary} />
          <Copy tone="secondary">Agregar foto</Copy>
        </Pressable>
      )}
      {status === "error" ? (
        <Button variant="outline" onPress={() => void retry()} disabled={disabled}>
          Reintentar
        </Button>
      ) : null}
      {cameraRefused ? (
        <PermissionNotice
          title="Permite el acceso a la cámara"
          body="Find Food la necesita para tomar la foto. También puedes elegir una de tu galería."
          gate={cameraGate}
          onRequest={() => void requestCamera()}
        />
      ) : null}
    </Stack>
  );
}

const statusText = {
  idle: "Foto seleccionada",
  working: "Subiendo…",
  error: "No se pudo subir la foto",
  done: "Lista",
} as const;

const styles = StyleSheet.create({
  empty: {
    minHeight: 150,
    gap: 6,
    backgroundColor: colors.muted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
  },
  compact: { minHeight: 96 },
  thumbnail: {
    width: THUMBNAIL,
    height: THUMBNAIL,
    borderRadius: 10,
    backgroundColor: colors.muted,
  },
  status: { flex: 1, gap: 4 },
  change: { minHeight: 44, justifyContent: "center" },
});
