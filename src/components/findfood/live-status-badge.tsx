import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import type { LiveAvailability, LiveState } from "@/domain/mappers/availability-summary";
import { toneColor, type StatusTone } from "@/domain/mappers/statuses";

import { Copy } from "./ui";

const TONES = {
  online: "primary",
  "off-hours": "warning",
  offline: "neutral",
} satisfies Record<LiveState, StatusTone>;

/** One breath of the online dot; it then runs back, so a full cycle takes twice as long. */
const PULSE_MS = 900;

/**
 * The volunteer's live status as a pill: a dot and the label of `liveAvailability`. The whole
 * pill is one text for screen readers, and a polite live region so a minute tick that changes
 * the state is announced without interrupting.
 */
export function LiveStatusBadge({ state, label }: LiveAvailability) {
  const { text, background } = toneColor(TONES[state]);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      style={[styles.pill, { backgroundColor: background }]}
    >
      <Dot color={text} pulsing={state === "online"} />
      <Copy weight="medium" style={[styles.label, { color: text }]}>
        {label}
      </Copy>
    </View>
  );
}

/**
 * Whether the device asks for reduced motion, following changes while mounted; null until
 * the first answer. Read from AccessibilityInfo rather than Reanimated's `useReducedMotion`,
 * which only reports the setting at app start (and is missing from Reanimated's Jest mock).
 */
function useReduceMotion(): boolean | null {
  const [reduce, setReduce] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduce(enabled);
      })
      .catch(() => {
        if (mounted) setReduce(true);
      });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/**
 * The dot breathes (opacity and scale, on the UI thread) only while online; otherwise, under
 * the system "reduce motion" setting, and until that setting is known, it stays still at full
 * opacity.
 */
function Dot({ color, pulsing }: { color: string; pulsing: boolean }) {
  const reduceMotion = useReduceMotion();
  const animate = pulsing && reduceMotion === false;
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!animate) {
      cancelAnimation(pulse);
      pulse.set(0);
      return;
    }
    pulse.set(
      withRepeat(
        withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
        undefined,
        ReduceMotion.System,
      ),
    );
    return () => cancelAnimation(pulse);
  }, [animate, pulse]);
  const breathing = useAnimatedStyle(() => ({
    opacity: 1 - pulse.get() * 0.55,
    transform: [{ scale: 1 + pulse.get() * 0.35 }],
  }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, breathing]} />;
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, lineHeight: 18 },
});
