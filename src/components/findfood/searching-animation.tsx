import LottieView from "lottie-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { Icon } from "@/components/findfood/icon";
import { colors } from "@/design/tokens";

const SIZE = 140;

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
 * Radar rings pulsing around a magnifier while the donation waits for a volunteer. Decorative:
 * the headline next to it already says what is happening. With "reduce motion" on it is the
 * static search icon instead.
 */
export function SearchingAnimation() {
  const reduceMotion = useReduceMotion();
  return (
    <View
      testID="searching-animation"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      {reduceMotion ? (
        <View style={styles.still}>
          <Icon name="search" size={32} />
        </View>
      ) : (
        <LottieView
          source={require("../../../assets/lottie/searching-volunteer.json")}
          autoPlay
          loop
          style={styles.animation}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" },
  animation: { width: SIZE, height: SIZE },
  still: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.soft,
    alignItems: "center",
    justifyContent: "center",
  },
});
