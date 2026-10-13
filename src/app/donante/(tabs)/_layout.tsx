import { NativeTabs } from "expo-router/unstable-native-tabs";

import { TAB_BAR_PROPS, useUnreadBadge } from "@/navigation/tab-bar";

/** Donor tab bar. Tabs are static: native tabs cannot add or remove them at runtime. */
export default function DonorTabsLayout() {
  const unread = useUnreadBadge();
  return (
    <NativeTabs {...TAB_BAR_PROPS}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="donaciones">
        <NativeTabs.Trigger.Label>Donaciones</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "shippingbox", selected: "shippingbox.fill" }}
          md="volunteer_activism"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="alertas">
        <NativeTabs.Trigger.Label>Alertas</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "bell", selected: "bell.fill" }} md="notifications" />
        <NativeTabs.Trigger.Badge hidden={unread === undefined}>{unread}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="perfil">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "person", selected: "person.fill" }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
