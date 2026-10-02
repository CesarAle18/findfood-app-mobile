import { colors } from "@/design/tokens";
import { MobileProvider } from "@/state/mobile-context";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Text, View } from "react-native";

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
          // Fundido corto: lo ejecuta react-native-screens en el hilo nativo.
          // "push" es necesario porque la barra inferior navega con replace y el
          // valor por omisión animaría la transición hacia atrás.
          animation: "fade",
          animationDuration: 200,
          animationTypeForReplace: "push",
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </MobileProvider>
  );
}
