import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, fonts } from "@/design/tokens";

/**
 * Stands in for a map that cannot load (web, or a build without a Maps key). Keeps the
 * map's size, test id and label; bottom-aligned because the location picker draws its pin in
 * the middle.
 */
export function MapPlaceholder({
  message,
  testID,
  accessibilityLabel,
  style,
}: {
  message: string;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={[style, styles.placeholder]}
    >
      <Text style={styles.label}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { justifyContent: "flex-end", alignItems: "center", padding: 12 },
  label: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 13, textAlign: "center" },
});
