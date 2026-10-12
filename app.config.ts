/**
 * Build-time part of the app config. The static config stays in app.json: Expo reads it
 * first and passes it here as `config`.
 *
 * Google Sign-In on iOS needs the iOS client id, reversed, as a URL scheme. It is derived
 * from EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (the same variable the app reads at runtime), so
 * the plugin is only added when that variable is set for the build. Without options the
 * plugin would switch to its Firebase mode, which this app does not use. Android needs no
 * native setup: the app passes the web client id at runtime and Google recognizes the app
 * by its package name and the SHA-1 of its signing certificate.
 */
import type { ConfigContext, ExpoConfig } from "expo/config";

const GOOGLE_SIGN_IN_PLUGIN = "@react-native-google-signin/google-signin";
const IOS_CLIENT_ID = /^([\w-]+)\.apps\.googleusercontent\.com$/;

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

export default function appConfig({ config }: ConfigContext): Partial<ExpoConfig> {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim();
  if (!iosClientId) return config;
  return {
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      [GOOGLE_SIGN_IN_PLUGIN, { iosUrlScheme: googleIosUrlScheme(iosClientId) }],
    ],
  };
}
