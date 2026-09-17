import { MobileProvider } from "@/state/mobile-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { ActivityIndicator, Text, View } from "react-native";
import { colors } from "@/design/tokens";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!loaded && !error)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel="Cargando tipografía"
        />
      </View>
    );
  if (error)
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text>
          No se pudo cargar la tipografía local. Vuelve a abrir la aplicación.
        </Text>
      </View>
    );
  return (
    <MobileProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </MobileProvider>
  );
}
