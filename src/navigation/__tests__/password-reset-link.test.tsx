/**
 * The password reset deep link end to end through the real root layout, gate and reset
 * screen: the exchange creates a session before the new password exists, and the recovery
 * flag must keep the user on the reset screen instead of the app. Supabase and the session
 * are fakes; every other route file is a stub that prints its name.
 */
import { fireEvent, getMockContext, renderRouter, screen, type MockContextConfig } from "expo-router/testing-library";
import { Text } from "react-native";

import * as RootLayoutModule from "@/app/_layout";
import * as DonorTabsModule from "@/app/donante/(tabs)/_layout";
import * as DonorLayoutModule from "@/app/donante/_layout";
import * as GateModule from "@/app/index";
import * as ResetModule from "@/app/restablecer-contrasena";
import * as VolunteerTabsModule from "@/app/voluntario/(tabs)/_layout";
import * as VolunteerLayoutModule from "@/app/voluntario/_layout";
import type { AccessPhase } from "@/auth/access";

/** A donor's account behind the session, once there is one. */
interface FakeSession {
  present: boolean;
  recovering: boolean;
}

const mockSessionStore = {
  state: { present: false, recovering: false } as FakeSession,
  listeners: new Set<() => void>(),
  set(next: Partial<FakeSession>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  },
};

/** Like resolveAccess: the recovery wins over the session. */
function mockPhaseOf({ present, recovering }: FakeSession): AccessPhase {
  if (recovering) return "recovering";
  return present ? "app" : "auth";
}

jest.mock("@/state/session", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  const subscribe = (listener: () => void) => {
    mockSessionStore.listeners.add(listener);
    return () => {
      mockSessionStore.listeners.delete(listener);
    };
  };
  const getState = () => mockSessionStore.state;
  const actions = {
    setRecovering: (recovering: boolean) => mockSessionStore.set({ recovering }),
    cerrarSesion: async () => mockSessionStore.set({ present: false, recovering: false }),
  };
  return {
    SessionProvider: ({ children }: { children: unknown }) => children,
    useAccess: () => {
      const state = useSyncExternalStore(subscribe, getState, getState);
      const phase = mockPhaseOf(state);
      return {
        phase,
        activeRole: phase === "app" ? "DONANTE" : null,
        canDonor: state.present,
        canVolunteer: false,
        setActiveRole: () => {},
      };
    },
    useSession: () => ({ status: useSyncExternalStore(subscribe, getState, getState).present ? "present" : "none" }),
    useMe: () => ({ error: null, refetch: async () => {}, isFetching: false }),
    useSessionActions: () => actions,
  };
});

// The exchange stores the recovery session (auth-js also emits PASSWORD_RECOVERY).
const mockExchangeCodeForSession = jest.fn(async (_code: string, _options?: unknown) => {
  mockSessionStore.set({ present: true });
  return { data: { session: { access_token: "t" }, user: {} }, error: null };
});
const mockUpdateUser = jest.fn(async (_attributes: unknown) => ({ data: { user: {} }, error: null }));

jest.mock("@/auth/supabase", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string, options?: unknown) => mockExchangeCodeForSession(code, options),
      updateUser: (attributes: unknown) => mockUpdateUser(attributes),
    },
  },
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
  "restablecer-contrasena": ResetModule,
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

it("keeps a signed-out user on the reset screen through the exchange, then opens the app", async () => {
  mockSessionStore.state = { present: false, recovering: false };
  const rendered = renderRouter(appDir, {
    initialUrl: "/restablecer-contrasena?code=auth-code-1&sb_flow_id=flow-id-1234",
  });
  await rendered;

  // Session present and recovering: still here, never the donor home.
  expect(await screen.findByLabelText("Nueva contraseña")).toBeOnTheScreen();
  expect(mockExchangeCodeForSession).toHaveBeenCalledTimes(1);
  expect(mockExchangeCodeForSession).toHaveBeenCalledWith("auth-code-1", { flowId: "flow-id-1234" });
  expect(mockSessionStore.state).toEqual({ present: true, recovering: true });
  expect(rendered.getPathname()).toBe("/restablecer-contrasena");
  expect(screen.queryByText(/^route:donante/)).toBeNull();

  await fireEvent.changeText(screen.getByLabelText("Nueva contraseña"), "nueva1234");
  await fireEvent.changeText(screen.getByLabelText("Confirmar contraseña"), "nueva1234");
  await fireEvent.press(screen.getByRole("button", { name: "Guardar contraseña" }));

  expect(mockUpdateUser).toHaveBeenCalledWith({ password: "nueva1234" });
  expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
  expect(rendered.getPathname()).toBe("/donante");
});
