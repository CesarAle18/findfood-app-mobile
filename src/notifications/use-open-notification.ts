/**
 * Opening a notification, from the inbox or from a tapped push: marks it read, switches to
 * the view (role) its screen belongs to, and pushes that screen.
 */
import { router } from "expo-router";
import { useCallback } from "react";

import type { MobileRole } from "@/auth/access";
import { useMarcarNotificacionLeidaMutation } from "@/services/notificaciones";
import { useAccess } from "@/state/session";

import {
  ALERTS_HREF,
  routeForNotification,
  type NotificationAccess,
  type NotificationLink,
} from "./notification-routes";

export interface OpenableNotification extends NotificationLink {
  /** The inbox id (`notificacion_id` in a push); without one nothing is marked read. */
  id?: string | null;
  /** False when it is known to be read already; unknown (a push) counts as unread. */
  unread?: boolean;
}

export interface OpenOptions {
  /**
   * From the inbox itself: a notification whose only screen is the current view's alerts
   * tab stays put instead of pushing the tab onto itself.
   */
  fromInbox?: boolean;
}

export interface OpenContext extends NotificationAccess, OpenOptions {
  setActiveRole: (role: MobileRole) => void;
  markRead: (id: string) => void;
}

/** The one place that decides what opening a notification does (inbox and push). */
export function openNotification(
  notification: OpenableNotification,
  { markRead, setActiveRole, fromInbox = false, ...access }: OpenContext,
): void {
  const { id, unread = true } = notification;
  if (id && unread) markRead(id);
  const target = routeForNotification(notification, access);
  if (!target) return;
  const { activeRole } = access;
  const isOwnAlerts = target.role === activeRole && target.href === ALERTS_HREF[target.role];
  if (fromInbox && isOwnAlerts) return;
  if (target.role !== activeRole) setActiveRole(target.role);
  router.push(target.href);
}

/** `openNotification` with the session's access and the optimistic mark-read mutation. */
export function useOpenNotification(): (
  notification: OpenableNotification,
  options?: OpenOptions,
) => void {
  const { mutate: markRead } = useMarcarNotificacionLeidaMutation();
  const { canDonor, canVolunteer, activeRole, setActiveRole } = useAccess();

  return useCallback(
    (notification: OpenableNotification, { fromInbox }: OpenOptions = {}) =>
      openNotification(notification, {
        canDonor,
        canVolunteer,
        activeRole,
        setActiveRole,
        markRead,
        fromInbox,
      }),
    [markRead, canDonor, canVolunteer, activeRole, setActiveRole],
  );
}
