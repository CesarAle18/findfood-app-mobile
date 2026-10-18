/**
 * A live countdown to an ISO deadline (an offer's `expira_at`). One interval per mounted
 * countdown recomputes from `Date.now()` on every tick, so a suspended JS thread or a late
 * tick never drifts it. `<Countdown>` keeps the per-second re-render inside a leaf.
 */
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { Badge } from "./ui";

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** `mm:ss`, or `h:mm:ss` from one hour; a partial second still shows as one. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1_000));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${twoDigits(minutes)}:${twoDigits(seconds)}`
    : `${twoDigits(minutes)}:${twoDigits(seconds)}`;
}

/** What a screen reader announces: minutes, not a ticking clock. */
function remainingLabel(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Vence en menos de un minuto";
  return `Vence en ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
}

/** The deadline in epoch ms; null without one or when it does not parse. */
function toDeadline(expiresAt: string | null): number | null {
  if (expiresAt === null) return null;
  const deadline = Date.parse(expiresAt);
  return Number.isNaN(deadline) ? null : deadline;
}

/**
 * Time left before `expiresAt` (0 and not expired without a deadline). The interval stops
 * at the deadline, and `onExpire` runs once per deadline, also when it already passed.
 */
export function useCountdown(
  expiresAt: string | null,
  onExpire?: () => void,
): { remainingMs: number; expired: boolean } {
  const deadline = toDeadline(expiresAt);
  const [now, setNow] = useState(() => Date.now());
  // A new deadline restarts from the real time (adjusted during render, not in an effect):
  // the last tick may be up to a second old, and none comes when the new deadline passed.
  const [countingTo, setCountingTo] = useState(deadline);
  if (countingTo !== deadline) {
    setCountingTo(deadline);
    setNow(() => Date.now());
  }
  useEffect(() => {
    if (deadline === null || Date.now() >= deadline) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
  }, [deadline]);

  const remainingMs = deadline === null ? 0 : Math.max(0, deadline - now);
  const expired = deadline !== null && remainingMs === 0;

  const expiredFor = useRef<number | null>(null);
  useEffect(() => {
    if (!expired || expiredFor.current === deadline) return;
    expiredFor.current = deadline;
    onExpire?.();
  }, [expired, deadline, onExpire]);

  return { remainingMs, expired };
}

/** "Vence en mm:ss", then "Vencida". Only this badge re-renders every second. */
export function Countdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire?: () => void;
}) {
  const { remainingMs, expired } = useCountdown(expiresAt, onExpire);
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={expired ? "Vencida" : remainingLabel(remainingMs)}
      style={styles.countdown}
    >
      <Badge warning>{expired ? "Vencida" : `Vence en ${formatRemaining(remainingMs)}`}</Badge>
    </View>
  );
}

const styles = StyleSheet.create({
  // The badge sizes to its text, also inside a stretching column.
  countdown: { alignSelf: "flex-start" },
});
