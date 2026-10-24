import type { Ref } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { hasGoogleMapsKey } from "@/config/maps";
import { colors } from "@/design/tokens";

import { MapPlaceholder } from "./map-placeholder";
import { MapView, PROVIDER_GOOGLE, type MapViewProps } from "./maps";

export type FindFoodMapProps = Omit<
  MapViewProps,
  "provider" | "style" | "userInterfaceStyle"
> & {
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
 * list item. Needs the Google Maps keys of the `react-native-maps` config plugin on device:
 * a build without the key of its platform shows a placeholder, since the SDK would abort the
 * app. The map's ref then stays null.
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
  if (Platform.OS !== "web" && !hasGoogleMapsKey()) {
    return (
      <View style={[styles.frame, { height }]}>
        <MapPlaceholder
          message="El mapa no está disponible en esta versión de la app."
          testID={props.testID}
          accessibilityLabel={props.accessibilityLabel}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  }
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
        // The app has no dark theme: without this the map follows the phone's dark mode.
        userInterfaceStyle="light"
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
