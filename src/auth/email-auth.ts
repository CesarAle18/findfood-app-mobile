/**
 * Email and password authentication with Supabase Auth: thin wrappers that throw the
 * `AuthError` Supabase returns, so forms show it through `messageFor` (useZodForm's
 * `handleSubmit` does this for a rejected `onValid`).
 *
 * Requests that may store a new session go through `trackSignIn`, so a sign-out still
 * settling never removes it.
 *
 * None of them navigates: a new session reaches the session provider through
 * `onAuthStateChange`, and the root guards open the right screen.
 */
import { AuthError, type SupabaseClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";

import type { LoginData, RegisterData } from "@/domain/validation/auth";

import { supabase, trackSignIn } from "./supabase";

/**
 * App-defined AuthError code for a profile without Supabase (`local`, which signs in with a
 * dev token): `messageFor` explains it in Spanish.
 */
export const AUTH_UNAVAILABLE_CODE = "auth_unavailable";

/** False in the local profile, where these actions always throw. */
export function isEmailAuthAvailable(): boolean {
  return supabase !== null;
}

function auth(): SupabaseClient["auth"] {
  if (!supabase) {
    throw new AuthError("Supabase Auth is not configured in this profile", undefined, AUTH_UNAVAILABLE_CODE);
  }
  return supabase.auth;
}

export async function signIn({ email, password }: LoginData): Promise<void> {
  const { error } = await trackSignIn(auth().signInWithPassword({ email, password }));
  if (error) throw error;
}

/**
 * Creates the account; the trigger on `auth.users` creates the user (a donor) from the
 * metadata. `confirmationPending` is true when Supabase requires the email code first
 * (no session yet), and also for an address that already has an account.
 */
export async function signUp({
  nombres,
  apellidos,
  email,
  telefono,
  password,
}: RegisterData): Promise<{ confirmationPending: boolean }> {
  // Tracked: with email confirmation off, the sign-up signs the user in at once.
  const { data, error } = await trackSignIn(
    auth().signUp({
      email,
      password,
      options: { data: { nombres, apellidos, telefono, acepto_terminos: true } },
    }),
  );
  if (error) throw error;
  // With email confirmation on, Supabase answers an existing address with an obfuscated
  // user (no identities) and sends no code. That is left alone on purpose: the app never
  // reveals whether an address is registered (see RegisterScreen).
  return { confirmationPending: data.session === null };
}

/** Confirms the sign-up code; on success Supabase stores the session. */
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await trackSignIn(auth().verifyOtp({ email, token, type: "email" }));
  if (error) throw error;
}

export async function resendSignupOtp(email: string): Promise<void> {
  const { error } = await auth().resend({ type: "signup", email });
  if (error) throw error;
}

/** The screen the reset email links back to (`findfoodappmobile://restablecer-contrasena`). */
export const RESET_PASSWORD_PATH = "/restablecer-contrasena";

/**
 * Emails a reset link that opens the reset screen. With PKCE the link only works on this
 * device: the code verifier stays in this install's storage. Supabase answers the same for an
 * unknown address (and sends nothing), so the caller must not reveal which addresses exist.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await auth().resetPasswordForEmail(email, {
    redirectTo: Linking.createURL(RESET_PASSWORD_PATH),
  });
  if (error) throw error;
}

/**
 * Exchanges the reset link's `code` for a recovery session; auth-js then emits
 * PASSWORD_RECOVERY. On React Native it cannot read the flow id from window.location, so the
 * link's `sb_flow_id` is passed explicitly; without one, the verifier of the latest flow
 * started on this device is used.
 */
export async function exchangeRecoveryCode(code: string, flowId?: string): Promise<void> {
  const { error } = await trackSignIn(
    auth().exchangeCodeForSession(code, flowId ? { flowId } : undefined),
  );
  if (error) throw error;
}

/** Sets the signed-in user's password (after a reset link, or a forced change). */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await auth().updateUser({ password });
  if (error) throw error;
}
