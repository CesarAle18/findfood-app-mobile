import type { NativeStackNavigationOptions } from "expo-router";

import { colors } from "@/design/tokens";

/** Screen options shared by the root Stack and the role segment Stacks. */
export const STACK_SCREEN_OPTIONS: NativeStackNavigationOptions = {
  headerShown: false,
  // Short fade, run by react-native-screens on the native thread.
  animation: "fade",
  animationDuration: 200,
  // The gate and the account menu navigate with replace; the default would animate it as
  // going back.
  animationTypeForReplace: "push",
  contentStyle: { backgroundColor: colors.background },
};
