/**
 * The floating card of a new offer: what to pick up, where, when, and how long is left to
 * answer, with "Aceptar donación" and "Rechazar". The host owns the queue, the accept
 * request and the closed states. The card loads the donation detail for what the offer row
 * lacks (a product photo, the notes, the expiry and publish dates), and runs the reject
 * itself: "Rechazar" swaps the answer buttons for a reason panel (the reject flow of the
 * offer screen), and the host hears when it starts, lands or fails.
 *
 * The glass is a system blur on iOS (and web) under a translucent white wash. Android blur
 * needs the whole navigator wrapped in a `BlurTargetView` (expo-blur v57), so Android, and
 * iOS with "Reduce transparency", get an almost opaque surface instead: same shape, same
 * contrast.
 */
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import Animated, {
  useAnimatedStyle,
  ReduceMotion,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { fromFechaVencimiento, fromIsoToBogota } from "@/domain/mappers/dates";
import { formatKg } from "@/domain/mappers/profile";
import type { QueuedOffer } from "@/domain/offer-queue";
import { colors, fonts } from "@/design/tokens";
import { useDonacion, type DonacionDetalleDto } from "@/services/donaciones";
import type { OfferClosedReason } from "@/screens/use-accept-offer";
import { useRejectOffer } from "@/screens/use-reject-offer";

import { formatRemaining, useCountdown } from "../countdown";
import { photosOf } from "../donation-photos";
import { Icon } from "../icon";
import { Pressing } from "../motion";
import { RejectOfferForm } from "../reject-offer-form";
import { Button, Copy, FormMessage } from "../ui";

export interface OfferAlertCardProps {
  offer: QueuedOffer;
  /** Offers waiting behind this one. */
  remaining: number;
  /** Why the offer can no longer be accepted; null while it can. */
  closed: OfferClosedReason | null;
  overCapacity: boolean;
  accepting: boolean;
  /** The message of the last failed accept. */
  error?: string;
  onAccept: () => void;
  /**
   * The close button, the scrim and "Cerrar" on a closed card: closes without answering,
   * so the offer stays live elsewhere.
   */
  onDismiss: () => void;
  onOpenDetail: () => void;
  /** The countdown reached `expira_at`. */
  onExpire: () => void;
  /** A reject with a valid reason is about to be sent. */
  onRejectStart: () => void;
  /** The server confirmed the reject. */
  onRejected: () => void;
  /** The reject failed; `reason` says whether it found the offer closed. */
  onRejectFailed: (reason: OfferClosedReason | null) => void;
}

/**
 * Room the card keeps free above it while the keyboard is open: the status bar and a gap,
 * so the reject panel's comment field never slides under the top of the screen.
 */
const KEYBOARD_ROOM = 96;
/** The least height the card keeps, so the reject panel stays reachable behind a tall keyboard. */
export const MIN_CARD_HEIGHT = 220;

/** Whether this platform draws a real blur behind the card (see the file comment). */
const PLATFORM_BLURS = Platform.OS === "ios" || Platform.OS === "web";

/** iOS "Reduce transparency": the glass turns opaque, as the system's own materials do. */
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (active) setReduce(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduce);
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);
  return reduce;
}

/** In the last quarter of its time the countdown turns amber: the offer is about to lapse. */
const URGENT_SHARE = 0.25;

/** Time left (large, ticking) and the bar from `ofrecida_at` to `expira_at`. */
function AlertCountdown({
  offer,
  onExpire,
}: {
  offer: QueuedOffer;
  onExpire: () => void;
}) {
  const { remainingMs, expired } = useCountdown(offer.expiresAtIso, onExpire);
  const total = Date.parse(offer.expiresAtIso) - Date.parse(offer.offeredAtIso);
  const share = Number.isFinite(total) && total > 0 ? Math.min(1, remainingMs / total) : null;
  const urgent = share !== null && share < URGENT_SHARE;
  const minutes = Math.floor(remainingMs / 60_000);
  const label = expired
    ? "Oferta vencida"
    : minutes < 1
      ? "Vence en menos de un minuto"
      : `Vence en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;

  return (
    <View style={styles.countdown}>
      <View accessible accessibilityRole="timer" accessibilityLabel={label} style={styles.timeRow}>
        <Copy
          weight="bold"
          style={[styles.time, { color: expired ? colors.danger : urgent ? colors.warning : colors.text }]}
        >
          {expired ? "Vencida" : formatRemaining(remainingMs)}
        </Copy>
        <Copy tone="secondary" style={styles.timeHint}>
          {expired ? `Venció a las ${offer.expiresAt}` : `para responder · vence a las ${offer.expiresAt}`}
        </Copy>
      </View>
      {share !== null ? <ProgressBar share={share} urgent={urgent} /> : null}
    </View>
  );
}

function ProgressBar({ share, urgent }: { share: number; urgent: boolean }) {
  const progress = useSharedValue(share);
  useEffect(() => {
    // One tick per second: a linear second-long glide keeps the bar moving smoothly; with
    // the system "reduce motion" setting Reanimated jumps straight to the value.
    progress.set(
      withTiming(share, { duration: 1_000, easing: Easing.linear, reduceMotion: ReduceMotion.System }),
    );
  }, [share, progress]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.get() }] }));
  return (
    <View style={styles.track} importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[styles.fill, { backgroundColor: urgent ? colors.warning : colors.primary }, fill]}
      />
    </View>
  );
}

/** What the donation detail adds; nothing while it loads or when the donor left it out. */
function detailLines(donacion: DonacionDetalleDto | undefined) {
  if (!donacion) return { photo: null, lines: [] as { label: string; value: string }[] };
  const lines: { label: string; value: string }[] = [];
  const description = donacion.descripcion?.trim();
  if (description) lines.push({ label: "Descripción", value: description });
  const notes = [
    ...new Set(donacion.items.map((item) => item.observaciones?.trim()).filter(Boolean)),
  ] as string[];
  if (notes.length > 0) lines.push({ label: "Notas del donante", value: notes.join(" · ") });
  if (donacion.fecha_vencimiento_min) {
    try {
      lines.push({
        label: "Vencimiento más próximo",
        value: fromFechaVencimiento(donacion.fecha_vencimiento_min),
      });
    } catch {
      // An unreadable date is left out rather than shown wrong.
    }
  }
  if (donacion.publicada_at) {
    try {
      lines.push({ label: "Publicada", value: `a las ${fromIsoToBogota(donacion.publicada_at).time}` });
    } catch {
      // Same: no line instead of a wrong time.
    }
  }
  return { photo: photosOf(donacion.items)[0] ?? null, lines };
}

/** Uber-like route: where the volunteer is (only with a distance), then the pickup point. */
function RouteBlock({ offer }: { offer: QueuedOffer }) {
  return (
    <View style={styles.route}>
      {offer.distance !== null ? (
        <View style={styles.routeRow}>
          <View style={styles.routeRail}>
            <View style={styles.dot} />
            <View style={styles.line} />
          </View>
          <Copy weight="medium" style={styles.routeText}>{`A ${offer.distance} de ti`}</Copy>
        </View>
      ) : null}
      <View style={styles.routeRow}>
        <View style={styles.routeRail}>
          <View style={styles.square} />
        </View>
        <View style={styles.routeBody}>
          <Copy weight="semibold" style={styles.routeText}>
            {offer.street}
          </Copy>
          {offer.reference !== null ? (
            <Copy tone="secondary" style={styles.small}>
              {`Indicaciones: ${offer.reference}`}
            </Copy>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ClosedNotice({ closed, error }: { closed: OfferClosedReason; error?: string }) {
  const unavailable = closed === "unavailable";
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.notice, unavailable ? styles.noticeUnavailable : styles.noticeExpired]}
    >
      <Copy weight="bold" style={{ color: unavailable ? colors.danger : colors.warning }}>
        {unavailable ? "Ya no está disponible" : "Esta oferta venció"}
      </Copy>
      {unavailable ? (
        <Copy tone="secondary" style={styles.small}>
          {error ?? "Otro voluntario tomó esta recogida"}
        </Copy>
      ) : null}
    </View>
  );
}

export function OfferAlertCard({
  offer,
  remaining,
  closed,
  overCapacity,
  accepting,
  error,
  onAccept,
  onDismiss,
  onOpenDetail,
  onExpire,
  onRejectStart,
  onRejected,
  onRejectFailed,
}: OfferAlertCardProps) {
  const { height } = useWindowDimensions();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const reduceTransparency = useReduceTransparency();
  const blur = PLATFORM_BLURS && !reduceTransparency;
  // The offer row has no photos or notes: the detail signs them for the offered volunteer.
  const { data: donacion } = useDonacion(offer.donacionId);
  const { photo, lines } = detailLines(donacion);
  const title = offer.title ?? "Donación disponible";

  const [rejectOpen, setRejectOpen] = useState(false);
  const reject = useRejectOffer(offer.id, {
    onStart: onRejectStart,
    onRejected,
    onFailed: onRejectFailed,
  });
  const rejecting = reject.rejecting;
  // An answer in flight owns the card: nothing else may close it or start another one.
  const answering = accepting || rejecting;
  // A closed card only lets itself close: the panel gives way to the closed notice.
  const panelOpen = rejectOpen && closed === null;
  // Only one failure can close the card: a closed card takes no other answer.
  const closedMessage = reject.closedReason !== null ? (reject.error ?? undefined) : error;

  const scroll = useRef<ScrollView>(null);
  // The panel sits at the end of the body: keep it, and its comment field, in view as the
  // panel opens, the comment field appears or the keyboard shrinks the card.
  const keepPanelInView = panelOpen ? () => scroll.current?.scrollToEnd({ animated: true }) : undefined;

  // Capped at 70% of the window, and below the top of the screen while the keyboard is open
  // (the host's KeyboardStickyView lifts the card above it).
  const maxHeight = Math.round(
    Math.max(MIN_CARD_HEIGHT, Math.min(height * 0.7, height - keyboardHeight - KEYBOARD_ROOM)),
  );

  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={`Nueva recogida ${offer.code}`}
      style={[styles.shadow, { maxHeight }]}
    >
      <View style={[styles.glass, blur ? styles.glassBorder : styles.solidBorder]}>
        {blur ? (
          <BlurView
            testID="offer-alert-blur"
            tint="systemMaterialLight"
            intensity={60}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: blur ? GLASS_WASH : SOLID_WASH }]}
        />

        <View style={styles.header}>
          <View style={styles.badge}>
            <Copy weight="semibold" style={styles.badgeText}>
              Nueva recogida
            </Copy>
          </View>
          <Copy weight="medium" tone="secondary" style={styles.code}>
            {offer.code}
          </Copy>
          <View style={styles.spacer} />
          {remaining > 0 ? (
            <View
              accessible
              accessibilityLabel={`${remaining} ${remaining === 1 ? "oferta más" : "ofertas más"} en espera`}
              style={styles.more}
            >
              <Copy weight="semibold" style={styles.moreText}>{`+${remaining} más`}</Copy>
            </View>
          ) : null}
          <Pressing
            accessibilityRole="button"
            accessibilityLabel="Cerrar oferta"
            disabled={answering}
            hitSlop={8}
            onPress={onDismiss}
            scale={0.92}
            surface={styles.close}
          >
            <Icon name="close" size={18} color={colors.secondary} />
          </Pressing>
        </View>

        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={keepPanelInView}
          onLayout={keepPanelInView}
        >
          <AlertCountdown offer={offer} onExpire={onExpire} />

          <View style={styles.headline}>
            <View style={styles.headlineText}>
              <Copy weight="bold" style={styles.title}>
                {title}
              </Copy>
              <Copy tone="secondary">{formatKg(offer.weightKg)}</Copy>
            </View>
            {photo ? (
              <Image
                source={{ uri: photo.uri, cacheKey: `donacion-item-${photo.id}` }}
                contentFit="cover"
                accessibilityLabel={`Foto de ${photo.name}`}
                style={styles.photo}
              />
            ) : null}
          </View>

          {offer.products.length > 0 ? (
            <View style={styles.products} accessibilityLabel={`Productos: ${offer.products.join(", ")}`}>
              {offer.products.map((product) => (
                <View key={product} style={styles.product}>
                  <Copy style={styles.productText}>{product}</Copy>
                </View>
              ))}
            </View>
          ) : null}

          {offer.refrigerated ? (
            <View style={styles.cold}>
              <Copy weight="semibold" style={styles.coldText}>
                Requiere refrigeración
              </Copy>
            </View>
          ) : null}

          <RouteBlock offer={offer} />

          <View style={styles.window}>
            <Icon name="clock" size={18} />
            <View style={styles.routeBody}>
              <Copy tone="secondary" style={styles.label}>
                Ventana de recogida
              </Copy>
              <Copy weight="medium">{offer.pickupWindow}</Copy>
            </View>
          </View>

          {lines.map((line) => (
            <View key={line.label} style={styles.meta}>
              <Copy tone="secondary" style={styles.label}>
                {line.label}
              </Copy>
              <Copy>{line.value}</Copy>
            </View>
          ))}

          <FormMessage
            tone="info"
            message={
              overCapacity
                ? "Con tus recogidas aceptadas superarías tu capacidad para una sola ruta"
                : undefined
            }
          />

          {panelOpen ? (
            <View style={styles.rejectPanel}>
              <View accessible accessibilityRole="header">
                <Copy weight="bold" style={styles.panelTitle}>
                  ¿Por qué la rechazas?
                </Copy>
              </View>
              <RejectOfferForm reject={reject} onBack={() => setRejectOpen(false)} />
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {closed !== null ? (
            <ClosedNotice closed={closed} error={closedMessage} />
          ) : panelOpen ? null : (
            <FormMessage message={error} />
          )}
          {panelOpen ? null : (
            <View style={styles.actions}>
              <View style={styles.flex}>
                {closed !== null ? (
                  <Button variant="outline" disabled={answering} onPress={onDismiss}>
                    Cerrar
                  </Button>
                ) : (
                  <Button variant="outline" disabled={answering} onPress={() => setRejectOpen(true)}>
                    Rechazar
                  </Button>
                )}
              </View>
              <View style={styles.flex}>
                <Button
                  loading={accepting}
                  disabled={closed !== null || rejecting}
                  onPress={onAccept}
                >
                  Aceptar donación
                </Button>
              </View>
            </View>
          )}
          {closed === null ? (
            <Pressing
              accessibilityRole="link"
              accessibilityHint="Abre la oferta completa, con el mapa"
              disabled={answering}
              onPress={onOpenDetail}
              scale={1}
              surface={styles.detailLink}
            >
              <Copy tone="primary" weight="semibold" style={styles.detailText}>
                Ver detalle
              </Copy>
            </Pressing>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** White wash over the blur: enough body for the text, still lets the screen show through. */
const GLASS_WASH = "rgba(255,255,255,0.74)";
/** Without a blur: almost the plain surface, so contrast never depends on what is behind. */
const SOLID_WASH = "rgba(255,255,255,0.97)";
const RADIUS = 24;

const styles = StyleSheet.create({
  shadow: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: RADIUS,
    backgroundColor: "transparent",
    boxShadow: "0px 18px 40px rgba(23, 51, 42, 0.22)",
  },
  // expo-blur ignores borderRadius: the clipping view rounds the blur instead.
  glass: { borderRadius: RADIUS, overflow: "hidden", borderWidth: 1, flexShrink: 1 },
  glassBorder: { borderColor: "rgba(255,255,255,0.7)" },
  solidBorder: { borderColor: "rgba(202,215,209,0.8)" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: colors.surface, fontSize: 11, lineHeight: 15 },
  code: { fontSize: 12, letterSpacing: 0.4 },
  spacer: { flex: 1 },
  more: {
    backgroundColor: colors.soft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  moreText: { color: colors.primary, fontSize: 11, lineHeight: 15 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(23,51,42,0.06)",
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 14 },
  countdown: { gap: 8 },
  timeRow: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" },
  time: { fontSize: 30, lineHeight: 36, fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  timeHint: { fontSize: 12 },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(23,51,42,0.08)",
    overflow: "hidden",
  },
  fill: { height: 3, borderRadius: 2, width: "100%", transformOrigin: "left" },
  headline: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  headlineText: { flex: 1, gap: 2 },
  title: { fontSize: 18, lineHeight: 24 },
  photo: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.muted },
  products: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  product: {
    backgroundColor: "rgba(240,244,242,0.9)",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  productText: { fontSize: 12, lineHeight: 16, color: colors.text },
  cold: {
    alignSelf: "flex-start",
    backgroundColor: colors.infoSoft,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  coldText: { fontSize: 12, lineHeight: 16, color: colors.info },
  route: { gap: 0 },
  routeRow: { flexDirection: "row", gap: 12 },
  routeRail: { width: 12, alignItems: "center", paddingTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  line: { width: 2, flex: 1, minHeight: 18, marginVertical: 3, backgroundColor: colors.border },
  square: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.text },
  routeBody: { flex: 1, gap: 2, paddingBottom: 8 },
  routeText: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  window: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  label: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, letterSpacing: 0.2 },
  meta: { gap: 2 },
  rejectPanel: {
    gap: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  panelTitle: { fontSize: 16, lineHeight: 22 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 8 },
  notice: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  noticeUnavailable: { backgroundColor: "rgba(180,71,71,0.08)" },
  noticeExpired: { backgroundColor: colors.warningSoft },
  actions: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  detailLink: { minHeight: 36, alignItems: "center", justifyContent: "center" },
  detailText: { fontSize: 13 },
});
