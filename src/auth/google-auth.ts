/**
 * Native Google sign-in with the original `GoogleSignin` API of
 * @react-native-google-signin/google-signin: Google returns an ID token and Supabase
 * exchanges it for a session (`signInWithIdToken`). That API sends no nonce, so the Supabase
 * Google provider has "Skip nonce checks" on (see docs/integracion-backend.md).
 *
 * Like email-auth, nothing here navigates: the new session reaches the session provider
 * through `onAuthStateChange` and the root guards open the right screen. A new Google
 * account has no phone or last names, so `/me` lists them as pending and the guards open the
 * profile completion.
 *
 * Needs a development or release build: Expo Go does not include the native module.
 */
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { AuthError } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { env } from "@/config/env";

import { supabase, trackSignIn } from "./supabase";

// App-defined AuthError codes; `messageFor` explains each one in Spanish.
/** This build has no Google client ids (or no Supabase client). */
export const GOOGLE_UNAVAILABLE_CODE = "google_unavailable";
export const GOOGLE_PLAY_SERVICES_CODE = "google_play_services_unavailable";
export const GOOGLE_ID_TOKEN_MISSING_CODE = "google_id_token_missing";
/** Any other native failure, e.g. DEVELOPER_ERROR for a SHA-1 missing in Google Cloud. */
export const GOOGLE_SIGN_IN_FAILED_CODE = "google_sign_in_failed";

function googleError(message: string, code: string): AuthError {
  return new AuthError(message, undefined, code);
}

const playServicesError = () =>
  googleError("Google Play services are not available", GOOGLE_PLAY_SERVICES_CODE);

/**
 * True when this build can sign in with Google: a Supabase client, the web client id (the
 * ID token's audience) and, on iOS, the iOS client id. Never on the web preview.
 */
export function isGoogleSignInAvailable(): boolean {
  if (!supabase || !env.googleWebClientId || Platform.OS === "web") return false;
  // Same presence rule as the web id and as app.config.ts: an empty id counts as missing.
  return Platform.OS !== "ios" || Boolean(env.googleIosClientId);
}

/** Longest wait for the native Google sign-out before the app sign-out moves on. */
export const GOOGLE_SIGN_OUT_TIMEOUT_MS = 3_000;

let configured = false;

/** `GoogleSignin.configure` once per app run, before the first sign-in or sign-out. */
function configureOnce(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId,
  });
  configured = true;
}

/** Development-only trace of a native failure: its code only, never the account. */
function reportNativeFailure(error: unknown): void {
  if (!__DEV__) return;
  console.warn("Google sign-in failed.", { code: isErrorWithCode(error) ? error.code : undefined });
}

/** Google's ID token for the account the user picks, or null when the user cancelled. */
async function pickGoogleAccount(): Promise<string | null> {
  try {
    // Always true on iOS; on Android it offers to install or update Play services.
    const available = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (!available) throw playServicesError();
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return null;
    const { idToken } = response.data;
    if (!idToken) {
      throw googleError("Google returned no ID token", GOOGLE_ID_TOKEN_MISSING_CODE);
    }
    return idToken;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    if (isErrorWithCode(error)) {
      // IN_PROGRESS: another sign-in already shows the picker; it finishes on its own.
      if (error.code === statusCodes.SIGN_IN_CANCELLED || error.code === statusCodes.IN_PROGRESS) {
        return null;
      }
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw playServicesError();
    }
    reportNativeFailure(error);
    throw googleError("Google sign-in failed", GOOGLE_SIGN_IN_FAILED_CODE);
  }
}

/**
 * Shows Google's account picker and signs in to Supabase with the chosen account. Resolves
 * `{ cancelled: true }` when the user closed the picker; rejects with an AuthError otherwise.
 */
export async function signInWithGoogle(): Promise<{ cancelled: boolean }> {
  const client = supabase;
  if (!client || !isGoogleSignInAvailable()) {
    throw googleError("Google sign-in is not configured in this build", GOOGLE_UNAVAILABLE_CODE);
  }
  configureOnce();
  const idToken = await pickGoogleAccount();
  if (idToken === null) return { cancelled: true };

  const { error } = await trackSignIn(
    client.auth.signInWithIdToken({ provider: "google", token: idToken }),
  );
  if (error) {
    // Lets the next attempt pick another account instead of reusing this one.
    await signOutFromGoogle();
    throw error;
  }
  return { cancelled: false };
}

/**
 * Forgets the Google account on this device, so the next sign-in shows the account picker.
 * Best effort: never rejects, and does nothing when Google sign-in is not available.
 */
export async function signOutFromGoogle(): Promise<void> {
  if (!isGoogleSignInAvailable()) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    configureOnce();
    // Bounded: sign-out waits for this call, and a stalled native module (e.g. Play
    // services) must not hold the account screen in "Cerrando sesión…".
    await Promise.race([
      GoogleSignin.signOut(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, GOOGLE_SIGN_OUT_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Only the account picker is at stake; the Supabase session is removed separately.
  } finally {
    clearTimeout(timer);
  }
}
