/**
 * The real root layout, gate (`index`), no-access screen and role segment layouts under
 * expo-router's testing library, with the session driven by a fake access state. Every
 * other route file of `src/app` is a stub that prints its name. Lives outside `src/app`,
 * where every file becomes a route.
 */
import {
  act,
  fireEvent,
  getMockContext,
  renderRouter,
  screen,
  type MockContextConfig,
} from "expo-router/testing-library";
import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Text } from "react-native";

import * as RootLayoutModule from "@/app/_layout";
import * as AccountModule from "@/app/cuenta";
import * as DonorTabsModule from "@/app/donante/(tabs)/_layout";
import * as DonorLayoutModule from "@/app/donante/_layout";
import * as GateModule from "@/app/index";
import * as NoAccessModule from "@/app/sin-acceso";
import * as VolunteerTabsModule from "@/app/voluntario/(tabs)/_layout";
import * as VolunteerLayoutModule from "@/app/voluntario/_layout";
import type { AccessPhase, MobileRole } from "@/auth/access";

interface FakeAccess {
  phase: AccessPhase;
  activeRole: MobileRole | null;
  canDonor: boolean;
  canVolunteer: boolean;
}

const LOADING: FakeAccess = { phase: "loading", activeRole: null, canDonor: false, canVolunteer: false };
const SIGNED_OUT: FakeAccess = { ...LOADING, phase: "auth" };
const DONOR: FakeAccess = { phase: "app", activeRole: "DONANTE", canDonor: true, canVolunteer: false };
const VOLUNTEER: FakeAccess = {
  phase: "app",
  activeRole: "VOLUNTARIO",
  canDonor: false,
  canVolunteer: true,
};
const BOTH_AS_DONOR: FakeAccess = { ...DONOR, canVolunteer: true };

const mockAccessStore = {
  state: LOADING,
  listeners: new Set<() => void>(),
  set(next: FakeAccess) {
    this.state = next;
    for (const listener of this.listeners) listener();
  },
};

/** `useFonts` result: [loaded, error]. */
let mockFonts: [boolean, Error | null] = [true, null];

const mockSetActiveRole = jest.fn();

jest.mock("@/state/session", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  const subscribe = (listener: () => void) => {
    mockAccessStore.listeners.add(listener);
    return () => {
      mockAccessStore.listeners.delete(listener);
    };
  };
  const getState = () => mockAccessStore.state;
  const actions = { cerrarSesion: async () => {}, setRecovering: () => {} };
  return {
    SessionProvider: ({ children }: { children: unknown }) => children,
    useAccess: () => ({
      ...useSyncExternalStore(subscribe, getState, getState),
      setActiveRole: mockSetActiveRole,
    }),
    useMe: () => ({ error: null, refetch: async () => {}, isFetching: false }),
    useSessionActions: () => actions,
  };
});

// The tab bars read the unread count; the API is not under test here.
jest.mock("@/services/notificaciones", () => ({
  useNotificacionesNoLeidas: () => ({ data: 0 }),
}));

jest.mock("@expo-google-fonts/inter", () => ({
  useFonts: () => mockFonts,
  Inter_400Regular: 1,
  Inter_500Medium: 2,
  Inter_600SemiBold: 3,
  Inter_700Bold: 4,
}));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hide: jest.fn(),
}));

// The root layout wires TanStack's online manager to expo-network at import.
jest.mock("expo-network", () => ({
  addNetworkStateListener: () => ({ remove: () => {} }),
  getNetworkStateAsync: () => new Promise(() => {}),
}));

function StubRoute(name: string) {
  return function Route() {
    return <Text>{`route:${name}`}</Text>;
  };
}

/** In-memory route files for `renderRouter`, keyed by path (`donante/(tabs)/index`). */
type MemoryContext = Exclude<MockContextConfig, string | string[] | { appDir: string }>;

/** The real modules; every other route file is a stub. */
const REAL_MODULES: MemoryContext = {
  _layout: RootLayoutModule,
  index: GateModule,
  "sin-acceso": NoAccessModule,
  cuenta: AccountModule,
  "donante/_layout": DonorLayoutModule,
  "donante/(tabs)/_layout": DonorTabsModule,
  "voluntario/_layout": VolunteerLayoutModule,
  "voluntario/(tabs)/_layout": VolunteerTabsModule,
};

/** The same route tree as `src/app` (`donante/(tabs)/index`, `login`...). */
const appDir: MemoryContext = Object.fromEntries(
  getMockContext("./src/app")
    .keys()
    .map((key) => key.replace(/^\.\//, "").replace(/\.[tj]sx?$/, ""))
    .map((name): [string, MemoryContext[string]] => {
      if (name in REAL_MODULES) return [name, REAL_MODULES[name]];
      if (/(^|\/)_layout$/.test(name)) throw new Error(`Add the layout ${name} to REAL_MODULES`);
      return [name, StubRoute(name)];
    }),
);

let rendered: ReturnType<typeof renderRouter> | undefined;

async function renderApp(access: FakeAccess, initialUrl = "/") {
  mockAccessStore.state = access;
  rendered = renderRouter(appDir, { initialUrl });
  await rendered;
}

/**
 * The current pathname. With RNTL 14 `render` is async, so `renderRouter` attaches its
 * route getters to the returned promise rather than to `screen`, and
 * `expect(screen).toHavePathname()` cannot read them (expo-router 57.0.21).
 */
function pathname(): string {
  if (!rendered) throw new Error("renderApp first");
  return rendered.getPathname();
}

const hide = jest.mocked(SplashScreen.hide);

beforeEach(() => {
  mockFonts = [true, null];
  hide.mockClear();
  mockSetActiveRole.mockClear();
});

describe("splash screen", () => {
  it("is kept up from the moment the layout module loads", () => {
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
  });

  it("stays up, with no screen rendered, while the access phase is loading", async () => {
    await renderApp(LOADING);

    expect(screen.queryByText(/^route:/)).toBeNull();
    expect(hide).not.toHaveBeenCalled();

    await act(async () => mockAccessStore.set(SIGNED_OUT));

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("stays up until the fonts are loaded", async () => {
    mockFonts = [false, null];

    await renderApp(SIGNED_OUT);

    expect(screen.queryByText(/^route:/)).toBeNull();
    expect(hide).not.toHaveBeenCalled();
  });
});

describe("root guards", () => {
  it("sends a signed-out user to login", async () => {
    await renderApp(SIGNED_OUT);

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
  });

  it("sends a donor to the donor home", async () => {
    await renderApp(DONOR);

    expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante");
  });

  it("sends a volunteer to the volunteer home", async () => {
    await renderApp(VOLUNTEER);

    expect(await screen.findByText("route:voluntario/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/voluntario");
  });

  it("drops a cold deep link to an app screen when signed out", async () => {
    await renderApp(SIGNED_OUT, "/donante/donaciones");

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
    expect(screen.queryByText(/^route:donante/)).toBeNull();
  });

  it("drops a cold deep link to the account menu when signed out", async () => {
    await renderApp(SIGNED_OUT, "/cuenta");

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
  });

  it("opens a deep-linked donor tab when the user is a donor", async () => {
    await renderApp(DONOR, "/donante/donaciones");

    expect(await screen.findByText("route:donante/(tabs)/donaciones")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante/donaciones");
  });

  it("opens a deep-linked donor screen above the donor tabs", async () => {
    await renderApp(DONOR, "/donante/detalle-donacion?id=DON-1058");

    expect(await screen.findByText("route:donante/detalle-donacion")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante/detalle-donacion");

    // The segment's anchor puts the tabs below a deep-linked screen.
    expect(router.canGoBack()).toBe(true);
    await act(async () => router.back());

    expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante");
  });

  it("sends an account without a mobile role to the no-access screen", async () => {
    await renderApp({ ...LOADING, phase: "no-mobile-role" });

    expect(await screen.findByText("Tu cuenta no tiene acceso a la app")).toBeOnTheScreen();
    expect(pathname()).toBe("/sin-acceso");
  });

  it("sends a user who still has to verify the email to the verification screen", async () => {
    await renderApp({ ...LOADING, phase: "verify-email" }, "/login");

    expect(await screen.findByText("route:verificar-correo")).toBeOnTheScreen();
    expect(pathname()).toBe("/verificar-correo");
  });

  it("leaves an app screen when the session ends", async () => {
    await renderApp(DONOR, "/donante/seguimiento");
    await screen.findByText("route:donante/seguimiento");

    await act(async () => mockAccessStore.set(SIGNED_OUT));

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
  });

  it("shows a spinner while a sign-in loads the account, then opens the app", async () => {
    await renderApp(SIGNED_OUT);
    await screen.findByText("route:login");

    await act(async () => mockAccessStore.set(LOADING));

    expect(screen.queryByText(/^route:/)).toBeNull();
    expect(screen.getByRole("progressbar")).toBeOnTheScreen();

    await act(async () => mockAccessStore.set(DONOR));

    expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante");
  });

  it("leaves login once the user signs in", async () => {
    await renderApp(SIGNED_OUT);
    await screen.findByText("route:login");

    await act(async () => mockAccessStore.set(VOLUNTEER));

    expect(await screen.findByText("route:voluntario/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/voluntario");
  });
});

describe("role guards", () => {
  it("drops a cold deep link to the volunteer home for a donor", async () => {
    await renderApp(DONOR, "/voluntario");

    expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante");
    expect(screen.queryByText(/^route:voluntario/)).toBeNull();
  });

  it("drops a cold deep link to a volunteer screen for a donor", async () => {
    await renderApp(DONOR, "/voluntario/oferta");

    expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante");
    expect(screen.queryByText(/^route:voluntario/)).toBeNull();
  });

  it("drops a cold deep link to a donor tab for a volunteer", async () => {
    await renderApp(VOLUNTEER, "/donante/donaciones");

    expect(await screen.findByText("route:voluntario/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/voluntario");
    expect(screen.queryByText(/^route:donante/)).toBeNull();
  });

  it.each([
    ["/donante/donaciones", "donante/(tabs)/donaciones"],
    ["/voluntario/oferta", "voluntario/oferta"],
    ["/voluntario/rutas", "voluntario/(tabs)/rutas"],
  ])("opens %s for an account with both roles", async (url, file) => {
    await renderApp(BOTH_AS_DONOR, url);

    expect(await screen.findByText(`route:${file}`)).toBeOnTheScreen();
    expect(pathname()).toBe(url);
  });

  it("switches the view from the account menu, leaving the other role behind", async () => {
    await renderApp(BOTH_AS_DONOR);
    await screen.findByText("route:donante/(tabs)/index");
    await act(async () => router.push("/cuenta"));

    await fireEvent.press(await screen.findByText("Ver como voluntario"));

    expect(mockSetActiveRole).toHaveBeenCalledWith("VOLUNTARIO");
    expect(await screen.findByText("route:voluntario/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/voluntario");
    expect(router.canGoBack()).toBe(false);
  });

  it("only offers the views of the account's roles", async () => {
    await renderApp(DONOR, "/cuenta");

    expect(await screen.findByText("Ver como donante")).toBeOnTheScreen();
    expect(screen.queryByText("Ver como voluntario")).toBeNull();
  });

  it("closes the volunteer segment when the account loses the role", async () => {
    await renderApp(BOTH_AS_DONOR, "/voluntario/oferta");
    await screen.findByText("route:voluntario/oferta");

    await act(async () => mockAccessStore.set(DONOR));

    expect(await screen.findByText("route:donante/(tabs)/index")).toBeOnTheScreen();
    expect(pathname()).toBe("/donante");
  });
});
