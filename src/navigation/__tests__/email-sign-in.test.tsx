/**
 * Email sign-in end to end through the real root layout, gate and login screen: the screen
 * never navigates after signing in; the session change closes the auth group and the
 * guards open the account's home. Supabase and the session are fakes; every route file other
 * than the layouts, the gate and login is a stub that prints its name.
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
import type { AccessPhase, MobileRole } from "@/auth/access";

interface FakeAccess {
  phase: AccessPhase;
  activeRole: MobileRole | null;
  canDonor: boolean;
  canVolunteer: boolean;
}

const SIGNED_OUT: FakeAccess = { phase: "auth", activeRole: null, canDonor: false, canVolunteer: false };
const DONOR: FakeAccess = { phase: "app", activeRole: "DONANTE", canDonor: true, canVolunteer: false };

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

// A successful sign-in: Supabase stores the session, and the session provider turns it into
// the donor's access.
const mockSignInWithPassword = jest.fn(async (_credentials: unknown) => {
  mockAccessStore.set(DONOR);
  return { data: { user: null, session: null }, error: null };
});

jest.mock("@/auth/supabase", () => ({
  // Called through a wrapper: the factory runs before `mockSignInWithPassword` is assigned.
  supabase: { auth: { signInWithPassword: (credentials: unknown) => mockSignInWithPassword(credentials) } },
  refreshAccessToken: async () => null,
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

it("lands on the donor home after signing in, without the screen navigating", async () => {
  mockAccessStore.state = SIGNED_OUT;
  const rendered = renderRouter(appDir, { initialUrl: "/" });
  await rendered;
  expect(await screen.findByText("Bienvenido")).toBeOnTheScreen();
  expect(rendered.getPathname()).toBe("/login");

  await fireEvent.changeText(screen.getByLabelText("Correo electrónico"), "ana@correo.com");
  await fireEvent.changeText(screen.getByLabelText("Contraseña"), "secreta123");
  await fireEvent.press(screen.getByRole("button", { name: "Iniciar sesión" }));

  expect(mockSignInWithPassword).toHaveBeenCalledWith({
    email: "ana@correo.com",
    password: "secreta123",
  });
  expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
  expect(rendered.getPathname()).toBe("/donante");
  expect(screen.queryByText("Bienvenido")).toBeNull();
});
