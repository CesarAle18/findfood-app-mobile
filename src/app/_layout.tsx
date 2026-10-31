/**
 * Root layout: keeps the native splash until the fonts and the session's access phase are
 * known, then lets the access phase and the account's roles decide which screens exist
 * (`Stack.Protected`): the donor segment needs DONANTE, the volunteer one VOLUNTARIO. A
 * screen whose guard is off is removed from the navigator: links and deep links to it fall
 * back to the gate (`index`), and a user on it when the guard closes is sent there too.
 */
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

import { queryClient, setupQueryManagers } from "@/api/query-client";
import { LoadingState, OfflineBanner } from "@/components/findfood/feedback";
import { configResult, type ConfigError } from "@/config/env";
import { colors } from "@/design/tokens";
// For its side effect: defines the background location task, which must exist when the OS
// launches the app headless to deliver locations.
import "@/location/tracking";
import { guardsFor, ROUTE_GROUPS, type RouteGroup } from "@/navigation/access-route";
import { STACK_SCREEN_OPTIONS } from "@/navigation/stack-options";
import { configureNotificationHandler } from "@/notifications/push";
import { useNotificationResponses } from "@/notifications/use-notification-responses";
import { ConfigErrorScreen } from "@/screens/access";
import { MobileProvider } from "@/state/mobile-context";
import { SessionProvider, useAccess } from "@/state/session";
import { SignedInEffects } from "@/state/signed-in-effects";

// At module scope: called from a component it can run after the splash is already gone.
SplashScreen.preventAutoHideAsync().catch(() => {
  // No native splash to keep (e.g. web): nothing to do.
});
setupQueryManagers();
// Before any push can arrive: how notifications show while the app is in the foreground.
configureNotificationHandler();

const FONTS = { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold };

/** Hides the native splash once `ready` (hiding it again is a no-op). */
function useHideSplash(ready: boolean) {
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);
}

function screensOf(group: RouteGroup) {
  return ROUTE_GROUPS[group].map((name) => <Stack.Screen key={name} name={name} />);
}

function RootNavigator({ fontsLoaded, fontError }: { fontsLoaded: boolean; fontError: Error | null }) {
  const { phase, canDonor, canVolunteer } = useAccess();
  const ready = (fontsLoaded || fontError !== null) && phase !== "loading";
  useHideSplash(ready);
  // A tapped push opens its screen once the routes below exist.
  useNotificationResponses(ready && fontError === null);

  // No Stack while loading, so no guard is ever open for a moment before the phase is
  // known. Under the splash at startup; a spinner when a sign-in loads the account.
  if (!ready) return <LoadingState />;
  if (fontError) {
    return (
      <View style={styles.fontError}>
        <Text>No se pudo cargar la tipografía local. Vuelve a abrir la aplicación.</Text>
      </View>
    );
  }

  const guards = guardsFor({ phase, canDonor, canVolunteer });
  return (
    <Stack screenOptions={STACK_SCREEN_OPTIONS}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={guards.auth}>{screensOf("auth")}</Stack.Protected>
      <Stack.Protected guard={guards.verifyEmail}>{screensOf("verifyEmail")}</Stack.Protected>
      <Stack.Protected guard={guards.recovery}>{screensOf("recovery")}</Stack.Protected>
      <Stack.Protected guard={guards.completeProfile}>
        {screensOf("completeProfile")}
      </Stack.Protected>
      <Stack.Protected guard={guards.changePassword}>{screensOf("changePassword")}</Stack.Protected>
      <Stack.Protected guard={guards.noAccess}>{screensOf("noAccess")}</Stack.Protected>
      <Stack.Protected guard={guards.donor}>{screensOf("donor")}</Stack.Protected>
      <Stack.Protected guard={guards.volunteer}>{screensOf("volunteer")}</Stack.Protected>
      <Stack.Protected guard={guards.app}>{screensOf("app")}</Stack.Protected>
    </Stack>
  );
}

/** Above every screen without taking touches, below the status bar. */
function OfflineOverlay() {
  return (
    <View style={styles.overlay}>
      <SafeAreaView edges={["top"]}>
        <OfflineBanner />
      </SafeAreaView>
    </View>
  );
}

function ConfigErrorRoot({ error, fontsReady }: { error: ConfigError; fontsReady: boolean }) {
  useHideSplash(fontsReady);
  if (!fontsReady) return null;
  return (
    <>
      <StatusBar style="dark" />
      <ConfigErrorScreen error={error} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONTS);

  if (!configResult.ok) {
    return <ConfigErrorRoot error={configResult.error} fontsReady={fontsLoaded || !!fontError} />;
  }

  // KeyboardProvider tracks the keyboard for the screens' keyboard-aware scroll views.
  return (
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <SignedInEffects />
          <MobileProvider>
            <StatusBar style="dark" />
            <View style={styles.root}>
              <RootNavigator fontsLoaded={fontsLoaded} fontError={fontError} />
              <OfflineOverlay />
            </View>
          </MobileProvider>
        </SessionProvider>
      </QueryClientProvider>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fontError: { flex: 1, padding: 24, justifyContent: "center" },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none" },
});
