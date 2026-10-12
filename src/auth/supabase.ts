/**
 * Supabase client, used for Auth only (sign-in, session, password recovery); data goes
 * through findfood-api.
 *
 * Null in the `local` profile without Supabase configuration: that profile authenticates
 * against the local API with a dev token. Also null when the configuration is invalid: the
 * app shows the configuration error instead of starting.
 *
 * No `react-native-url-polyfill`: Expo installs a WHATWG `URL` global (expo/src/winter),
 * which is what supabase-js needs to build its endpoint URLs.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { configResult } from "@/config/env";

import { createAccessTokenRefresher } from "./refresh";
import { secureStorage, type AuthStorage } from "./secure-storage";
import { createSupabaseFetch } from "./supabase-fetch";

/**
 * auth-js `storageKey`: the session is stored under this key and every other auth key
 * starts with it. Fixed (instead of the default `sb-<project>-auth-token`) so sign-out can
 * remove them all (see signOutLocally).
 */
export const AUTH_STORAGE_KEY = "findfood.auth";

function createSupabaseClient(): SupabaseClient | null {
  if (!configResult.ok) return null;
  const { supabaseUrl, supabaseAnonKey } = configResult.env;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: secureStorage,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      // Android and iOS have no URL to read a session from: deep links are exchanged by the
      // app. With PKCE on React Native, `exchangeCodeForSession` must receive the flow id
      // that `resetPasswordForEmail` appends to `redirectTo` (no window.location to read).
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    // Bounds every Supabase request, so a hung token refresh cannot block later ones.
    global: { fetch: createSupabaseFetch() },
  });
}

export const supabase: SupabaseClient | null = createSupabaseClient();

// Outside browsers auth-js runs its refresh ticker all the time; timers are unreliable
// while the app is in the background, so the ticker only runs in the foreground.
// Registered once, at module level.
const managesTicker = supabase !== null && Platform.OS !== "web";
/** Whether the ticker should run now; sign-out pauses it and restarts it if so. */
let foreground = AppState.currentState === "active";
if (supabase && managesTicker) {
  const { auth } = supabase;
  AppState.addEventListener("change", (state) => {
    foreground = state === "active";
    if (foreground) void auth.startAutoRefresh();
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

// PKCE keys of auth-js 2.117.3 (lib/helpers.js): an index of pending flow ids, one
// verifier slot per indexed flow and a fixed verifier key. Flow ids are validated like
// auth-js does before they become storage keys.
const PKCE_FLOW_INDEX_KEY = `${AUTH_STORAGE_KEY}-flows-code-verifier`;
const PKCE_FLOW_ID = /^[a-zA-Z0-9_-]{8,64}$/;
const pkceSlotKey = (flowId: string) => `${AUTH_STORAGE_KEY}-flow-${flowId}-code-verifier`;

function ignore() {
  // Best effort: see removeStoredSession and signOutLocally.
}

async function readPkceFlowIds(storage: AuthStorage): Promise<string[]> {
  try {
    const raw = await storage.getItem(PKCE_FLOW_INDEX_KEY);
    const index: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(index)) return [];
    return index.filter((id): id is string => typeof id === "string" && PKCE_FLOW_ID.test(id));
  } catch {
    return [];
  }
}

/**
 * Removes every key auth-js 2.117.3 persists under AUTH_STORAGE_KEY, the same set as its
 * `_removeSession`: the session, the user (`-user`), the fixed PKCE verifier, the PKCE
 * flow index and each indexed verifier slot. Never rejects; a key that cannot be removed
 * does not stop the others.
 */
async function removeStoredSession(storage: AuthStorage): Promise<void> {
  const flowIds = await readPkceFlowIds(storage);
  const keys = [
    AUTH_STORAGE_KEY,
    `${AUTH_STORAGE_KEY}-user`,
    `${AUTH_STORAGE_KEY}-code-verifier`,
    PKCE_FLOW_INDEX_KEY,
    ...flowIds.map(pkceSlotKey),
  ];
  await Promise.all(keys.map((key) => storage.removeItem(key).catch(ignore)));
}

/**
 * How long sign-out waits for auth-js. Offline with an expired session, its `signOut`
 * retries the refresh for about 25-30 s before giving up.
 */
export const SIGN_OUT_DEADLINE_MS = 8_000;

/**
 * Signs out on this device and removes the stored session. Never rejects, never takes
 * longer than SIGN_OUT_DEADLINE_MS; does nothing without a Supabase client.
 *
 * auth-js `signOut` returns early, without removing the stored session, when reading the
 * current session fails first (e.g. an expired session whose refresh fails offline), and
 * that session would be restored on the next start. So the keys are removed here once
 * `signOut` has settled, whatever it returned, or at the deadline if it has not. A refresh
 * it started can still store the session after the deadline: the keys are removed again
 * when it settles. The refresh ticker (native only; auth-js manages it on web) stays paused
 * meanwhile, and runs again afterwards if the app is in the foreground.
 */
export async function signOutLocally(): Promise<void> {
  if (!supabase) return;
  const { auth } = supabase;
  if (managesTicker) await auth.stopAutoRefresh().catch(ignore);

  const settled = (async () => {
    try {
      await auth.signOut({ scope: "local" });
    } catch {
      // The stored session is removed below either way.
    }
    await removeStoredSession(secureStorage);
    if (managesTicker && foreground) void auth.startAutoRefresh().catch(ignore);
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, SIGN_OUT_DEADLINE_MS);
  }).then(() => removeStoredSession(secureStorage));
  try {
    await Promise.race([settled, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
