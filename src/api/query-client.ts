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
