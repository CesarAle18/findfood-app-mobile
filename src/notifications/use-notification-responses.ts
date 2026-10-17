/**
 * Tapped pushes open their screen; pushes received in the foreground refresh the inbox and
 * the donation they are about.
 *
 * A tap can arrive before the app can navigate: on a cold start the session is still
 * loading and `Stack.Protected` has not mounted the signed-in routes. The tap is kept as
 * pending and opened once the navigator is ready in the app phase.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { marcarNotificacionLeida } from "@/services/notificaciones";
import { queryKeys } from "@/services/query-keys";
import { useAccess } from "@/state/session";

import { openNotification, type OpenableNotification } from "./use-open-notification";

/** A tapped push: its request identifier (to handle it once) and what it links to. */
export interface PendingOpen {
  key: string;
  notification: OpenableNotification;
}

const optionalString = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

/**
 * The push `data` the API sends (`{ tipo, donacion_id?, asignacion_id?, notificacion_id }`)
 * as a notification to open. An unknown or missing `tipo` still opens the alerts tab.
 */
export function notificationFromData(
  data: Record<string, unknown> | null | undefined,
): OpenableNotification {
  return {
    id: optionalString(data?.notificacion_id),
    tipo: optionalString(data?.tipo) ?? "",
    donacion_id: optionalString(data?.donacion_id),
    asignacion_id: optionalString(data?.asignacion_id),
  };
}

/**
 * What a received push about a donation leaves stale: its detail, its history and the lists
 * (a state change moves it between tabs). Empty when the push names no donation.
 */
export function donationKeysForPush(data: Record<string, unknown> | null | undefined) {
  const id = optionalString(data?.donacion_id);
  if (id === null) return [];
  return [
    queryKeys.donaciones.detail(id),
    queryKeys.donaciones.historial(id),
    queryKeys.donaciones.lists(),
  ];
}

/** Only a tap on the notification itself opens it (not an action button). */
export function pendingFromResponse(
  response: Notifications.NotificationResponse | null,
): PendingOpen | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return null;
  }
  const { request } = response.notification;
  return { key: request.identifier, notification: notificationFromData(request.content.data) };
}

/**
 * Requests already taken, for the life of the process: the cold-start tap can also reach
 * the listener, and a remounted root must not reopen it.
 */
const claimedKeys = new Set<string>();

function claim(open: PendingOpen | null): PendingOpen | null {
  if (!open || claimedKeys.has(open.key)) return null;
  claimedKeys.add(open.key);
  return open;
}

/**
 * @param navigatorReady True once the root navigator renders its routes (fonts loaded and
 *   the session known).
 */
export function useNotificationResponses(navigatorReady: boolean): void {
  const access = useAccess();
  const { phase } = access;
  const queryClient = useQueryClient();
  // Not the inbox's optimistic mutation: on a cold start no inbox is cached to update, and
  // the refetch below brings the badge down. The request is resolved lazily on purpose, so
  // this root hook only touches the inbox module when a push is actually opened.
  const { mutate: markRead } = useMutation({
    mutationFn: (id: string) => marcarNotificacionLeida(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.notificaciones.all }),
  });
  // The cold-start tap, read once; later taps arrive through the listener. Web has no
  // cold-start tap, and the module throws there instead of answering null.
  const [pending, setPending] = useState(() =>
    Platform.OS === "web"
      ? null
      : claim(pendingFromResponse(Notifications.getLastNotificationResponse())),
  );
  const openedKey = useRef<string | null>(null);

  useEffect(() => {
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      const next = claim(pendingFromResponse(response));
      if (next) setPending(next);
    });
    const received = Notifications.addNotificationReceivedListener((notification) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificaciones.all });
      // Optional chaining: a push without content still refreshes the inbox.
      for (const queryKey of donationKeysForPush(notification?.request?.content?.data)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    });
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [queryClient]);

  const canOpen = navigatorReady && phase === "app";
  useEffect(() => {
    if (!canOpen || !pending || openedKey.current === pending.key) return;
    openedKey.current = pending.key;
    openNotification(pending.notification, { ...access, markRead });
    Notifications.clearLastNotificationResponseAsync().catch(() => {
      // Nothing to clear (or no native module): the key already prevents a second open.
    });
  }, [canOpen, pending, access, markRead]);
}
