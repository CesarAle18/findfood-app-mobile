import type { Ref } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { PROVIDER_GOOGLE, type MapViewProps } from "react-native-maps";

import { colors } from "@/design/tokens";

export type FindFoodMapProps = Omit<MapViewProps, "provider" | "style"> & {
  ref?: Ref<MapView>;
  /** Fixed height of the map card (the map never sizes from its content). */
  height?: number;
  /**
   * False for previews: the map ignores touches, so the screen around it keeps scrolling.
   * Pair with `liteMode` (Android renders a static bitmap) for detail cards.
   */
  interactive?: boolean;
};

/**
 * Google Maps on both platforms, with the app's card shape. One per screen, never inside a
 * list item. Needs the Google Maps keys of the `react-native-maps` config plugin on device.
 */
export function FindFoodMap({
  ref,
  height = 240,
  interactive = true,
  children,
  ...props
}: FindFoodMapProps) {
  const fixed = interactive
    ? null
    : {
        scrollEnabled: false,
        zoomEnabled: false,
        rotateEnabled: false,
        pitchEnabled: false,
      };
  return (
    <View
      style={[styles.frame, { height }]}
      pointerEvents={interactive ? "auto" : "none"}
    >
      <MapView
        ref={ref}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
        {...fixed}
        {...props}
      >
        {children}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.muted,
  },
});
