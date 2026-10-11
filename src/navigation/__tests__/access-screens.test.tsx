/**
 * The screens the access gate shows instead of the app: the gate's own states (startup
 * error, pending account steps), the no-access screen and the configuration error.
 */
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import type { AccessPhase } from "@/auth/access";
import { ConfigError } from "@/config/env";
import { AccessGateScreen, ConfigErrorScreen, NoAccessScreen } from "@/screens/access";

const mockSession = {
  phase: "error" as AccessPhase,
  me: { error: null as unknown, refetch: jest.fn(async () => {}), isFetching: false },
  cerrarSesion: jest.fn(async () => {}),
};

jest.mock("@/state/session", () => ({
  useAccess: () => ({
    phase: mockSession.phase,
    activeRole: null,
    canDonor: false,
    canVolunteer: false,
    setActiveRole: () => {},
  }),
  useMe: () => mockSession.me,
  useSessionActions: () => ({
    cerrarSesion: mockSession.cerrarSesion,
    setRecovering: () => {},
  }),
}));

function withPhase(phase: AccessPhase, meError: unknown = null) {
  mockSession.phase = phase;
  mockSession.me = { ...mockSession.me, error: meError };
}

beforeEach(() => {
  mockSession.me.refetch.mockClear();
  mockSession.cerrarSesion.mockClear();
});

async function pressSignOut() {
  await fireEvent.press(screen.getByRole("button", { name: "Cerrar sesión" }));
}

describe("AccessGateScreen", () => {
  it("explains a failed account load, retries it and offers to sign out", async () => {
    const error = ApiError.network(new TypeError("Network request failed"));
    withPhase("error", error);

    await render(<AccessGateScreen />);

    expect(screen.getByText("No pudimos cargar tu cuenta")).toBeOnTheScreen();
    expect(screen.getByText(messageFor(error))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockSession.me.refetch).toHaveBeenCalledTimes(1);
    await pressSignOut();
    expect(mockSession.cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it("waits with a spinner while the phase is loading", async () => {
    withPhase("loading");

    await render(<AccessGateScreen />);

    expect(screen.getByRole("progressbar")).toBeOnTheScreen();
  });
});

describe("NoAccessScreen", () => {
  it("explains that the account has no mobile role", async () => {
    withPhase("no-mobile-role");

    await render(<NoAccessScreen />);

    expect(screen.getByText("Tu cuenta no tiene acceso a la app")).toBeOnTheScreen();
    expect(screen.getByText(/donantes y voluntarios/)).toBeOnTheScreen();
    await pressSignOut();
    expect(mockSession.cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it.each(["cuenta-suspendida", "cuenta-inactiva", "cuenta-inexistente"])(
    "explains a blocked account (%s) with the API's reason",
    async (type) => {
      const error = new ApiError({ type, status: 403, title: "Forbidden" });
      withPhase("account-blocked", error);

      await render(<NoAccessScreen />);

      expect(screen.getByText("No puedes ingresar con esta cuenta")).toBeOnTheScreen();
      expect(screen.getByText(messageFor(error))).toBeOnTheScreen();
      await pressSignOut();
      expect(mockSession.cerrarSesion).toHaveBeenCalledTimes(1);
    },
  );

  it("shows the sign-out as busy until it finishes", async () => {
    withPhase("no-mobile-role");
    let finish: () => void = () => {};
    mockSession.cerrarSesion.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await render(<NoAccessScreen />);

    await pressSignOut();

    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeBusy();
    await act(async () => finish());
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).not.toBeBusy();
  });
});

describe("ConfigErrorScreen", () => {
  const error = new ConfigError([
    "EXPO_PUBLIC_SUPABASE_URL is missing (required by the real profile).",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY is missing (required by the real profile).",
  ]);

  it("lists every problem in development", async () => {
    await render(<ConfigErrorScreen error={error} showDetails />);

    expect(screen.getByText("No pudimos iniciar la aplicación")).toBeOnTheScreen();
    for (const problem of error.problems) {
      expect(screen.getByText(problem, { exact: false })).toBeOnTheScreen();
    }
  });

  it("shows a neutral message without details in release builds", async () => {
    await render(<ConfigErrorScreen error={error} showDetails={false} />);

    expect(screen.getByText("No pudimos iniciar la aplicación")).toBeOnTheScreen();
    expect(screen.queryByText(/EXPO_PUBLIC_/)).toBeNull();
  });
});
