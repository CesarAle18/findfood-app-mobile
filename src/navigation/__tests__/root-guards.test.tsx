/**
 * The real root layout, gate (`index`) and no-access screen under expo-router's testing
 * library, with the session driven by a fake access state. Every other route is a stub
 * that prints its name. Lives outside `src/app`, where every file becomes a route.
 */
import { act, renderRouter, screen } from "expo-router/testing-library";
import * as SplashScreen from "expo-splash-screen";
import { Text } from "react-native";

import * as RootLayoutModule from "@/app/_layout";
import * as GateModule from "@/app/index";
import * as NoAccessModule from "@/app/sin-acceso";
import type { AccessPhase, MobileRole } from "@/auth/access";

import { ROUTE_GROUPS } from "../access-route";

interface FakeAccess {
  phase: AccessPhase;
  activeRole: MobileRole | null;
}

const mockAccessStore = {
  state: { phase: "loading", activeRole: null } as FakeAccess,
  listeners: new Set<() => void>(),
  set(next: FakeAccess) {
    this.state = next;
    for (const listener of this.listeners) listener();
  },
};

/** `useFonts` result: [loaded, error]. */
let mockFonts: [boolean, Error | null] = [true, null];

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
    useAccess: () => {
      const { phase, activeRole } = useSyncExternalStore(subscribe, getState, getState);
      return {
        phase,
        activeRole,
        canDonor: activeRole === "DONANTE",
        canVolunteer: activeRole === "VOLUNTARIO",
        setActiveRole: () => {},
      };
    },
    useMe: () => ({ error: null, refetch: async () => {}, isFetching: false }),
    useSessionActions: () => actions,
  };
});

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

const stubs = Object.fromEntries(
  Object.values(ROUTE_GROUPS)
    .flat()
    .map((name) => [name, StubRoute(name)]),
);

const appDir = {
  ...stubs,
  _layout: RootLayoutModule,
  index: GateModule,
  "sin-acceso": NoAccessModule,
};

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
});

describe("splash screen", () => {
  it("is kept up from the moment the layout module loads", () => {
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalledTimes(1);
  });

  it("stays up, with no screen rendered, while the access phase is loading", async () => {
    await renderApp({ phase: "loading", activeRole: null });

    expect(screen.queryByText(/^route:/)).toBeNull();
    expect(hide).not.toHaveBeenCalled();

    await act(async () => mockAccessStore.set({ phase: "auth", activeRole: null }));

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("stays up until the fonts are loaded", async () => {
    mockFonts = [false, null];

    await renderApp({ phase: "auth", activeRole: null });

    expect(screen.queryByText(/^route:/)).toBeNull();
    expect(hide).not.toHaveBeenCalled();
  });
});

describe("root guards", () => {
  it("sends a signed-out user to login", async () => {
    await renderApp({ phase: "auth", activeRole: null });

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
  });

  it("sends a donor to the donor home", async () => {
    await renderApp({ phase: "app", activeRole: "DONANTE" });

    expect(await screen.findByText("route:inicio-donante")).toBeOnTheScreen();
    expect(pathname()).toBe("/inicio-donante");
  });

  it("sends a volunteer to the volunteer home", async () => {
    await renderApp({ phase: "app", activeRole: "VOLUNTARIO" });

    expect(await screen.findByText("route:inicio")).toBeOnTheScreen();
    expect(pathname()).toBe("/inicio");
  });

  it("drops a cold deep link to an app screen when signed out", async () => {
    await renderApp({ phase: "auth", activeRole: null }, "/inicio-donante");

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
    expect(screen.queryByText("route:inicio-donante")).toBeNull();
  });

  it("opens a deep-linked app screen when the user has access", async () => {
    await renderApp({ phase: "app", activeRole: "DONANTE" }, "/mis-donaciones");

    expect(await screen.findByText("route:mis-donaciones")).toBeOnTheScreen();
    expect(pathname()).toBe("/mis-donaciones");
  });

  it("sends an account without a mobile role to the no-access screen", async () => {
    await renderApp({ phase: "no-mobile-role", activeRole: null });

    expect(await screen.findByText("Tu cuenta no tiene acceso a la app")).toBeOnTheScreen();
    expect(pathname()).toBe("/sin-acceso");
  });

  it("sends a user who still has to verify the email to the verification screen", async () => {
    await renderApp({ phase: "verify-email", activeRole: null }, "/login");

    expect(await screen.findByText("route:verificar-correo")).toBeOnTheScreen();
    expect(pathname()).toBe("/verificar-correo");
  });

  it("leaves an app screen when the session ends", async () => {
    await renderApp({ phase: "app", activeRole: "DONANTE" });
    await screen.findByText("route:inicio-donante");

    await act(async () => mockAccessStore.set({ phase: "auth", activeRole: null }));

    expect(await screen.findByText("route:login")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
  });

  it("shows a spinner while a sign-in loads the account, then opens the app", async () => {
    await renderApp({ phase: "auth", activeRole: null });
    await screen.findByText("route:login");

    await act(async () => mockAccessStore.set({ phase: "loading", activeRole: null }));

    expect(screen.queryByText(/^route:/)).toBeNull();
    expect(screen.getByRole("progressbar")).toBeOnTheScreen();

    await act(async () => mockAccessStore.set({ phase: "app", activeRole: "DONANTE" }));

    expect(await screen.findByText("route:inicio-donante")).toBeOnTheScreen();
    expect(pathname()).toBe("/inicio-donante");
  });

  it("leaves login once the user signs in", async () => {
    await renderApp({ phase: "auth", activeRole: null });
    await screen.findByText("route:login");

    await act(async () => mockAccessStore.set({ phase: "app", activeRole: "VOLUNTARIO" }));

    expect(await screen.findByText("route:inicio")).toBeOnTheScreen();
    expect(pathname()).toBe("/inicio");
  });
});
