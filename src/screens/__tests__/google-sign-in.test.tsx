/**
 * Google sign-in of a new account through the real root layout, gate and login screen. A new
 * Google account has no phone or last names: `/me` lists TELEFONO (and the terms) as pending
 * and the guards open the profile completion, with no Google-specific navigation. The Google
 * flow, the session and `/me` are fakes; the access phase comes from the real resolveAccess.
 * Every route file other than the layouts, the gate and login is a stub that prints its name.
 */
import { fireEvent, getMockContext, renderRouter, screen, type MockContextConfig } from "expo-router/testing-library";
import { Text } from "react-native";

import * as RootLayoutModule from "@/app/_layout";
import * as DonorTabsModule from "@/app/donante/(tabs)/_layout";
import * as DonorLayoutModule from "@/app/donante/_layout";
import * as GateModule from "@/app/index";
import * as LoginModule from "@/app/login";
import * as VolunteerTabsModule from "@/app/voluntario/(tabs)/_layout";
import * as VolunteerLayoutModule from "@/app/voluntario/_layout";
import { resolveAccess, type Access } from "@/auth/access";
import { meFixture } from "@/test-utils/fixtures";

type FakeAccess = Access & { activeRole: null };

const SIGNED_OUT: FakeAccess = { phase: "auth", activeRole: null, canDonor: false, canVolunteer: false };

const mockAccessStore = {
  state: SIGNED_OUT,
  listeners: new Set<() => void>(),
  set(next: FakeAccess) {
    this.state = next;
    for (const listener of this.listeners) listener();
  },
};

jest.mock("@/state/session", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  const subscribe = (listener: () => void) => {
    mockAccessStore.listeners.add(listener);
    return () => {
      mockAccessStore.listeners.delete(listener);
    };
  };
  const getState = () => mockAccessStore.state;
  return {
    SessionProvider: ({ children }: { children: unknown }) => children,
    useAccess: () => ({ ...useSyncExternalStore(subscribe, getState, getState), setActiveRole: () => {} }),
    useMe: () => ({ error: null, refetch: async () => {}, isFetching: false }),
    useSessionActions: () => ({ cerrarSesion: async () => {}, setRecovering: () => {} }),
  };
});

/** `/me` of an account the Supabase trigger just created from a Google sign-in. */
const NEW_GOOGLE_ACCOUNT = meFixture({
  nombres: "Ana",
  apellidos: null,
  telefono: null,
  pendientes: ["TELEFONO", "ACEPTAR_TERMINOS"],
});

// A successful Google sign-in: Supabase stores the session and the provider loads /me.
const mockSignInWithGoogle = jest.fn(async () => {
  const access = resolveAccess({
    sessionStatus: "present",
    recovering: false,
    me: NEW_GOOGLE_ACCOUNT,
    meStatus: "success",
  });
  mockAccessStore.set({ ...access, activeRole: null });
  return { cancelled: false };
});

jest.mock("@/auth/google-auth", () => ({
  isGoogleSignInAvailable: () => true,
  signInWithGoogle: () => mockSignInWithGoogle(),
}));

jest.mock("@/auth/supabase", () => ({
  supabase: { auth: {} },
  refreshAccessToken: async () => null,
  trackSignIn: <T,>(request: Promise<T>) => request,
}));

jest.mock("@/services/notificaciones", () => ({
  useNotificacionesNoLeidas: () => ({ data: 0 }),
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

type MemoryContext = Exclude<MockContextConfig, string | string[] | { appDir: string }>;

const REAL_MODULES: MemoryContext = {
  _layout: RootLayoutModule,
  index: GateModule,
  login: LoginModule,
  "donante/_layout": DonorLayoutModule,
  "donante/(tabs)/_layout": DonorTabsModule,
  "voluntario/_layout": VolunteerLayoutModule,
  "voluntario/(tabs)/_layout": VolunteerTabsModule,
};

const appDir: MemoryContext = Object.fromEntries(
  getMockContext("./src/app")
    .keys()
    .map((key) => key.replace(/^\.\//, "").replace(/\.[tj]sx?$/, ""))
    .map((name): [string, MemoryContext[string]] => {
      if (name in REAL_MODULES) return [name, REAL_MODULES[name]];
      if (/(^|\/)_layout$/.test(name)) throw new Error(`Add the layout ${name} to REAL_MODULES`);
      return [name, () => <Text>{`route:${name}`}</Text>];
    }),
);

it("opens the profile completion after a new Google account signs in", async () => {
  mockAccessStore.state = SIGNED_OUT;
  const rendered = renderRouter(appDir, { initialUrl: "/" });
  await rendered;
  expect(await screen.findByText("Bienvenido")).toBeOnTheScreen();
  expect(rendered.getPathname()).toBe("/login");

  await fireEvent.press(screen.getByRole("button", { name: "Continuar con Google" }));

  expect(mockSignInWithGoogle).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("route:completar-perfil")).toBeOnTheScreen();
  expect(rendered.getPathname()).toBe("/completar-perfil");
  expect(screen.queryByText("Bienvenido")).toBeNull();
});
