/**
 * Donor segment (`/donante`): the tabs, with the donation flow screens stacked above them.
 * The root layout only mounts it for accounts with the DONANTE role.
 */
import { Stack } from "expo-router";

import { STACK_SCREEN_OPTIONS } from "@/navigation/stack-options";

// A deep link to a stacked screen (`/donante/detalle-donacion`) keeps the tabs below it.
export const unstable_settings = { anchor: "(tabs)" };

export default function DonorLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
