/**
 * Shows the floating offer card over whatever screen is open the moment an offer reaches
 * the volunteer. Mounted once in the root layout, next to the navigator (the OfflineOverlay
 * pattern, not an RN Modal): it renders nothing outside volunteer mode or on the offer
 * screen itself, and takes no touches while no card shows.
 *
 * No listener of its own: the foreground push and the Realtime sync already refresh
 * `["asignaciones","ofertas"]`, and `useOfertas({ live: true })` polls while Realtime is
 * down. The shown offer is held as a snapshot, so an offer that leaves the list while on
 * screen (another volunteer took it, or it was withdrawn) turns into "ya no disponible"
 * instead of vanishing, and closes by itself.
 */
import { useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, usePathname } from "expo-router";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  ReduceMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { liveOffers } from "@/domain/mappers/routes";
import { pendingOffers, queuedOffer, type QueuedOffer } from "@/domain/offer-queue";
import { motion } from "@/design/tokens";
import { setOfferAlertActive } from "@/notifications/push";
import {
  acceptedLoadKg,
  exceedsCapacity,
  useAcceptOffer,
  type OfferClosedReason,
} from "@/screens/use-accept-offer";
import { useOfertas } from "@/services/asignaciones";
import { queryKeys } from "@/services/query-keys";
import { useAccess, useMe } from "@/state/session";

import { OfferAlertCard } from "./offer-alert-card";

/** The full offer screen already shows the offer: no card on top of it. */
const OFFER_ROUTE = "/voluntario/oferta";
/** How long a closed card (taken or expired) stays before closing by itself. */
export const CLOSED_CARD_MS = 4_000;

const ease = Easing.out(Easing.cubic);
// Layout animations follow the system "reduce motion" setting: they jump to the end.
const cardIn = FadeInDown.duration(motion.base)
  .easing(ease)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 24 }] })
  .reduceMotion(ReduceMotion.System);
const cardOut = FadeOutDown.duration(motion.exit).reduceMotion(ReduceMotion.System);
const scrimIn = FadeIn.duration(motion.base).reduceMotion(ReduceMotion.System);
const scrimOut = FadeOut.duration(motion.exit).reduceMotion(ReduceMotion.System);

/** Haptics are a courtesy: a device without them (or a failure) never breaks the flow. */
function buzz(feedback: () => Promise<void>): void {
  try {
    feedback().catch(() => {});
  } catch {
    // No haptics module on this runtime.
  }
}

const success = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
const failure = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
const light = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

export function OfferAlertHost() {
  const { phase, canVolunteer, activeRole } = useAccess();
  const pathname = usePathname();
  const enabled =
    phase === "app" && canVolunteer && activeRole === "VOLUNTARIO" && pathname !== OFFER_ROUTE;
  // The offers set aside this session ("Ahora no"), kept here, above the queue, so opening
  // the offer screen and coming back does not bring them back.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!enabled) return;
    setOfferAlertActive(true);
    return () => setOfferAlertActive(false);
  }, [enabled]);

  if (!enabled) return null;
  return <OfferAlertQueue dismissed={dismissed} setDismissed={setDismissed} />;
}

interface Shown {
  offer: QueuedOffer;
  /** Why it can no longer be accepted; null while it can. */
  closed: OfferClosedReason | null;
}

const NO_QUEUE = { current: null, remaining: 0 };

function OfferAlertQueue({
  dismissed,
  setDismissed,
}: {
  dismissed: ReadonlySet<string>;
  setDismissed: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const ofertas = useOfertas({ live: true });
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<Shown | null>(null);
  // The offer whose accept is in flight: its row may leave the list (it became ACEPTADA)
  // before the answer lands, which is not "taken by someone else".
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const data = ofertas.data;

  // The time the queue filters deadlines against, read again whenever its inputs change.
  const clockKey = `${ofertas.dataUpdatedAt}:${dismissed.size}:${shown?.offer.id ?? ""}`;
  const [clock, setClock] = useState(() => ({ at: Date.now(), key: clockKey }));
  if (clock.key !== clockKey) setClock(() => ({ at: Date.now(), key: clockKey }));

  // Adjusted during render (not in an effect), so a commit never shows a stale card.
  const queue = data ? pendingOffers(data, dismissed, clock.at) : NO_QUEUE;
  if (shown === null) {
    if (queue.current) setShown({ offer: queue.current, closed: null });
  } else if (data && shown.closed !== "unavailable" && acceptingId !== shown.offer.id) {
    const row = liveOffers(data).find((oferta) => oferta.id === shown.offer.id);
    if (!row) {
      // Gone while on screen. An expired card stays expired; a live one was taken.
      if (shown.closed === null) setShown({ ...shown, closed: "unavailable" });
    } else if (row.expira_at !== shown.offer.expiresAtIso && !Number.isNaN(Date.parse(row.expira_at))) {
      // The server moved the deadline: its deadline decides, so the card opens again.
      setShown({ offer: queuedOffer(row), closed: null });
    }
  }

  const shownId = shown?.offer.id ?? null;
  const closed = shown?.closed ?? null;

  useEffect(() => {
    if (shownId !== null) buzz(success);
  }, [shownId]);

  useEffect(() => {
    if (shownId === null || closed === null) return;
    const timer = setTimeout(() => {
      setDismissed((previous) => new Set(previous).add(shownId));
      setShown(null);
    }, CLOSED_CARD_MS);
    return () => clearTimeout(timer);
  }, [shownId, closed, setDismissed]);

  if (shown === null) {
    // Mounted but empty: the next offer enters into it, and no touch is taken meanwhile.
    return <View style={styles.root} />;
  }

  const setAside = () => {
    setDismissed((previous) => new Set(previous).add(shown.offer.id));
    setShown(null);
  };
  const dismiss = () => {
    buzz(light);
    setAside();
  };
  const openDetail = () => {
    setAside();
    router.push({ pathname: OFFER_ROUTE, params: { asignacionId: shown.offer.id } });
  };
  const expire = () => {
    setShown((current) =>
      current && current.offer.id === shown.offer.id && current.closed === null
        ? { ...current, closed: "expired" }
        : current,
    );
    // The API drops expired offers: the list answers whether it is really gone.
    void queryClient.invalidateQueries({ queryKey: queryKeys.asignaciones.ofertas() });
  };

  const others = data
    ? pendingOffers(data, new Set(dismissed).add(shown.offer.id), clock.at)
    : NO_QUEUE;
  const capacityKg = me?.voluntario?.capacidad_carga_kg ?? null;

  return (
    <View style={styles.root}>
      <Animated.View entering={scrimIn} exiting={scrimOut} style={[StyleSheet.absoluteFill, styles.scrim]}>
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={dismiss}
          style={StyleSheet.absoluteFill}
          testID="offer-alert-scrim"
        />
      </Animated.View>
      <KeyboardStickyView style={styles.dock}>
        <Animated.View
          // A new offer replaces the card: the old one leaves while the new one rises.
          key={shown.offer.id}
          entering={cardIn}
          exiting={cardOut}
          style={[
            styles.card,
            { bottom: insets.bottom + 12, left: insets.left + 12, right: insets.right + 12 },
          ]}
        >
          <OfferAlertSession
            offer={shown.offer}
            closed={shown.closed}
            remaining={others.current ? others.remaining + 1 : 0}
            overCapacity={exceedsCapacity(shown.offer, capacityKg, data ? acceptedLoadKg(data) : 0)}
            onDismiss={dismiss}
            onOpenDetail={openDetail}
            onExpire={expire}
            onAcceptStart={() => setAcceptingId(shown.offer.id)}
            onAccepted={() => {
              setAcceptingId(null);
              setAside();
            }}
            onFailed={(reason) => {
              setAcceptingId(null);
              if (reason !== null) {
                setShown((current) =>
                  current && current.offer.id === shown.offer.id ? { ...current, closed: reason } : current,
                );
              }
            }}
          />
        </Animated.View>
      </KeyboardStickyView>
    </View>
  );
}

/** One card's accept flow: keyed by the offer, so a failure never carries to the next. */
function OfferAlertSession({
  offer,
  closed,
  remaining,
  overCapacity,
  onDismiss,
  onOpenDetail,
  onExpire,
  onAcceptStart,
  onAccepted,
  onFailed,
}: {
  offer: QueuedOffer;
  closed: OfferClosedReason | null;
  remaining: number;
  overCapacity: boolean;
  onDismiss: () => void;
  onOpenDetail: () => void;
  onExpire: () => void;
  onAcceptStart: () => void;
  onAccepted: () => void;
  onFailed: (reason: OfferClosedReason | null) => void;
}) {
  const { accept, accepting, error } = useAcceptOffer(offer.id, {
    onAccepted: () => {
      buzz(success);
      onAccepted();
    },
    onFailed: (reason) => {
      buzz(failure);
      onFailed(reason);
    },
  });

  return (
    <OfferAlertCard
      offer={offer}
      remaining={remaining}
      closed={closed}
      overCapacity={overCapacity}
      accepting={accepting}
      error={error}
      onAccept={() => {
        onAcceptStart();
        void accept();
      }}
      onDismiss={onDismiss}
      onOpenDetail={onOpenDetail}
      onExpire={onExpire}
    />
  );
}

const styles = StyleSheet.create({
  root: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, pointerEvents: "box-none" },
  scrim: { backgroundColor: "rgba(10, 24, 18, 0.22)" },
  dock: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, pointerEvents: "box-none" },
  card: { position: "absolute" },
});
