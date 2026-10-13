/**
 * The root layout with an invalid build configuration: it shows the configuration error
 * instead of crashing, hides the splash and never starts the session.
 */
import { render, screen } from "@testing-library/react-native";
import * as SplashScreen from "expo-splash-screen";

import RootLayout from "@/app/_layout";
import { SessionProvider } from "@/state/session";

jest.mock("@/config/env", () => {
  const { ConfigError } = jest.requireActual<typeof import("@/config/env")>("@/config/env");
  const env = { appEnv: "real", apiUrl: "http://config-error.invalid" };
  return {
    ConfigError,
    env,
    configResult: {
      ok: false,
      error: new ConfigError(["EXPO_PUBLIC_API_URL is missing."]),
    },
  };
});

jest.mock("@/state/session", () => ({
  SessionProvider: jest.fn(() => null),
  useAccess: () => {
    throw new Error("The session must not start with an invalid configuration");
  },
}));

jest.mock("@expo-google-fonts/inter", () => ({
  useFonts: () => [true, null],
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hide: jest.fn(),
}));

jest.mock("expo-network", () => ({
  addNetworkStateListener: () => ({ remove: () => {} }),
  getNetworkStateAsync: () => new Promise(() => {}),
}));

it("shows the configuration error instead of the app", async () => {
  await render(<RootLayout />);

  expect(screen.getByText("No pudimos iniciar la aplicación")).toBeOnTheScreen();
  expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  expect(SessionProvider).not.toHaveBeenCalled();
});
