/**
 * The app-wide findfood-api client, bound to the session store.
 */
import { sessionStore } from "@/auth/session-store";
import { refreshAccessToken } from "@/auth/supabase";
import { env } from "@/config/env";

import { createApiClient } from "./client";

export const api = createApiClient({
  baseUrl: env.apiUrl,
  getAccessToken: sessionStore.getAccessToken,
  // The local profile's dev token cannot be refreshed: a 401 ends the session. The profile
  // is read per call, like SessionProvider does, so this module holds no profile state of
  // its own (and provider tests can run both profiles).
  refreshAccessToken: () =>
    env.appEnv === "local" ? Promise.resolve(null) : refreshAccessToken(),
  onUnauthorized: sessionStore.notifyUnauthorized,
});
