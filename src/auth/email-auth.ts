/**
 * Email and password authentication with Supabase Auth: thin wrappers that throw the
 * `AuthError` Supabase returns, so forms show it through `messageFor` (useZodForm's
 * `handleSubmit` does this for a rejected `onValid`).
 *
 * None of them navigates: a new session reaches the session provider through
 * `onAuthStateChange`, and the root guards open the right screen.
 */
import { AuthError, type SupabaseClient } from "@supabase/supabase-js";

import type { LoginData, RegisterData } from "@/domain/validation/auth";

import { supabase } from "./supabase";

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
  const { error } = await auth().signInWithPassword({ email, password });
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
  const { data, error } = await auth().signUp({
    email,
    password,
    options: { data: { nombres, apellidos, telefono, acepto_terminos: true } },
  });
  if (error) throw error;
  // With email confirmation on, Supabase answers an existing address with an obfuscated
  // user (no identities) and sends no code. That is left alone on purpose: the app never
  // reveals whether an address is registered (see RegisterScreen).
  return { confirmationPending: data.session === null };
}

/** Confirms the sign-up code; on success Supabase stores the session. */
export async function verifyEmailOtp(email: string, token: string): Promise<void> {
  const { error } = await auth().verifyOtp({ email, token, type: "email" });
  if (error) throw error;
}

export async function resendSignupOtp(email: string): Promise<void> {
  const { error } = await auth().resend({ type: "signup", email });
  if (error) throw error;
}
