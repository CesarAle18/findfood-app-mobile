/**
 * One shape for every runtime permission the app asks for (camera, photos, notifications,
 * location). Expo answers with `{ status, granted, canAskAgain }`; screens only need to know
 * whether to go ahead, offer the system prompt, or send the user to the app's settings.
 */
import type { PermissionResponse } from "expo";

/**
 * - `unknown`: the status has not loaded yet.
 * - `granted`: go ahead.
 * - `denied`: not granted, but the system prompt can still be shown (never asked, or
 *   denied once).
 * - `blocked`: not granted and the OS will not show the prompt again; only the app's
 *   settings can change it.
 */
export type PermissionGate = "unknown" | "granted" | "denied" | "blocked";

export function toPermissionGate(
  response: Pick<PermissionResponse, "granted" | "canAskAgain"> | null | undefined,
): PermissionGate {
  if (!response) return "unknown";
  if (response.granted) return "granted";
  return response.canAskAgain === false ? "blocked" : "denied";
}

/** An Expo permission hook, such as `ImagePicker.useCameraPermissions`. */
export type PermissionHook<T extends PermissionResponse = PermissionResponse> = () => [
  T | null,
  () => Promise<T>,
  () => Promise<T>,
];

/**
 * Wraps an Expo permission hook: `gate` follows the current status and `request` shows the
 * system prompt (when the OS still allows it) and resolves to the resulting gate.
 */
export function usePermissionGate<T extends PermissionResponse>(
  usePermissions: PermissionHook<T>,
): { gate: PermissionGate; request: () => Promise<PermissionGate> } {
  const [status, requestPermission] = usePermissions();
  const request = async () => toPermissionGate(await requestPermission());
  return { gate: toPermissionGate(status), request };
}
