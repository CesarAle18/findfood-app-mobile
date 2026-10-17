/**
 * Small device-local values. Kept apart from the session module so `@/services/perfil` can
 * store the push registration without importing the session, which imports the location
 * task, which imports `@/services/perfil` again.
 *
 * SecureStore has no web implementation: the web preview keeps nothing. Failures are
 * ignored; these are preferences, never the session itself.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Written by the push registration (see deviceIdStorage); unregistered on sign-out. */
const DEVICE_ID_KEY = "findfood.deviceId";

export async function readItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function writeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // See above.
  }
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // See above.
  }
}

/**
 * Id of this install's push registration (`POST /me/dispositivos`), kept so sign-out can
 * unregister it. Written by `@/services/perfil`. `read` and `clear` never reject; `save`
 * does, because a lost id would leave the device registered after sign-out and the caller
 * has to roll the registration back.
 */
export const deviceIdStorage = {
  read: (): Promise<string | null> => readItem(DEVICE_ID_KEY),
  save: async (id: string): Promise<void> => {
    if (Platform.OS === "web") return;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  },
  clear: (): Promise<void> => deleteItem(DEVICE_ID_KEY),
};
