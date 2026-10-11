/**
 * Screens shown instead of the app while the account cannot use it: the access gate
 * (`index`), the no-access screen and the configuration error.
 */
import { Redirect } from "expo-router";
import { useState, type PropsWithChildren } from "react";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { messageFor } from "@/api/problem-messages";
import { EmptyState, ErrorState, LoadingState } from "@/components/findfood/feedback";
import { Button, Copy } from "@/components/findfood/ui";
import type { ConfigError } from "@/config/env";
import { colors } from "@/design/tokens";
import { routeForAccess } from "@/navigation/access-route";
import { useAccess, useMe, useSessionActions } from "@/state/session";

/** Branded full-screen frame without the app header (its account menu needs access). */
function StatusFrame({ children }: PropsWithChildren) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <Image
            source={require("../../assets/brand/findfood-logo.png")}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="Logotipo de Find Food"
          />
          <Copy weight="semibold" style={styles.brandName}>
            Find Food
          </Copy>
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Signs out, showing the button as busy meanwhile. */
function useSignOut() {
  const { cerrarSesion } = useSessionActions();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = () => {
    setSigningOut(true);
    // cerrarSesion never rejects.
    void cerrarSesion().finally(() => setSigningOut(false));
  };
  return { signOut, signingOut };
}

/** Also on the account steps (complete profile, change password): the way out of them. */
export function SignOutButton({ variant = "primary" }: { variant?: "primary" | "outline" }) {
  const { signOut, signingOut } = useSignOut();
  return (
    <Button variant={variant} onPress={signOut} loading={signingOut}>
      Cerrar sesión
    </Button>
  );
}

function StartupError() {
  const { error, refetch, isFetching } = useMe();
  const { signOut } = useSignOut();
  return (
    <StatusFrame>
      <ErrorState
        error={error}
        title="No pudimos cargar tu cuenta"
        onRetry={() => void refetch()}
        retrying={isFetching}
        secondaryAction={{ label: "Cerrar sesión", onPress: signOut }}
      />
    </StatusFrame>
  );
}

/**
 * The first screen (`index`): redirects to the screen of the access phase, or renders the
 * phases that have no screen of their own.
 */
export function AccessGateScreen() {
  const { phase, activeRole } = useAccess();
  const route = routeForAccess(phase, activeRole);
  if (route) return <Redirect href={route} />;
  // `loading` (the root layout keeps the splash meanwhile), or the unreachable app phase
  // without a mobile role.
  return phase === "error" ? <StartupError /> : <LoadingState />;
}

/** `sin-acceso`: an account without a mobile role, or one the API blocks. */
export function NoAccessScreen() {
  const { phase } = useAccess();
  const { error } = useMe();
  const blocked = phase === "account-blocked";
  return (
    <StatusFrame>
      <EmptyState
        icon="user"
        title={blocked ? "No puedes ingresar con esta cuenta" : "Tu cuenta no tiene acceso a la app"}
        description={
          blocked
            ? messageFor(error)
            : "La app móvil de Find Food es para donantes y voluntarios, y tu cuenta no tiene ninguno de estos roles. Si crees que es un error, comunícate con soporte."
        }
        action={<SignOutButton />}
      />
    </StatusFrame>
  );
}

/**
 * Shown by the root layout when the build configuration is invalid. Details are for
 * developers only; release builds show a neutral message.
 */
export function ConfigErrorScreen({
  error,
  showDetails = __DEV__,
}: {
  error: ConfigError;
  showDetails?: boolean;
}) {
  return (
    <StatusFrame>
      <View accessible accessibilityRole="alert" style={styles.configText}>
        <Copy weight="semibold" style={styles.configTitle}>
          No pudimos iniciar la aplicación
        </Copy>
        <Copy tone="secondary" style={styles.configDescription}>
          {showDetails
            ? "La configuración de la aplicación no es válida:"
            : "La aplicación no está configurada correctamente. Instala la versión más reciente o inténtalo más tarde."}
        </Copy>
      </View>
      {showDetails ? (
        <View style={styles.problems}>
          {error.problems.map((problem) => (
            <Copy key={problem} style={styles.problem}>
              {`• ${problem}`}
            </Copy>
          ))}
          <Copy tone="secondary" style={styles.problem}>
            Copia .env.example en .env.local para el perfil real, o ejecuta npm run start:local
            para la API local, y reinicia el servidor de desarrollo.
          </Copy>
        </View>
      ) : null}
    </StatusFrame>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  content: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 48 },
  logo: { width: 33, height: 33 },
  brandName: { fontSize: 14 },
  configText: { gap: 6, paddingTop: 32 },
  configTitle: { fontSize: 15, lineHeight: 21 },
  configDescription: { fontSize: 12, lineHeight: 18 },
  problems: { gap: 8 },
  problem: { fontSize: 12, lineHeight: 18 },
});
