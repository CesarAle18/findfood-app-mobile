/** What both role tab bars (`donante/(tabs)`, `voluntario/(tabs)`) share. */
import type { NativeTabsProps } from "expo-router/unstable-native-tabs";

import { colors } from "@/design/tokens";
import { useNotificacionesNoLeidas } from "@/services/notificaciones";

/** Brand colors of the tab bar (iOS 26 Liquid Glass ignores the background). */
export const TAB_BAR_PROPS = {
  backgroundColor: colors.surface,
  tintColor: colors.primary,
  iconColor: { default: colors.secondary, selected: colors.primary },
  labelStyle: { default: { color: colors.secondary }, selected: { color: colors.primary } },
  indicatorColor: colors.soft,
  badgeBackgroundColor: colors.primary,
  badgeTextColor: colors.surface,
} satisfies NativeTabsProps;

const MAX_BADGE_COUNT = 99;

/** Badge text for an unread count; undefined hides the badge. */
export function unreadBadge(count: number | undefined): string | undefined {
  if (!count || count < 0) return undefined;
  return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}

/** The alerts tab badge: the unread notifications count, hidden while unknown or zero. */
export function useUnreadBadge(): string | undefined {
  const { data } = useNotificacionesNoLeidas();
  return unreadBadge(data);
}
