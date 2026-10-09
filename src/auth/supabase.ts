/**
 * Supabase client, used for Auth only (sign-in, session, password recovery); data goes
 * through findfood-api.
 *
 * Null in the `local` profile without Supabase configuration: that profile authenticates
 * against the local API with a dev token.
 *
 * No `react-native-url-polyfill`: Expo installs a WHATWG `URL` global (expo/src/winter),
 * which is what supabase-js needs to build its endpoint URLs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { env } from "@/config/env";

import { createAccessTokenRefresher } from "./refresh";
import { secureStorage } from "./secure-storage";

function createSupabaseClient(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Android and iOS have no URL to read a session from: deep links are exchanged by the
      // app. With PKCE on React Native, `exchangeCodeForSession` must receive the flow id
      // that `resetPasswordForEmail` appends to `redirectTo` (no window.location to read).
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

export const supabase: SupabaseClient | null = createSupabaseClient();

// Outside browsers auth-js runs its refresh ticker all the time; timers are unreliable
// while the app is in the background, so the ticker only runs in the foreground.
// Registered once, at module level.
if (supabase && Platform.OS !== "web") {
  const { auth } = supabase;
  AppState.addEventListener("change", (state) => {
    if (state === "active") void auth.startAutoRefresh();
    else void auth.stopAutoRefresh();
  });
}

const refresher = supabase ? createAccessTokenRefresher(supabase.auth) : null;

/**
 * `ApiClientOptions.refreshAccessToken`: the new access token; null when the session is
 * definitively invalid (or there is no Supabase client); rejects on transient failures
 * (network, timeouts, 5xx) so the HTTP client keeps the session.
 */
export function refreshAccessToken(): Promise<string | null> {
  return refresher ? refresher() : Promise.resolve(null);
}
