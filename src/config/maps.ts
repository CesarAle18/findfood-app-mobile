/**
 * Whether this build can show Google Maps. The Maps SDK aborts the app natively (an
 * uncatchable "API key not found") when the build has no key, so the map components show a
 * placeholder instead. `app.config.ts` writes `extra.googleMaps` only for platforms built
 * with a key.
 *
 * In a development client the config comes from the dev server: keep its environment in
 * step with the native build (a key added to .env.local needs a new native build too).
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

type GoogleMapsExtra = { android?: unknown; ios?: unknown };

export function hasGoogleMapsKey(
  os: string = Platform.OS,
  extra: Record<string, unknown> | undefined = Constants.expoConfig?.extra,
): boolean {
  const googleMaps = extra?.googleMaps as GoogleMapsExtra | undefined;
  if (os === "android") return googleMaps?.android === true;
  if (os === "ios") return googleMaps?.ios === true;
  return false;
}
