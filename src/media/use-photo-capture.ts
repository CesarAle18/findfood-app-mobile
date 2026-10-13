/**
 * Takes or picks one photo. The camera needs its runtime permission; the system photo picker
 * does not (it only exposes what the user selects), so the library permission is offered
 * but never required to pick. Quality stays at 1: compression happens later, once, in the
 * upload pipeline.
 */
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { usePermissionGate, type PermissionGate } from "@/platform/permissions";

export type PhotoSource = "camera" | "library";

/** The picked file and its width (0 when the system does not report it). */
export interface PickedPhoto {
  uri: string;
  width: number;
}

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };

/** Native action sheet-like choice between camera and library; resolves null on cancel. */
export function choosePhotoSource(): Promise<PhotoSource | null> {
  return new Promise((resolve) => {
    Alert.alert(
      "Agregar foto",
      undefined,
      [
        { text: "Tomar foto", onPress: () => resolve("camera") },
        { text: "Elegir de la galería", onPress: () => resolve("library") },
        { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

export function usePhotoCapture(): {
  /** Resolves the photo, or null when cancelled or the camera permission is missing. */
  pick: (source: PhotoSource) => Promise<PickedPhoto | null>;
  cameraGate: PermissionGate;
  libraryGate: PermissionGate;
  requestCamera: () => Promise<PermissionGate>;
  requestLibrary: () => Promise<PermissionGate>;
} {
  const { gate: cameraGate, request: requestCamera } = usePermissionGate(
    ImagePicker.useCameraPermissions,
  );
  const { gate: libraryGate, request: requestLibrary } = usePermissionGate(
    ImagePicker.useMediaLibraryPermissions,
  );

  const pick = async (source: PhotoSource): Promise<PickedPhoto | null> => {
    if (source === "camera" && cameraGate !== "granted") {
      if ((await requestCamera()) !== "granted") return null;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS)
        : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    const asset = result.canceled ? undefined : result.assets[0];
    return asset ? { uri: asset.uri, width: asset.width } : null;
  };

  return { pick, cameraGate, libraryGate, requestCamera, requestLibrary };
}
