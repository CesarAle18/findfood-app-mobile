/**
 * The alerts tab of both views: the user's inbox (`GET /me/notificaciones`), paged, with
 * Todas / Sin leer / Importantes. Tapping a row marks it read at once and opens its screen;
 * swiping it to the left deletes it (at once too, put back if the request fails).
 */
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";

import { EmptyState, ErrorState, QueryContent } from "@/components/findfood/feedback";
import { Icon, type IconName } from "@/components/findfood/icon";
import { Pressing } from "@/components/findfood/motion";
import { StatusAnimation } from "@/components/findfood/status-animation";
import { Badge, Button, Choices, Copy, Row, Screen } from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import { isImportant } from "@/notifications/notification-routes";
import { relativeTime } from "@/notifications/relative-time";
import { useOpenNotification } from "@/notifications/use-open-notification";
import {
  notificacionesQuery,
  useEliminarNotificacionMutation,
  useMarcarTodasLeidasMutation,
  type BandejaPages,
} from "@/services/notificaciones";

/** One inbox row, ready to render. */
export interface InboxRow {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  donacion_id: string | null;
  asignacion_id: string | null;
  /** "Hace 5 min", computed when the page arrives (render stays pure). */
  time: string | null;
  unread: boolean;
  important: boolean;
}

interface Inbox {
  rows: InboxRow[];
  /** Unread notifications of the user, loaded or not. */
  unread: number;
}

/**
 * The loaded pages as one list. Offsets shift when a notification arrives between two page
 * requests, so a row can come back on the next page: only its first copy is kept.
 */
function selectInbox(data: BandejaPages): Inbox {
  const now = Date.now();
  const seen = new Set<string>();
  const rows: InboxRow[] = [];
  for (const dto of data.pages.flatMap((page) => page.datos)) {
    if (seen.has(dto.id)) continue;
    seen.add(dto.id);
    rows.push({
      id: dto.id,
      tipo: dto.tipo,
      titulo: dto.titulo,
      cuerpo: dto.cuerpo,
      donacion_id: dto.donacion_id,
      asignacion_id: dto.asignacion_id,
      time: relativeTime(dto.created_at, now),
      unread: dto.leida_at === null,
      important: isImportant(dto.tipo),
    });
  }
  return { rows, unread: data.pages[0]?.no_leidas ?? 0 };
}

const TABS = ["Todas", "Sin leer", "Importantes"];
const ALL_TAB = 0;
const UNREAD_TAB = 1;
const IMPORTANT_TAB = 2;

const EMPTY: Record<number, { title: string; description: string }> = {
  [ALL_TAB]: {
    title: "No tienes notificaciones",
    description: "Aquí verás las novedades de tus donaciones y rutas.",
  },
  [UNREAD_TAB]: { title: "Estás al día", description: "No tienes notificaciones sin leer." },
  [IMPORTANT_TAB]: {
    title: "No hay notificaciones importantes",
    description: "Aquí verás ofertas, cancelaciones y rechazos que requieren tu atención.",
  },
};

function iconFor(tipo: string): IconName {
  if (tipo.startsWith("ASIGNACION_")) return "truck";
  if (tipo.startsWith("DONACION_")) return "box";
  if (tipo.startsWith("VERIFICACION_")) return "user";
  return "bell";
}

const keyExtractor = (row: InboxRow) => row.id;
const ItemSeparator = () => <View style={styles.separator} />;

export function NotificationsScreen() {
  const [tab, setTab] = useState(ALL_TAB);
  // Todas and Importantes share the full inbox; Importantes is a filter over its pages.
  const inbox = useInfiniteQuery({
    ...notificacionesQuery({ soloNoLeidas: tab === UNREAD_TAB }),
    select: selectInbox,
  });
  const { data, error, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } =
    inbox;
  const { mutate: markAll, isPending: markingAll } = useMarcarTodasLeidasMutation();
  // A failed delete puts the row back in place: that is all the feedback it gets.
  const { mutate: deleteNotification } = useEliminarNotificacionMutation();
  const openNotification = useOpenNotification();
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(() => {
    const rows = data?.rows ?? [];
    return tab === IMPORTANT_TAB ? rows.filter((row) => row.important) : rows;
  }, [data, tab]);
  const unread = data?.unread ?? 0;

  // Read on press only, so the press handler (and every memoized row) survives new data.
  const rowsRef = useRef<InboxRow[]>([]);
  useEffect(() => {
    rowsRef.current = data?.rows ?? [];
  }, [data]);

  const onPressItem = useCallback(
    (id: string) => {
      const row = rowsRef.current.find((candidate) => candidate.id === id);
      // Without a screen of its own in this view, the notification stays here.
      if (row) openNotification(row, { fromInbox: true });
    },
    [openNotification],
  );

  const onDeleteItem = useCallback((id: string) => deleteNotification(id), [deleteNotification]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<InboxRow>) => (
      <NotificationRow
        id={item.id}
        titulo={item.titulo}
        cuerpo={item.cuerpo}
        time={item.time}
        unread={item.unread}
        important={item.important}
        tipo={item.tipo}
        onPressItem={onPressItem}
        onDeleteItem={onDeleteItem}
      />
    ),
    [onPressItem, onDeleteItem],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const footer = isFetchingNextPage ? (
    <ActivityIndicator
      accessibilityLabel="Cargando más notificaciones"
      color={colors.primary}
      style={styles.footer}
    />
  ) : isFetchNextPageError ? (
    <ErrorState
      error={error}
      title="No pudimos cargar más notificaciones"
      onRetry={() => void fetchNextPage()}
    />
  ) : hasNextPage && tab === IMPORTANT_TAB ? (
    <View style={styles.footer}>
      <Button variant="outline" onPress={() => void fetchNextPage()}>
        Cargar más
      </Button>
    </View>
  ) : null;

  const emptyList = useMemo(() => {
    const { title, description } = EMPTY[tab];
    // Every empty tab plays the same bell: nothing is waiting for the user.
    return (
      <EmptyState
        illustration={<StatusAnimation kind="caught-up" />}
        title={title}
        description={description}
      />
    );
  }, [tab]);
  return (
    <Screen
      title="Notificaciones"
      subtitle="Últimas novedades"
      badge={unread > 0 ? <Badge>{unread === 1 ? "1 sin leer" : `${unread} sin leer`}</Badge> : null}
      scroll={false}
    >
      <Choices values={TABS} selected={tab} onChange={setTab} />
      {unread > 0 ? (
        <Button variant="outline" icon="check" onPress={() => markAll()} loading={markingAll}>
          Marcar todas como leídas
        </Button>
      ) : null}
      <QueryContent query={inbox} loadingLabel="Cargando tus notificaciones">
        {() => (
          <FlashList
            data={visible}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            ItemSeparatorComponent={ItemSeparator}
            ListEmptyComponent={emptyList}
            ListFooterComponent={footer}
            refreshing={refreshing}
            onRefresh={onRefresh}
            // Importantes filters loaded rows, so reaching its end could load every page on
            // its own: there only "Cargar más" loads more.
            onEndReached={tab === IMPORTANT_TAB ? undefined : loadMore}
            onEndReachedThreshold={0.5}
            contentContainerStyle={styles.listContent}
            contentInsetAdjustmentBehavior="automatic"
          />
        )}
      </QueryContent>
    </Screen>
  );
}

const NotificationRow = memo(function NotificationRow({
  id,
  tipo,
  titulo,
  cuerpo,
  time,
  unread,
  important,
  onPressItem,
  onDeleteItem,
}: {
  id: string;
  tipo: string;
  titulo: string;
  cuerpo: string;
  time: string | null;
  unread: boolean;
  important: boolean;
  onPressItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
}) {
  const swipeable = useRef<SwipeableMethods>(null);
  const opened = useRef(false);
  const shownId = useRef(id);

  // FlashList recycles rows: the cell of a swiped (deleted) row comes back closed for the
  // next one. `reset` snaps it shut; `close` then settles the state `reset` leaves behind
  // (the tap that closes an open row), without moving it.
  useEffect(() => {
    if (shownId.current === id) return;
    shownId.current = id;
    if (!opened.current) return;
    opened.current = false;
    swipeable.current?.reset();
    swipeable.current?.close();
  }, [id]);

  const renderRightActions = useCallback(
    () => (
      // The row's own "Eliminar" action is what screen readers get; this panel only shows
      // while swiped.
      <Pressable
        onPress={() => onDeleteItem(id)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.deleteAction}
      >
        <Icon name="trash" size={18} color={colors.surface} />
        <Copy weight="semibold" style={styles.deleteLabel}>
          Eliminar
        </Copy>
      </Pressable>
    ),
    [id, onDeleteItem],
  );

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      overshootRight={false}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={() => {
        opened.current = true;
      }}
      // LEFT: the row moved left, showing the right actions. Released past `rightThreshold`
      // (half the panel), it opens all the way, and that deletes it.
      onSwipeableOpen={(direction) => {
        if (direction === SwipeDirection.LEFT) onDeleteItem(id);
      }}
      onSwipeableClose={() => {
        opened.current = false;
      }}
    >
      <Pressing
        accessibilityRole="button"
        accessibilityLabel={unread ? `${titulo}, sin leer` : titulo}
        accessibilityHint="Abre la notificación"
        accessibilityActions={DELETE_ACTIONS}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "delete") onDeleteItem(id);
        }}
        onPress={() => onPressItem(id)}
        surface={[styles.card, unread ? styles.unreadCard : null]}
      >
        <Row style={styles.rowContent}>
          <View style={[styles.iconWell, unread ? styles.unreadIconWell : null]}>
            <Icon name={iconFor(tipo)} size={17} />
          </View>
          <View style={styles.text}>
            <Copy weight={unread ? "bold" : "semibold"}>{titulo}</Copy>
            <Copy tone="secondary" style={styles.body}>
              {cuerpo}
            </Copy>
            <View style={styles.meta}>
              {time ? (
                <Copy tone="secondary" style={styles.time}>
                  {time}
                </Copy>
              ) : null}
              {important ? <Badge warning>Importante</Badge> : null}
            </View>
          </View>
          {unread ? <View style={styles.dot} /> : null}
        </Row>
      </Pressing>
    </ReanimatedSwipeable>
  );
});

const DELETE_ACTIONS = [{ name: "delete", label: "Eliminar" }];

const styles = StyleSheet.create({
  separator: { height: 12 },
  listContent: { paddingTop: 0, paddingBottom: 32 },
  footer: { paddingVertical: 16 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  unreadCard: { backgroundColor: colors.soft, borderColor: colors.soft },
  rowContent: { alignItems: "flex-start" },
  iconWell: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.soft,
    borderRadius: 16,
  },
  unreadIconWell: { backgroundColor: colors.surface },
  text: { flex: 1, gap: 5 },
  body: { fontSize: 12 },
  meta: { flexDirection: "row", alignItems: "center", gap: 8 },
  time: { fontSize: 11 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  // As tall and as round as the card; the gap keeps the two shapes apart.
  deleteAction: {
    width: 88,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: colors.danger,
    borderRadius: 14,
  },
  deleteLabel: { color: colors.surface, fontSize: 12 },
});
