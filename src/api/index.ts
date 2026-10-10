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
  // The local profile's dev token cannot be refreshed: a 401 ends the session.
  refreshAccessToken: env.appEnv === "local" ? async () => null : refreshAccessToken,
  onUnauthorized: sessionStore.notifyUnauthorized,
});
