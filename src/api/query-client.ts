/**
 * TanStack Query client and its React Native wiring: refetch when the app returns to the
 * foreground (AppState) and pause/resume with the connection (expo-network).
 */
import { focusManager, onlineManager, QueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import { AppState, Platform } from "react-native";

import { isApiError } from "./errors";

const MAX_QUERY_RETRIES = 2;
const QUERY_STALE_TIME_MS = 30_000;

/**
 * 4xx answers will not change on retry (validation, permissions, missing resources, rate
 * limits); everything else (5xx, offline, timeouts) is retried twice.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_QUERY_RETRIES;
}

/**
 * For the queries the app cannot start without (`GET /me`, which gates navigation).
 *
 * With TanStack's default `networkMode: 'online'` such a query stays paused (`pending`)
 * while the device is offline, so an offline start would wait forever. These queries run
 * anyway and, while offline, fail at once with the request's own error (`sin-conexion`)
 * instead of retrying. They are fetched again when the connection returns, since a query
 * without data is always stale. A query with cached data keeps it when a refetch fails.
 */
export const startupQueryOptions = {
  networkMode: "always",
  // TanStack turns the reconnect refetch off by default for `networkMode: 'always'`.
  refetchOnReconnect: true,
  // The error screen reads the same query. Refetching when it mounts puts the query back in
  // `pending`, which unmounts that screen; the failure mounts it again, in a loop. A failed
  // query is fetched again only on retry (`refetch`) or reconnect.
  retryOnMount: false,
  retry: (failureCount: number, error: unknown): boolean =>
    onlineManager.isOnline() && shouldRetryQuery(failureCount, error),
} as const;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: QUERY_STALE_TIME_MS },
      // A retried mutation may apply twice (e.g. create a donation twice).
      mutations: { retry: false },
    },
  });
}

/** The app-wide client. */
export const queryClient = createQueryClient();

type ConnectionState = Pick<Network.NetworkState, "isConnected" | "isInternetReachable">;

/** Reachability may be undetermined (undefined) for a moment: only `false` means offline. */
function isOnline({ isConnected, isInternetReachable }: ConnectionState): boolean {
  return !!isConnected && isInternetReachable !== false;
}

let managersReady = false;

/** Connects the focus and online managers to the device. Safe to call more than once. */
export function setupQueryManagers(): void {
  if (managersReady) return;
  // The web build also renders each route in Node (`web.output: "static"`), where there is
  // no `window` for expo-network's listener; the browser connects the managers.
  if (Platform.OS === "web" && typeof window === "undefined") return;
  managersReady = true;

  // On web TanStack's default listener (visibilitychange) already does this.
  if (Platform.OS !== "web") {
    focusManager.setEventListener((setFocused) => {
      const subscription = AppState.addEventListener("change", (state) => {
        setFocused(state === "active");
      });
      return () => subscription.remove();
    });
  }

  onlineManager.setEventListener((setOnline) => {
    let changed = false;
    const subscription = Network.addNetworkStateListener((state) => {
      changed = true;
      setOnline(isOnline(state));
    });
    // Seeds the state at startup; a change event that already arrived is newer.
    Network.getNetworkStateAsync().then(
      (state) => {
        if (!changed) setOnline(isOnline(state));
      },
      () => {
        // Unknown: stay online and let requests fail on their own.
      },
    );
    return () => subscription.remove();
  });
}
