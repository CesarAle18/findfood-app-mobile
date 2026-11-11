import LottieView, { type AnimationObject } from "lottie-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { Icon, type IconName } from "@/components/findfood/icon";
import { colors } from "@/design/tokens";

/** Every animation is 350×250; keep their aspect ratio. */
const WIDTH = 280;
const HEIGHT = 200;

export type StatusAnimationKind =
  | "searching"
  | "expired"
  | "empty-filter"
  | "caught-up"
  | "empty-route"
  | "waiting-offers"
  | "on-the-way"
  | "empty-donations"
  | "review"
  | "delivered"
  | "route-completed"
  | "connection-error"
  | "rating-sent";

type Animation = {
  source: AnimationObject;
  /** Static icon shown instead with "reduce motion" on. */
  still: IconName;
  /** Celebrations play once and hold their last frame; the rest loop. */
  once?: boolean;
};

const ANIMATIONS: Record<StatusAnimationKind, Animation> = {
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
  // A dotted route that draws to an empty pin: no accepted pickups to route yet.
  "empty-route": {
    source: require("../../../assets/lottie/empty-route.json"),
    still: "route",
  },
  // A truck idling on the road under a pinging dot: waiting for an offer to arrive.
  "waiting-offers": {
    source: require("../../../assets/lottie/waiting-offers.json"),
    still: "truck",
  },
  // The same truck once a volunteer has the donation: it is (or will soon be) on its way.
  "on-the-way": {
    source: require("../../../assets/lottie/waiting-offers.json"),
    still: "truck",
  },
  // An open box with a green heart rising out of it: the donor has no donations yet.
  "empty-donations": {
    source: require("../../../assets/lottie/empty-donations.json"),
    still: "box",
  },
  // A magnifier reading a document line by line: the volunteer request is under review.
  review: {
    source: require("../../../assets/lottie/review.json"),
    still: "file",
  },
  // A green check with confetti: the donation reached the bank.
  delivered: {
    source: require("../../../assets/lottie/delivered.json"),
    still: "check",
    once: true,
  },
  // A dotted route that ends at a finish flag: the volunteer closed the route.
  "route-completed": {
    source: require("../../../assets/lottie/route-completed.json"),
    still: "check",
    once: true,
  },
  // A plug that cannot reach its socket under a cloud: the data could not be loaded.
  "connection-error": {
    source: require("../../../assets/lottie/connection-error.json"),
    still: "close",
  },
  // Five stars that fill one after another: the rating was sent.
  "rating-sent": {
    source: require("../../../assets/lottie/rating-sent.json"),
    still: "star",
    once: true,
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
  const { source, still, once = false } = ANIMATIONS[kind];
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
        <LottieView source={source} autoPlay loop={!once} style={styles.animation} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: WIDTH,
    height: HEIGHT,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
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
