/**
 * Web stand-in for `./maps`: react-native-maps has no web implementation, and importing it
 * breaks the page render. The map becomes a labelled placeholder that keeps its size, and
 * markers and paths render nothing. A ref to it stays null, so the callers' optional
 * `mapRef.current?.…` calls do nothing.
 */
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import { MapPlaceholder } from "./map-placeholder";

export const PROVIDER_GOOGLE = "google";

export function MapView({
  testID,
  accessibilityLabel,
  style,
}: {
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <MapPlaceholder
      message="El mapa está disponible en la app móvil."
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
}

export function Marker(_props: { children?: ReactNode }) {
  return null;
}

export function Polyline(_props: object) {
  return null;
}
