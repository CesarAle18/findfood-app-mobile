/**
 * Password recovery, password change and profile completion against a fake Supabase client,
 * a fake API and a fake session. Each screen is mounted under expo-router's testing library
 * with the routes it links to, so the tests can follow the navigation.
 */
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { router, Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

import { ApiError } from "@/api/errors";
import { messageFor } from "@/api/problem-messages";
import type { MeDto } from "@/api/types";
import type { AccessPhase } from "@/auth/access";
import { ForgotPasswordScreen } from "@/screens/auth";
import { ChangePasswordScreen, ResetPasswordScreen } from "@/screens/password";
import { CompleteProfileScreen } from "@/screens/profile-setup";
import { queryKeys } from "@/services/query-keys";
import { meFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

// --- Fake session ------------------------------------------------------------------------

interface FakeSession {
  phase: AccessPhase;
  status: "none" | "present";
}

const mockSession = {
  state: { phase: "auth", status: "none" } as FakeSession,
  me: undefined as MeDto | undefined,
  listeners: new Set<() => void>(),
  set(next: Partial<FakeSession>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  },
};

const mockSetRecovering = jest.fn(async (recovering: boolean) => {
  // Like resolveAccess: `recovering` wins; without it the session decides.
  mockSession.set({
    phase: recovering ? "recovering" : mockSession.state.status === "present" ? "app" : "auth",
  });
});
const mockCerrarSesion = jest.fn(async () => {
  mockSession.set({ phase: "auth", status: "none" });
});

jest.mock("@/state/session", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react");
  const subscribe = (listener: () => void) => {
    mockSession.listeners.add(listener);
    return () => {
      mockSession.listeners.delete(listener);
    };
  };
  const getState = () => mockSession.state;
  const useState = () => useSyncExternalStore(subscribe, getState, getState);
  return {
    useAccess: () => ({
      phase: useState().phase,
      activeRole: null,
      canDonor: true,
      canVolunteer: false,
      setActiveRole: () => {},
    }),
    useSession: () => ({ status: useState().status }),
    useMe: () => ({
      data: mockSession.me,
      error: null,
      isFetching: false,
      refetch: async () => {},
      status: mockSession.me ? "success" : "pending",
    }),
    useSessionActions: () => ({ setRecovering: mockSetRecovering, cerrarSesion: mockCerrarSesion }),
  };
});

// --- Fake Supabase and API ---------------------------------------------------------------

const mockAuth = {
  resetPasswordForEmail: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  updateUser: jest.fn(),
};
let mockClient: { auth: typeof mockAuth } | null = { auth: mockAuth };

jest.mock("@/auth/supabase", () => ({
  get supabase() {
    return mockClient;
  },
  refreshAccessToken: async () => null,
}));

jest.mock("expo-linking", () => ({
  ...jest.requireActual("expo-linking"),
  createURL: (path: string) => `findfoodappmobile://${path.replace(/^\//, "")}`,
}));

const mockPatch = jest.fn();

jest.mock("@/api", () => ({
  api: { patch: (...args: unknown[]) => mockPatch(...args) },
}));

const ok = { data: {}, error: null };
const authError = (code: string, status = 400) => ({
  data: { user: null, session: null },
  error: new AuthApiError(`English message for ${code}`, status, code),
});

// --- Rendering ---------------------------------------------------------------------------

let rendered: ReturnType<typeof renderRouter> | undefined;
let client: QueryClient;

async function renderAt(initialUrl: string) {
  client = createTestQueryClient();
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <Slot />
      </QueryClientProvider>
    );
  }
  rendered = renderRouter(
    {
      _layout: Layout,
      index: () => <Text>route:index</Text>,
      login: () => <Text>route:login</Text>,
      "recuperar-contrasena": ForgotPasswordScreen,
      "restablecer-contrasena": ResetPasswordScreen,
      "cambiar-contrasena": ChangePasswordScreen,
      "completar-perfil": CompleteProfileScreen,
    },
    { initialUrl },
  );
  await rendered;
}

function pathname(): string {
  if (!rendered) throw new Error("renderAt first");
  return rendered.getPathname();
}

function searchParams(): Record<string, unknown> {
  if (!rendered) throw new Error("renderAt first");
  return rendered.getSearchParams();
}

const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

async function choosePassword(password: string, confirmation = password) {
  await type("Nueva contraseña", password);
  await type("Confirmar contraseña", confirmation);
}

beforeEach(() => {
  mockSession.state = { phase: "auth", status: "none" };
  mockSession.me = undefined;
  mockClient = { auth: mockAuth };
  for (const fn of Object.values(mockAuth)) fn.mockReset().mockResolvedValue(ok);
  mockPatch.mockReset();
  mockSetRecovering.mockClear();
  mockCerrarSesion.mockClear();
});

// --- Forgot password -----------------------------------------------------------------------

describe("ForgotPasswordScreen", () => {
  const NEUTRAL =
    "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Ábrelo en este teléfono.";

  async function requestFor(email: string) {
    await type("Correo electrónico", email);
    await press("Enviar enlace");
  }

  it("sends a reset link that opens the app's reset screen, and answers neutrally", async () => {
    await renderAt("/recuperar-contrasena");

    await requestFor("  ana@correo.com ");

    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith("ana@correo.com", {
      redirectTo: "findfoodappmobile://restablecer-contrasena",
    });
    expect(await screen.findByText(NEUTRAL)).toBeOnTheScreen();
  });

  it("validates the email before calling Supabase", async () => {
    await renderAt("/recuperar-contrasena");

    await requestFor("ana@");

    expect(screen.getByText("Ingresa un correo electrónico válido.")).toBeOnTheScreen();
    expect(mockAuth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  // A failure to send can only happen for a registered address (Supabase sends nothing to an
  // unknown one), so it gets the same answer: the screen never reveals which addresses exist.
  it("answers other Supabase errors with the same neutral confirmation, reporting them in development", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mockAuth.resetPasswordForEmail.mockResolvedValue(authError("unexpected_failure", 500));
      await renderAt("/recuperar-contrasena");

      await requestFor("ana@correo.com");

      expect(await screen.findByText(NEUTRAL)).toBeOnTheScreen();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      const reported = JSON.stringify(warn.mock.calls[0]);
      expect(reported).toContain("unexpected_failure");
      expect(reported).not.toContain("ana@correo.com");
    } finally {
      warn.mockRestore();
    }
  });

  it("reports nothing when the request succeeds", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await renderAt("/recuperar-contrasena");

      await requestFor("ana@correo.com");

      expect(await screen.findByText(NEUTRAL)).toBeOnTheScreen();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("shows a rate limit as an error", async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue(authError("over_email_send_rate_limit", 429));
    await renderAt("/recuperar-contrasena");

    await requestFor("ana@correo.com");

    expect(
      await screen.findByText("Ya enviamos varios correos. Espera unos minutos antes de solicitar otro."),
    ).toBeOnTheScreen();
    expect(screen.queryByText(NEUTRAL)).toBeNull();
  });

  it("shows a network failure as an error", async () => {
    const offline = new AuthRetryableFetchError("Failed to fetch", 0);
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: null, error: offline });
    await renderAt("/recuperar-contrasena");

    await requestFor("ana@correo.com");

    expect(await screen.findByText(messageFor(offline))).toBeOnTheScreen();
    expect(screen.queryByText(NEUTRAL)).toBeNull();
  });

  it("explains the local profile and disables the form without Supabase", async () => {
    mockClient = null;
    await renderAt("/recuperar-contrasena");

    expect(screen.getByText(/Este perfil local no usa Supabase/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Enviar enlace" })).toBeDisabled();
  });
});

// --- Reset password (deep link) ------------------------------------------------------------

describe("ResetPasswordScreen", () => {
  const linkUrl = "/restablecer-contrasena?code=auth-code-1&sb_flow_id=flow-id-1234";

  /** auth-js stores the recovery session (and emits PASSWORD_RECOVERY) on success. */
  function exchangeSucceeds() {
    mockAuth.exchangeCodeForSession.mockImplementation(async () => {
      mockSession.set({ status: "present" });
      return { data: { session: { access_token: "t" }, user: {} }, error: null };
    });
  }

  it("explains an expired link and offers a new one", async () => {
    await renderAt(
      "/restablecer-contrasena?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );

    expect(screen.getByText("El enlace ya no es válido")).toBeOnTheScreen();
    expect(screen.getByText(/expiró o ya se usó/)).toBeOnTheScreen();
    expect(screen.queryByText(/Email link is invalid/)).toBeNull();
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockSetRecovering).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Solicitar un enlace nuevo"));

    expect(await screen.findByRole("button", { name: "Enviar enlace" })).toBeOnTheScreen();
    expect(pathname()).toBe("/recuperar-contrasena");
  });

  it("explains any other link error too", async () => {
    await renderAt("/restablecer-contrasena?error=server_error&error_description=Something");

    expect(screen.getByText("El enlace ya no es válido")).toBeOnTheScreen();
    expect(screen.getByText("Solicitar un enlace nuevo")).toBeOnTheScreen();
  });

  it("marks the recovery before exchanging the code once for its flow, then clears the code", async () => {
    exchangeSucceeds();
    await renderAt(linkUrl);

    expect(await screen.findByLabelText("Nueva contraseña")).toBeOnTheScreen();
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith("auth-code-1", { flowId: "flow-id-1234" });
    expect(mockSetRecovering).toHaveBeenCalledWith(true);
    // The gate must never see the temporary session without the recovery flag.
    expect(mockSetRecovering.mock.invocationCallOrder[0]).toBeLessThan(
      mockAuth.exchangeCodeForSession.mock.invocationCallOrder[0],
    );
    expect(searchParams()).toEqual({});
  });

  it("never exchanges a used code again when the screen opens again", async () => {
    exchangeSucceeds();
    await renderAt(linkUrl);
    await screen.findByLabelText("Nueva contraseña");

    await act(async () =>
      router.replace({ pathname: "/restablecer-contrasena", params: searchParams() as Record<string, string> }),
    );

    expect(await screen.findByLabelText("Nueva contraseña")).toBeOnTheScreen();
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it("exchanges without a flow id when the link has none", async () => {
    exchangeSucceeds();
    await renderAt("/restablecer-contrasena?code=auth-code-1");

    await screen.findByLabelText("Nueva contraseña");
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith("auth-code-1", undefined);
  });

  it("shows a validating state while the code is exchanged", async () => {
    mockAuth.exchangeCodeForSession.mockReturnValue(new Promise(() => {}));
    await renderAt(linkUrl);

    expect(screen.getByText("Validando el enlace…")).toBeOnTheScreen();
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
  });

  it("explains a failed exchange, ends the recovery and offers a new link", async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue(authError("flow_state_expired"));
    await renderAt(linkUrl);

    expect(
      await screen.findByText("El enlace o el código no es válido o ya expiró. Solicita uno nuevo."),
    ).toBeOnTheScreen();
    expect(mockSetRecovering.mock.calls).toEqual([[true], [false]]);
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    expect(screen.getByText("Solicitar un enlace nuevo")).toBeOnTheScreen();
    expect(searchParams()).toEqual({});
  });

  it("keeps a recovery already in progress when another link fails", async () => {
    // The first link's recovery session is active; an old or foreign link must not end it.
    mockSession.state = { phase: "recovering", status: "present" };
    mockAuth.exchangeCodeForSession.mockResolvedValue(authError("pkce_code_verifier_not_found"));
    await renderAt(linkUrl);

    expect(await screen.findByText(/mismo teléfono/)).toBeOnTheScreen();
    expect(mockSetRecovering).not.toHaveBeenCalledWith(false);
    expect(mockSession.state.phase).toBe("recovering");
    expect(screen.getByLabelText("Nueva contraseña")).toBeOnTheScreen();
    expect(searchParams()).toEqual({});
  });

  it("waits for the stored recovery flag before deciding what a failing link ends", async () => {
    // Cold start: the restored session's recovery flag is still being read.
    mockSession.state = { phase: "loading", status: "present" };
    mockAuth.exchangeCodeForSession.mockResolvedValue(authError("pkce_code_verifier_not_found"));
    await renderAt(linkUrl);

    expect(screen.getByText("Validando el enlace…")).toBeOnTheScreen();
    expect(mockSetRecovering).not.toHaveBeenCalled();
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();

    // The flag was stored: a recovery from an earlier link is in progress.
    await act(async () => mockSession.set({ phase: "recovering" }));

    expect(await screen.findByText(/mismo teléfono/)).toBeOnTheScreen();
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(mockSetRecovering).not.toHaveBeenCalledWith(false);
    expect(mockSession.state.phase).toBe("recovering");
    expect(screen.getByLabelText("Nueva contraseña")).toBeOnTheScreen();
  });

  it("keeps a recovery already in progress when an expired link is opened", async () => {
    mockSession.state = { phase: "recovering", status: "present" };
    await renderAt("/restablecer-contrasena?error=access_denied&error_code=otp_expired");

    expect(screen.getByText(/expiró o ya se usó/)).toBeOnTheScreen();
    expect(screen.getByLabelText("Nueva contraseña")).toBeOnTheScreen();
  });

  it("asks to open the link on the phone that requested it when the verifier is missing", async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue(authError("pkce_code_verifier_not_found"));
    await renderAt(linkUrl);

    expect(await screen.findByText(/mismo teléfono/)).toBeOnTheScreen();
  });

  it("sets the new password, ends the recovery and hands over to the gate", async () => {
    exchangeSucceeds();
    await renderAt(linkUrl);
    await screen.findByLabelText("Nueva contraseña");
    const refetch = jest.spyOn(client, "refetchQueries");

    await choosePassword("nueva1234");
    await press("Guardar contraseña");

    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: "nueva1234" });
    expect(refetch).toHaveBeenCalledWith({ queryKey: queryKeys.me }, { cancelRefetch: false });
    expect(mockSetRecovering).toHaveBeenLastCalledWith(false);
    expect(await screen.findByText("route:index")).toBeOnTheScreen();
    expect(pathname()).toBe("/");
  });

  it("keeps the form and the recovery when Supabase rejects the password", async () => {
    exchangeSucceeds();
    mockAuth.updateUser.mockResolvedValue(authError("same_password", 422));
    await renderAt(linkUrl);
    await screen.findByLabelText("Nueva contraseña");

    await choosePassword("nueva1234");
    await press("Guardar contraseña");

    expect(await screen.findByText("La nueva contraseña debe ser distinta de la actual.")).toBeOnTheScreen();
    expect(mockSetRecovering).not.toHaveBeenCalledWith(false);
    expect(pathname()).toBe("/restablecer-contrasena");
  });

  it("validates the new password before calling Supabase", async () => {
    exchangeSucceeds();
    await renderAt(linkUrl);
    await screen.findByLabelText("Nueva contraseña");

    await choosePassword("nueva1234", "nueva1235");
    await press("Guardar contraseña");

    expect(screen.getByText("Las contraseñas no coinciden.")).toBeOnTheScreen();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it("cancels by signing out on this device", async () => {
    exchangeSucceeds();
    await renderAt(linkUrl);
    await screen.findByLabelText("Nueva contraseña");

    await press("Cancelar");

    expect(mockCerrarSesion).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("route:index")).toBeOnTheScreen();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it("shows the form for a recovery already in progress (opened by the gate)", async () => {
    mockSession.state = { phase: "recovering", status: "present" };
    await renderAt("/restablecer-contrasena");

    expect(screen.getByLabelText("Nueva contraseña")).toBeOnTheScreen();
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("points to a new request without a link", async () => {
    await renderAt("/restablecer-contrasena");

    expect(screen.getByText("Abre el enlace de tu correo")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Solicitar un enlace"));
    expect(pathname()).toBe("/recuperar-contrasena");
  });
});

// --- Change password -------------------------------------------------------------------------

describe("ChangePasswordScreen", () => {
  beforeEach(() => {
    mockSession.state = { phase: "change-password", status: "present" };
  });

  it("sets the new password and fetches the account again", async () => {
    await renderAt("/cambiar-contrasena");
    const refetch = jest.spyOn(client, "refetchQueries");

    await choosePassword("nueva1234");
    await press("Guardar contraseña");

    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: "nueva1234" });
    // The database clears debe_cambiar_password; the guards move on once /me says so.
    expect(refetch).toHaveBeenCalledWith({ queryKey: queryKeys.me }, { cancelRefetch: false });
  });

  it("applies the registration password rules", async () => {
    await renderAt("/cambiar-contrasena");

    await choosePassword("solamente");
    await press("Guardar contraseña");

    expect(screen.getByText("Incluye al menos un número.")).toBeOnTheScreen();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it("shows Supabase's rejection", async () => {
    mockAuth.updateUser.mockResolvedValue(authError("weak_password", 422));
    await renderAt("/cambiar-contrasena");

    await choosePassword("nueva1234");
    await press("Guardar contraseña");

    expect(
      await screen.findByText("La contraseña es demasiado débil. Usa una más larga que combine letras y números."),
    ).toBeOnTheScreen();
  });

  it("can sign out instead", async () => {
    await renderAt("/cambiar-contrasena");

    await press("Cerrar sesión");

    expect(mockCerrarSesion).toHaveBeenCalledTimes(1);
  });
});

// --- Complete profile -------------------------------------------------------------------------

describe("CompleteProfileScreen", () => {
  /** A Google account: no surnames, no phone, terms not accepted yet. */
  const googleUser = () =>
    meFixture({
      nombres: "Ana",
      apellidos: null,
      telefono: null,
      acepto_terminos_at: null,
      pendientes: ["TELEFONO", "ACEPTAR_TERMINOS"],
    });

  beforeEach(() => {
    mockSession.state = { phase: "complete-profile", status: "present" };
  });

  it("prefills what the account has and asks for the terms when pending", async () => {
    mockSession.me = googleUser();
    await renderAt("/completar-perfil");

    expect(screen.getByLabelText("Nombres").props.value).toBe("Ana");
    expect(screen.getByLabelText("Apellidos").props.value).toBe("");
    expect(screen.getByLabelText("Celular").props.value).toBe("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("sends only the changed fields and the accepted terms", async () => {
    const updated = meFixture({ nombres: "Ana", apellidos: "Ruiz", pendientes: [] });
    mockPatch.mockResolvedValue(updated);
    mockSession.me = googleUser();
    await renderAt("/completar-perfil");

    await type("Apellidos", " Ruiz ");
    await type("Celular", "300 123 4567");
    await fireEvent.press(screen.getByRole("checkbox"));
    await press("Guardar y continuar");

    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith("/me", {
      body: { apellidos: "Ruiz", telefono: "+573001234567", acepto_terminos: true },
    });
    // The answer is the updated account: the guards move on without another request.
    expect(client.getQueryData(queryKeys.me)).toEqual(updated);
  });

  it("requires the surnames, the phone and the pending terms", async () => {
    mockSession.me = googleUser();
    await renderAt("/completar-perfil");

    await press("Guardar y continuar");

    expect(screen.getByText("Ingresa tus apellidos.")).toBeOnTheScreen();
    expect(screen.getByText("Ingresa tu número de celular.")).toBeOnTheScreen();
    expect(screen.getByText("Debes aceptar los términos y condiciones.")).toBeOnTheScreen();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("leaves the terms out once they were accepted", async () => {
    mockPatch.mockResolvedValue(meFixture());
    mockSession.me = meFixture({ telefono: null, pendientes: ["TELEFONO"] });
    await renderAt("/completar-perfil");

    expect(screen.queryByRole("checkbox")).toBeNull();
    await type("Celular", "3001234567");
    await press("Guardar y continuar");

    expect(mockPatch).toHaveBeenCalledWith("/me", { body: { telefono: "+573001234567" } });
  });

  it("puts the API's field errors on their fields", async () => {
    mockPatch.mockRejectedValue(
      new ApiError({
        type: "validacion",
        status: 400,
        title: "Bad Request",
        fields: { telefono: ["debe ser un celular de 10 dígitos, con +57 opcional"] },
      }),
    );
    mockSession.me = meFixture({ telefono: null, pendientes: ["TELEFONO"] });
    await renderAt("/completar-perfil");

    await type("Celular", "3001234567");
    await press("Guardar y continuar");

    expect(
      await screen.findByText("Debe ser un celular de 10 dígitos, con +57 opcional."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("can sign out instead", async () => {
    mockSession.me = googleUser();
    await renderAt("/completar-perfil");

    await press("Cerrar sesión");

    expect(mockCerrarSesion).toHaveBeenCalledTimes(1);
  });
});
