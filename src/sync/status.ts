/**
 * Whether the signed-in user's Realtime channel (`usuario:<auth uid>`, joined by
 * `useRealtimeSync`) is joined right now, outside React. While it is, its events announce
 * every change, so screens can switch off the polls those events replace.
 *
 * Imports nothing from `@/auth`: screens read it, and `scripts/check-render.cjs` renders
 * them in plain Node, where the channel is never connected (the server snapshot).
 */
import { useSyncExternalStore } from "react";

/**
 * `idle`: no channel (signed out, in the background, disabled or no Supabase client);
 * `connecting`: joining; `connected`: joined; `error`: the join failed or the channel
 * dropped, and Realtime is retrying.
 */
export type RealtimeStatus = "idle" | "connecting" | "connected" | "error";

let status: RealtimeStatus = "idle";
const listeners = new Set<() => void>();

export function getRealtimeStatus(): RealtimeStatus {
  return status;
}

export function isRealtimeConnected(): boolean {
  return status === "connected";
}

/** Set by `useRealtimeSync` only. A status that did not change notifies nobody. */
export function setRealtimeStatus(next: RealtimeStatus): void {
  if (next === status) return;
  status = next;
  for (const listener of [...listeners]) listener();
}

export function subscribeRealtimeStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const notConnected = () => false;

/** Whether the channel is joined; never on the server. */
export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(subscribeRealtimeStatus, isRealtimeConnected, notConnected);
}
