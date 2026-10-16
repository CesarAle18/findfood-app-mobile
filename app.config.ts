/**
 * Build-time part of the app config. The static config stays in app.json: Expo reads it
 * first and passes it here as `config`. Every addition below depends on a build-time
 * variable and is left out when that variable is unset, so the config stays exactly what
 * app.json declares on a machine without them.
 *
 * Google Sign-In on iOS needs the iOS client id, reversed, as a URL scheme. It is derived
 * from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (the same variable the app reads at runtime), so
 * the plugin is only added when that variable is set for the build. Without options the
 * plugin would switch to its Firebase mode, which this app does not use. Android needs no
 * native setup: the app passes the web client id at runtime and Google recognizes the app
 * by its package name and the SHA-1 of its signing certificate.
 *
 * Google Maps keys come from GOOGLE_MAPS_ANDROID_API_KEY / GOOGLE_MAPS_IOS_API_KEY. They are
 * not EXPO_PUBLIC_: the plugin writes them into the native project (AndroidManifest and
 * Info.plist), never into the JavaScript bundle. Restrict each key to its platform and app
 * identifier in Google Cloud.
 *
 * EAS_PROJECT_ID fills `extra.eas.projectId` (used by expo-notifications for push tokens)
 * when `eas init` has not written it to app.json.
 */
import type { ConfigContext, ExpoConfig } from "expo/config";

type Plugins = NonNullable<ExpoConfig["plugins"]>;

const GOOGLE_SIGN_IN_PLUGIN = "@react-native-google-signin/google-signin";
const MAPS_PLUGIN = "react-native-maps";
const IOS_CLIENT_ID = /^([\w-]+)\.apps\.googleusercontent\.com$/;

/** A build-time variable, trimmed; `undefined` when unset or blank. */
function buildVariable(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** `<id>.apps.googleusercontent.com` → `com.googleusercontent.apps.<id>`. */
function googleIosUrlScheme(iosClientId: string): string {
  const match = IOS_CLIENT_ID.exec(iosClientId);
  if (!match) {
    throw new Error(
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must look like "<id>.apps.googleusercontent.com" (got "${iosClientId}").`,
    );
  }
  return `com.googleusercontent.apps.${match[1]}`;
}

function googleSignInPlugins(): Plugins {
  const iosClientId = buildVariable("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID");
  if (!iosClientId) return [];
  return [[GOOGLE_SIGN_IN_PLUGIN, { iosUrlScheme: googleIosUrlScheme(iosClientId) }]];
}

function mapsPlugins(): Plugins {
  const androidGoogleMapsApiKey = buildVariable("GOOGLE_MAPS_ANDROID_API_KEY");
  const iosGoogleMapsApiKey = buildVariable("GOOGLE_MAPS_IOS_API_KEY");
  if (!androidGoogleMapsApiKey && !iosGoogleMapsApiKey) return [];
  return [[MAPS_PLUGIN, { androidGoogleMapsApiKey, iosGoogleMapsApiKey }]];
}

export default function appConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  const extraPlugins = [...googleSignInPlugins(), ...mapsPlugins()];
  const easProjectId = buildVariable("EAS_PROJECT_ID");
  if (extraPlugins.length === 0 && !easProjectId) return config;

  const resolved: Partial<ExpoConfig> = {
    ...config,
    plugins: [...(config.plugins ?? []), ...extraPlugins],
  };
  if (easProjectId) {
    resolved.extra = {
      ...config.extra,
      eas: { ...config.extra?.eas, projectId: easProjectId },
    };
  }
  return resolved;
}
