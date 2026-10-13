/**
 * Volunteer segment (`/voluntario`): the tabs, with the offer and pickup screens stacked
 * above them. The root layout only mounts it for accounts with the VOLUNTARIO role.
 */
import { Stack } from "expo-router";

import { STACK_SCREEN_OPTIONS } from "@/navigation/stack-options";

// A deep link to a stacked screen (`/voluntario/oferta`) keeps the tabs below it.
export const unstable_settings = { anchor: "(tabs)" };

export default function VolunteerLayout() {
  return <Stack screenOptions={STACK_SCREEN_OPTIONS} />;
}
