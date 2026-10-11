/**
 * Shared screen states: loading, empty, error and the offline banner. They reuse the
 * design system primitives (Copy, Button, Icon, tokens) so every screen reads the same.
 */
import { onlineManager } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { messageFor } from "@/api/problem-messages";
import { colors } from "@/design/tokens";

import { Icon, type IconName } from "./icon";
import { Animated, fadeIn, fadeOut } from "./motion";
import { Button, Copy } from "./ui";

export function LoadingState({ label }: { label?: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "Cargando"}
      aria-busy
      style={styles.center}
    >
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? (
        <Copy tone="secondary" style={styles.description}>
          {label}
        </Copy>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = "box",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  /** Usually a Button or NavButton that lets the user fill the empty list. */
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.iconWell}>
        <Icon name={icon} size={28} />
      </View>
      <View style={styles.text}>
        <Copy weight="semibold" style={styles.title}>
          {title}
        </Copy>
        {description ? (
          <Copy tone="secondary" style={styles.description}>
            {description}
          </Copy>
        ) : null}
      </View>
      {action ? <View style={styles.actions}>{action}</View> : null}
    </View>
  );
}

export function ErrorState({
  error,
  title = "No pudimos cargar la información",
  onRetry,
  retrying = false,
  secondaryAction,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  /** True while the retry is in flight: the button shows a busy indicator. */
  retrying?: boolean;
  /** For example "Cerrar sesión" when the app cannot start without this data. */
  secondaryAction?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <View accessible accessibilityRole="alert" style={styles.text}>
        <Copy weight="semibold" style={styles.title}>
          {title}
        </Copy>
        <Copy tone="secondary" style={styles.description}>
          {messageFor(error)}
        </Copy>
      </View>
      <View style={styles.actions}>
        {onRetry ? (
          <Button onPress={onRetry} loading={retrying}>
            Reintentar
          </Button>
        ) : null}
        {secondaryAction ? (
          <Button variant="outline" onPress={secondaryAction.onPress}>
            {secondaryAction.label}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** The fields of a TanStack query result that `QueryContent` reads. */
export interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}

/**
 * A query's data through `children`, or its loading or error state. Data already on
 * screen stays there when a background refetch fails.
 */
export function QueryContent<T>({
  query,
  loadingLabel,
  errorTitle,
  children,
}: {
  query: QueryLike<T>;
  loadingLabel?: string;
  errorTitle?: string;
  children: (data: T) => ReactNode;
}) {
  if (query.data !== undefined) return children(query.data);
  if (query.error) {
    return (
      <ErrorState
        error={query.error}
        title={errorTitle}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  return <LoadingState label={loadingLabel} />;
}

const subscribeOnline =(onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();
// Server rendering (the web preview) has no connection state: assume online.
const isOnlineOnServer = () => true;

/** Visible only while TanStack Query considers the device offline. */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, isOnline, isOnlineOnServer);
  if (online) return null;
  return (
    <Animated.View
      entering={fadeIn}
      exiting={fadeOut}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.banner}
    >
      <Copy weight="medium" style={styles.bannerText}>
        Sin conexión a internet. Es posible que la información no esté actualizada.
      </Copy>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 32,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { alignItems: "center", gap: 6, maxWidth: 320 },
  title: { fontSize: 15, lineHeight: 21, textAlign: "center" },
  description: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 12 },
  banner: {
    backgroundColor: colors.warningSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bannerText: { fontSize: 12, lineHeight: 18, color: colors.warning },
});
