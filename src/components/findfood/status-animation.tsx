import LottieView, { type AnimationObject } from "lottie-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/findfood/icon";
import { colors } from "@/design/tokens";

/** Every animation is 350×250; keep their aspect ratio. */
const WIDTH = 280;
const HEIGHT = 200;

export type StatusAnimationKind = "searching" | "expired" | "empty-filter" | "caught-up";

const ANIMATIONS: Record<StatusAnimationKind, { source: AnimationObject; still: IconName }> = {
  // Magnifier searching (from LottieFiles) while the donation waits for a volunteer.
  searching: {
    source: require("../../../assets/lottie/searching-volunteer.json"),
    still: "search",
  },
  // Clock that stops, shakes and shows a "!" once the publication expired.
  expired: {
    source: require("../../../assets/lottie/publication-expired.json"),
    still: "clock",
  },
  // Dots that drop into a filter funnel and nothing comes out: no row matches the filter.
  "empty-filter": {
    source: require("../../../assets/lottie/empty-filter.json"),
    still: "box",
  },
  // A bell that rings and settles, then a check: no unread notifications left.
  "caught-up": {
    source: require("../../../assets/lottie/caught-up.json"),
    still: "bell",
  },
};

/** Whether the device asks for reduced motion; follows changes while mounted. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduce(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/**
 * Looping illustration of a donation's state. Decorative: the headline next to it already says
 * what is happening. With "reduce motion" on it is the state's static icon instead.
 */
export function StatusAnimation({ kind }: { kind: StatusAnimationKind }) {
  const reduceMotion = useReduceMotion();
  const { source, still } = ANIMATIONS[kind];
  return (
    <View
      testID={`${kind}-animation`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      {reduceMotion ? (
        <View style={styles.still}>
          <Icon name={still} size={32} />
        </View>
      ) : (
        <LottieView source={source} autoPlay loop style={styles.animation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: WIDTH, height: HEIGHT, alignItems: "center", justifyContent: "center" },
  animation: { width: WIDTH, height: HEIGHT },
  still: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
});
