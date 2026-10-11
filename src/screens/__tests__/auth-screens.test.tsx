/**
 * Email sign-in, sign-up and code verification against a fake Supabase client. Each screen
 * is mounted under expo-router's testing library with the other auth routes, so the tests
 * can follow the navigation between them.
 */
import { AuthApiError } from "@supabase/supabase-js";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

import { VerifyEmailScreen } from "@/screens/account";
import { LoginScreen, RegisterScreen } from "@/screens/auth";
import { queryKeys } from "@/services/query-keys";
import { createTestQueryClient } from "@/test-utils/query";

/** The session the verification falls back to (`verify-email` phase): none by default. */
let mockSession: { status: "none" | "present"; email?: string } = { status: "none" };

jest.mock("@/state/session", () => ({
  useSession: () => mockSession,
}));

const mockAuth = {
  signInWithPassword: jest.fn(),
  signUp: jest.fn(),
  verifyOtp: jest.fn(),
  resend: jest.fn(),
};
let mockClient: { auth: typeof mockAuth } | null = { auth: mockAuth };

jest.mock("@/auth/supabase", () => ({
  get supabase() {
    return mockClient;
  },
  refreshAccessToken: async () => null,
}));

const ok = { data: { user: null, session: null }, error: null };
const authError = (code: string, status = 400) => ({
  data: { user: null, session: null },
  error: new AuthApiError(`English message for ${code}`, status, code),
});

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
      login: LoginScreen,
      registro: RegisterScreen,
      "verificar-correo": VerifyEmailScreen,
      "recuperar-contrasena": () => <Text>route:recuperar-contrasena</Text>,
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

const NEUTRAL_NOTE =
  "Si el correo es nuevo, te enviamos un código. Si ya tienes cuenta, inicia sesión o recupera tu contraseña.";

beforeEach(() => {
  mockSession = { status: "none" };
  mockClient = { auth: mockAuth };
  for (const fn of Object.values(mockAuth)) fn.mockReset().mockResolvedValue(ok);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("LoginScreen", () => {
  async function signInAs(email: string, password: string) {
    await type("Correo electrónico", email);
    await type("Contraseña", password);
    await press("Iniciar sesión");
  }

  it("signs in with the trimmed email and stays put for the guards to move on", async () => {
    await renderAt("/login");

    await signInAs("  ana@correo.com ", "secreta123");

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@correo.com",
      password: "secreta123",
    });
    expect(pathname()).toBe("/login");
  });

  it("validates before calling Supabase", async () => {
    await renderAt("/login");

    await press("Iniciar sesión");

    expect(screen.getByText("Ingresa tu correo electrónico.")).toBeOnTheScreen();
    expect(screen.getByText("Ingresa tu contraseña.")).toBeOnTheScreen();
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("explains wrong credentials", async () => {
    mockAuth.signInWithPassword.mockResolvedValue(authError("invalid_credentials"));
    await renderAt("/login");

    await signInAs("ana@correo.com", "mala");

    expect(await screen.findByText("El correo o la contraseña no son correctos.")).toBeOnTheScreen();
  });

  it("opens the verification for an unconfirmed email, which sends a fresh code once", async () => {
    mockAuth.signInWithPassword.mockResolvedValue(authError("email_not_confirmed"));
    await renderAt("/login");

    await signInAs("ana@correo.com", "secreta123");

    expect(await screen.findByText("ana@correo.com")).toBeOnTheScreen();
    expect(pathname()).toBe("/verificar-correo");
    expect(searchParams()).toEqual({ email: "ana@correo.com", enviar: "1" });
    expect(await screen.findByText("Te enviamos un código nuevo.")).toBeOnTheScreen();
    expect(mockAuth.resend).toHaveBeenCalledTimes(1);
    expect(mockAuth.resend).toHaveBeenCalledWith({ type: "signup", email: "ana@correo.com" });
    // The account exists: no sign-up note.
    expect(screen.queryByText(NEUTRAL_NOTE)).toBeNull();
  });

  it("never waits for the code to be sent before opening the verification", async () => {
    mockAuth.signInWithPassword.mockResolvedValue(authError("email_not_confirmed"));
    mockAuth.resend.mockReturnValue(new Promise(() => {}));
    await renderAt("/login");

    await signInAs("ana@correo.com", "secreta123");

    expect(await screen.findByText("Enviando un código a tu correo…")).toBeOnTheScreen();
    expect(pathname()).toBe("/verificar-correo");
  });

  it("keeps Google visible but unavailable", async () => {
    await renderAt("/login");

    expect(screen.getByRole("button", { name: "Google" })).toBeDisabled();
  });

  it("links to sign-up and password recovery", async () => {
    await renderAt("/login");

    await fireEvent.press(screen.getByText("¿Olvidaste tu contraseña?"));

    expect(await screen.findByText("route:recuperar-contrasena")).toBeOnTheScreen();
  });

  it("explains the local profile and disables the form without Supabase", async () => {
    mockClient = null;
    await renderAt("/login");

    expect(screen.getByText(/Este perfil local no usa Supabase/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeDisabled();
  });
});

describe("RegisterScreen", () => {
  async function fillRegistration() {
    await type("Nombres", "  María ");
    await type("Apellidos", "García López");
    await type("Correo electrónico", "maria@correo.com");
    await type("Celular", "+57 300 123 4567");
    await type("Contraseña", "secreta123");
    await type("Confirmar contraseña", "secreta123");
    await fireEvent.press(screen.getByRole("checkbox"));
  }

  it("toggles the terms checkbox accessibly", async () => {
    await renderAt("/registro");
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).not.toBeChecked();

    await fireEvent.press(checkbox);

    expect(screen.getByRole("checkbox")).toBeChecked();
  });

  it("hides the document fields the API does not support yet", async () => {
    await renderAt("/registro");

    expect(screen.queryByText(/documento/i)).toBeNull();
  });

  it("requires the terms", async () => {
    await renderAt("/registro");
    await fillRegistration();
    await fireEvent.press(screen.getByRole("checkbox"));

    await press("Crear cuenta");

    expect(screen.getByText("Debes aceptar los términos y condiciones.")).toBeOnTheScreen();
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  it("signs up with the profile metadata and opens the verification", async () => {
    await renderAt("/registro");
    await fillRegistration();

    await press("Crear cuenta");

    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: "maria@correo.com",
      password: "secreta123",
      options: {
        data: {
          nombres: "María",
          apellidos: "García López",
          telefono: "+573001234567",
          acepto_terminos: true,
        },
      },
    });
    expect(await screen.findByText("maria@correo.com")).toBeOnTheScreen();
    expect(pathname()).toBe("/verificar-correo");
    expect(searchParams()).toEqual({ email: "maria@correo.com", origen: "registro" });
    expect(screen.getByText(NEUTRAL_NOTE)).toBeOnTheScreen();
  });

  // Whether an address is registered is never revealed: an existing one gets the same answer.
  it.each(["user_already_exists", "email_exists"])(
    "answers %s exactly like a new address",
    async (code) => {
      mockAuth.signUp.mockResolvedValue(authError(code, 422));
      await renderAt("/registro");
      await fillRegistration();

      await press("Crear cuenta");

      expect(await screen.findByText(NEUTRAL_NOTE)).toBeOnTheScreen();
      expect(pathname()).toBe("/verificar-correo");
      expect(searchParams()).toEqual({ email: "maria@correo.com", origen: "registro" });
      expect(screen.queryByText(/Ya existe una cuenta/)).toBeNull();
    },
  );

  it("still shows other sign-up errors on the form", async () => {
    mockAuth.signUp.mockResolvedValue(authError("signup_disabled", 422));
    await renderAt("/registro");
    await fillRegistration();

    await press("Crear cuenta");

    expect(
      await screen.findByText("El registro no está disponible en este momento."),
    ).toBeOnTheScreen();
    expect(pathname()).toBe("/registro");
  });
});

describe("VerifyEmailScreen", () => {
  const verifyUrl = "/verificar-correo?email=maria%40correo.com";
  const signUpUrl = `${verifyUrl}&origen=registro`;
  const CODE_LABEL = "Código de verificación de seis dígitos";

  it("asks to start over without an email param or a session", async () => {
    await renderAt("/verificar-correo");

    expect(screen.getByText("No sabemos qué correo verificar")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Ir a iniciar sesión"));
    expect(pathname()).toBe("/login");
  });

  it("links a sign-up to login and password recovery in its neutral note", async () => {
    await renderAt(signUpUrl);

    expect(screen.getByText(NEUTRAL_NOTE)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Recuperar contraseña"));
    expect(await screen.findByText("route:recuperar-contrasena")).toBeOnTheScreen();
  });

  it("links the neutral note to login", async () => {
    await renderAt(signUpUrl);

    await fireEvent.press(screen.getByText("Iniciar sesión"));

    expect(await screen.findByText("Bienvenido")).toBeOnTheScreen();
    expect(pathname()).toBe("/login");
  });

  describe("signed in with an unconfirmed email (verify-email phase)", () => {
    beforeEach(() => {
      mockSession = { status: "present", email: "sesion@correo.com" };
    });

    it("verifies the session's email and refreshes the account", async () => {
      await renderAt("/verificar-correo");
      const invalidate = jest.spyOn(client, "invalidateQueries");

      expect(screen.getByText("sesion@correo.com")).toBeOnTheScreen();
      expect(screen.queryByText(NEUTRAL_NOTE)).toBeNull();
      await type(CODE_LABEL, "654321");
      await press("Verificar correo");

      expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
        email: "sesion@correo.com",
        token: "654321",
        type: "email",
      });
      // `/me` still lists CONFIRMAR_CORREO until it is fetched again.
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.me });
    });

    it("allows a resend right away: nothing was sent from this screen", async () => {
      await renderAt("/verificar-correo");

      expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
      expect(mockAuth.resend).not.toHaveBeenCalled();
    });

    it("prefers the email param over the session's", async () => {
      await renderAt(verifyUrl);

      expect(screen.getByText("maria@correo.com")).toBeOnTheScreen();
      expect(screen.queryByText("sesion@correo.com")).toBeNull();
    });
  });

  it("keeps only digits, up to six", async () => {
    await renderAt(verifyUrl);

    await type(CODE_LABEL, "12a-34 5678");

    expect(screen.getByLabelText(CODE_LABEL).props.value).toBe("123456");
  });

  it("verifies the code for the email", async () => {
    await renderAt(verifyUrl);

    await type(CODE_LABEL, "123456");
    await press("Verificar correo");

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      email: "maria@correo.com",
      token: "123456",
      type: "email",
    });
  });

  it("asks for the six digits before calling Supabase", async () => {
    await renderAt(verifyUrl);

    await type(CODE_LABEL, "123");
    await press("Verificar correo");

    expect(screen.getByText("Ingresa los 6 dígitos del código.")).toBeOnTheScreen();
    expect(mockAuth.verifyOtp).not.toHaveBeenCalled();
  });

  describe("asked to send a code (enviar=1, after an unconfirmed sign-in)", () => {
    const sendUrl = `${verifyUrl}&enviar=1`;

    it("sends once on mount and starts the cooldown only after it was sent", async () => {
      jest.useFakeTimers();
      let finishSend: (value: typeof ok) => void = () => {};
      mockAuth.resend.mockReturnValue(new Promise((resolve) => (finishSend = resolve)));
      await renderAt(sendUrl);

      expect(screen.getByText("Enviando un código a tu correo…")).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Reenviar código" })).toBeDisabled();
      // Time spent sending does not count towards the cooldown.
      await act(async () => jest.advanceTimersByTime(30_000));

      await act(async () => finishSend(ok));

      expect(screen.getByText("Te enviamos un código nuevo.")).toBeOnTheScreen();
      expect(screen.queryByText("Enviando un código a tu correo…")).toBeNull();
      expect(screen.getByRole("button", { name: "Reenviar código en 01:00" })).toBeDisabled();
      expect(mockAuth.resend).toHaveBeenCalledTimes(1);
    });

    it("shows a failed send and leaves resend available, without a cooldown", async () => {
      mockAuth.resend.mockResolvedValue(authError("over_email_send_rate_limit", 429));
      await renderAt(sendUrl);

      expect(
        await screen.findByText(
          "Ya enviamos varios correos. Espera unos minutos antes de solicitar otro.",
        ),
      ).toBeOnTheScreen();
      expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
    });
  });

  it("allows a resend right away for an email param alone", async () => {
    await renderAt(verifyUrl);

    expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
    expect(mockAuth.resend).not.toHaveBeenCalled();
  });

  it("lets the user resend right away once the code expired", async () => {
    mockAuth.verifyOtp.mockResolvedValue(authError("otp_expired", 403));
    await renderAt(signUpUrl);
    expect(screen.getByRole("button", { name: /Reenviar código en/ })).toBeDisabled();

    await type(CODE_LABEL, "123456");
    await press("Verificar correo");

    expect(
      await screen.findByText("El enlace o el código no es válido o ya expiró. Solicita uno nuevo."),
    ).toBeOnTheScreen();
    await press("Reenviar código");
    expect(mockAuth.resend).toHaveBeenCalledWith({ type: "signup", email: "maria@correo.com" });
  });

  it("counts 60 seconds down after a sign-up (Supabase already sent a code), then restarts", async () => {
    jest.useFakeTimers();
    await renderAt(signUpUrl);

    expect(screen.getByRole("button", { name: "Reenviar código en 01:00" })).toBeDisabled();

    await act(async () => jest.advanceTimersByTime(18_000));
    expect(screen.getByRole("button", { name: "Reenviar código en 00:42" })).toBeDisabled();

    await act(async () => jest.advanceTimersByTime(42_000));
    const resend = screen.getByRole("button", { name: "Reenviar código" });
    expect(resend).toBeEnabled();

    await fireEvent.press(resend);

    expect(mockAuth.resend).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Te enviamos un código nuevo.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Reenviar código en 01:00" })).toBeDisabled();
  });

  it("shows a failed resend and keeps it available", async () => {
    mockAuth.resend.mockResolvedValue(authError("over_email_send_rate_limit", 429));
    await renderAt(verifyUrl);

    await press("Reenviar código");

    expect(
      await screen.findByText(
        "Ya enviamos varios correos. Espera unos minutos antes de solicitar otro.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Reenviar código" })).toBeEnabled();
  });

  it("runs a single countdown interval per code and clears it on unmount", async () => {
    jest.useFakeTimers();
    await renderAt(signUpUrl);
    // Spied after rendering: the router's test renderer installs its own fake timers.
    const setIntervalSpy = jest.spyOn(globalThis, "setInterval");
    const clearIntervalSpy = jest.spyOn(globalThis, "clearInterval");
    try {
      await act(async () => jest.advanceTimersByTime(60_000));
      await press("Reenviar código");
      await screen.findByText("Te enviamos un código nuevo.");

      const countdowns = setIntervalSpy.mock.calls.flatMap(([, delay], i) =>
        delay === 1_000 ? [setIntervalSpy.mock.results[i].value] : [],
      );
      expect(countdowns).toHaveLength(1);
      expect(clearIntervalSpy).not.toHaveBeenCalledWith(countdowns[0]);

      await act(async () => screen.unmount());

      expect(clearIntervalSpy).toHaveBeenCalledWith(countdowns[0]);
    } finally {
      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    }
  });
});
