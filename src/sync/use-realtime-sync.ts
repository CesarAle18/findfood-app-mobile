/**
 * Live sync for the signed-in user: listens to the private Realtime topic
 * `usuario:<auth uid>` (event `sync`, see `./sync-event`), on which the API announces every
 * change the user can see, and invalidates what each event names (`./sync-keys`): queries
 * on screen refetch over REST, the others go stale and refetch when their screen opens.
 *
 * Only in the foreground (TanStack's `focusManager`, wired to AppState): the app leaves the
 * channel in the background and joins it again on return. A join after the first one (a
 * return to the foreground, or Realtime rejoining after the connection dropped) may have
 * missed events, so it catches up by invalidating every query but the catalog, once.
 *
 * Supabase hands Realtime the session token and pushes refreshed ones to joined channels,
 * so nothing here calls `setAuth`. Without a Supabase client (the `local` profile) or a
 * signed-in user it does nothing. `./status` reports whether the channel is joined.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { focusManager, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { sessionStore } from "@/auth/session-store";
import { supabase } from "@/auth/supabase";
import { queryKeys } from "@/services/query-keys";

import { setRealtimeStatus } from "./status";
import { parseSyncEvent } from "./sync-event";
import { invalidateTargets, keysForSyncEvent, type SyncTarget } from "./sync-keys";

/** The broadcast event of `usuario:<auth uid>`. */
export const SYNC_EVENT = "sync";

/**
 * How long events gather before one invalidation, from the first one: a single change often
 * announces several entities (a donation and its route stop, say).
 */
export const SYNC_FLUSH_MS = 300;

const CATALOG_ROOT = queryKeys.catalogos.all[0];

const subscribeFocus = (onChange: () => void) => focusManager.subscribe(onChange);
const isFocused = () => focusManager.isFocused();
// Nothing joins while rendering on the server.
const notFocused = () => false;
const selectUserId = () => sessionStore.getSnapshot().userId;

/** Every query but the catalog, which no event announces; refetches in flight are kept. */
function catchUp(client: QueryClient): void {
  void client.invalidateQueries(
    { predicate: (query) => query.queryKey[0] !== CATALOG_ROOT },
    { cancelRefetch: false },
  );
}

/** Joins `usuario:<auth uid>` while `enabled`, signed in and in the foreground. */
export function useRealtimeSync(enabled: boolean): void {
  const queryClient = useQueryClient();
  const client = supabase;
  const userId = useSyncExternalStore(sessionStore.subscribe, selectUserId, selectUserId);
  const focused = useSyncExternalStore(subscribeFocus, isFocused, notFocused);
  /** Whether a channel of this mount joined already: every later join catches up. */
  const joinedBefore = useRef(false);
  /** The removal of the last channel, until the server confirms it. */
  const leaving = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!enabled || !client || !userId || !focused) return;
    let active = true;
    let channel: RealtimeChannel | null = null;
    let pending: SyncTarget[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      flushTimer = undefined;
      const targets = pending;
      pending = [];
      invalidateTargets(queryClient, targets);
    };
    const receive = (payload: unknown) => {
      const event = active ? parseSyncEvent(payload) : null;
      if (!event) return;
      pending.push(...keysForSyncEvent(event));
      flushTimer ??= setTimeout(flush, SYNC_FLUSH_MS);
    };
    const report = (joined: boolean) => {
      if (!active) return;
      // CHANNEL_ERROR, TIMED_OUT or CLOSED: Realtime retries, and a rejoin reports joined.
      setRealtimeStatus(joined ? "connected" : "error");
      if (!joined) return;
      if (joinedBefore.current) catchUp(queryClient);
      joinedBefore.current = true;
    };
    const join = () => {
      if (!active) return;
      channel = client
        .channel(`usuario:${userId}`, { config: { private: true } })
        .on("broadcast", { event: SYNC_EVENT }, ({ payload }) => receive(payload))
        .subscribe((status) => report(status === "SUBSCRIBED"));
    };

    setRealtimeStatus("connecting");
    // Until the server confirms a removal, `channel()` hands back that leaving channel for
    // the same topic, which never joins again: wait for it first.
    if (leaving.current) void leaving.current.then(join);
    else join();

    return () => {
      active = false;
      clearTimeout(flushTimer);
      pending = [];
      setRealtimeStatus("idle");
      if (!channel) return;
      const forget = () => {
        if (leaving.current === removal) leaving.current = null;
      };
      const removal = client.removeChannel(channel).then(forget, forget);
      leaving.current = removal;
    };
  }, [enabled, client, userId, focused, queryClient]);
}
