import { AuthApiError } from "@supabase/supabase-js";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import type { PropsWithChildren } from "react";

import type { MeDto } from "@/api/types";
import { signOutFromGoogle } from "@/auth/google-auth";
import { sessionStore } from "@/auth/session-store";
import { signOutLocally, supabase } from "@/auth/supabase";
import { env } from "@/config/env";
import { queryKeys } from "@/services/query-keys";

import { SessionProvider, useAccess, useMe, useSession, useSessionActions } from "./session";

jest.mock("@/config/env", () => ({
  env: { appEnv: "local", apiUrl: "http://api.test", devToken: "dev-token" },
}));

// The Supabase client is faked; the token refresh keeps the real classification
// (`createAccessTokenRefresher`), so the API client goes through the same path as the app.
jest.mock("@/auth/supabase", () => {
  const { createAccessTokenRefresher } = jest.requireActual<{
    createAccessTokenRefresher: (auth: unknown) => () => Promise<string | null>;
  }>("@/auth/refresh");
  let listener: ((event: string, session: unknown) => void) | null = null;
  const subscription = {
    unsubscribe: jest.fn(() => {
      listener = null;
    }),
  };
  const auth = {
    subscription,
    getSession: jest.fn(),
    refreshSession: jest.fn(),
    onAuthStateChange: jest.fn((callback: typeof listener) => {
      listener = callback;
      return { data: { subscription } };
    }),
    emit: (event: string, session: unknown) => listener?.(event, session),
  };
  return {
    supabase: { auth },
    refreshAccessToken: createAccessTokenRefresher(auth),
    signOutLocally: jest.fn(async () => {
      listener?.("SIGNED_OUT", null);
    }),
  };
});

// Best effort and never rejects (see google-auth.test.ts).
jest.mock("@/auth/google-auth", () => ({
  signOutFromGoogle: jest.fn(async () => {}),
}));

const mockSecureValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureValues.delete(key);
  }),
}));

interface FakeAuth {
  subscription: { unsubscribe: jest.Mock };
  getSession: jest.Mock;
  refreshSession: jest.Mock;
  onAuthStateChange: jest.Mock;
  emit(event: string, session: unknown): void;
}

const auth = (supabase as unknown as { auth: FakeAuth }).auth;
const mockedSignOutLocally = jest.mocked(signOutLocally);
const mockedSignOutFromGoogle = jest.mocked(signOutFromGoogle);
const testEnv = env as { appEnv: "local" | "real"; devToken?: string };

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

interface Reply {
  status: number;
  body?: unknown;
}

const realFetch = globalThis.fetch;

/** Answers every API call with `handler`; returns the recorded calls. */
function serve(handler: (call: FetchCall) => Reply | Promise<Reply>): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string> | undefined) },
    };
    calls.push(call);
    // Like fetch, an aborted request rejects even when the server never answers.
    const { status, body } = await new Promise<Reply>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      });
      Promise.resolve(handler(call)).then(resolve, reject);
    });
    const text = body === undefined ? "" : JSON.stringify(body);
    return {
      status,
      headers: { get: () => "application/json" },
      text: async () => text,
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

function me(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: "u-1",
    email: "ana@example.com",
    nombres: "Ana",
    apellidos: "Ruiz",
    telefono: "3001234567",
    url_foto: null,
    estado: "ACTIVO",
    debe_cambiar_password: false,
    idioma: "es",
    acepto_terminos_at: "2026-10-01T10:00:00.000Z",
    created_at: "2026-10-01T10:00:00.000Z",
    email_verificado: true,
    roles: ["DONANTE"],
    pendientes: [],
    donante: null,
    voluntario: null,
    ...overrides,
  };
}

const realSession = {
  access_token: "real-token",
  user: { id: "u-1", email: "ana@example.com" },
};

async function renderSession() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  }
  const view = await renderHook(
    () => ({
      session: useSession(),
      me: useMe(),
      access: useAccess(),
      actions: useSessionActions(),
    }),
    { wrapper: Wrapper },
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSecureValues.clear();
  sessionStore.setSession({ status: "loading", accessToken: null });
  testEnv.appEnv = "local";
  testEnv.devToken = "dev-token";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  onlineManager.setOnline(true);
});

const networkFailure = () => Promise.reject(new TypeError("Network request failed"));

describe("local profile", () => {
  it("signs in with the dev token and loads /me with it", async () => {
    const calls = serve(() => ({ status: 200, body: me() }));

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    expect(result.current.session).toEqual({ status: "present", email: undefined });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "http://api.test/v1/me", method: "GET" });
    expect(calls[0].headers.Authorization).toBe("Bearer dev-token");
    expect(result.current.me.data).toEqual(me());
    expect(result.current.access).toMatchObject({
      canDonor: true,
      canVolunteer: false,
      activeRole: "DONANTE",
    });
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("restores the stored role and persists a new choice", async () => {
    mockSecureValues.set("findfood.activeRole", "VOLUNTARIO");
    serve(() => ({ status: 200, body: me({ roles: ["DONANTE", "VOLUNTARIO"] }) }));

    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    expect(result.current.access.activeRole).toBe("VOLUNTARIO");

    await act(async () => result.current.access.setActiveRole("DONANTE"));

    expect(result.current.access.activeRole).toBe("DONANTE");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("findfood.activeRole", "DONANTE");
  });

  it("falls back when the stored role is not one of the account's roles", async () => {
    mockSecureValues.set("findfood.activeRole", "VOLUNTARIO");
    serve(() => ({ status: 200, body: me({ roles: ["DONANTE"] }) }));

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    expect(result.current.access.activeRole).toBe("DONANTE");
  });

  it("signs out when the API rejects the session", async () => {
    testEnv.devToken = "expired-dev-token";
    serve(() => ({
      status: 401,
      body: { type: "token-invalido", title: "Invalid token", status: 401 },
    }));

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.session.status).toBe("none"));
    expect(result.current.access.phase).toBe("auth");
    expect(sessionStore.getAccessToken()).toBeNull();
  });
});

describe("cerrarSesion", () => {
  it("runs once, unregisters the device and clears the cache and storage", async () => {
    mockSecureValues.set("findfood.deviceId", "device 1");
    mockSecureValues.set("findfood.activeRole", "DONANTE");
    const calls = serve((call) =>
      call.method === "DELETE" ? { status: 204 } : { status: 200, body: me() },
    );
    const { result, queryClient } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));

    await act(async () => {
      const first = result.current.actions.cerrarSesion();
      const second = result.current.actions.cerrarSesion();
      expect(second).toBe(first);
      await first;
    });

    const deletes = calls.filter((call) => call.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toBe("http://api.test/v1/me/dispositivos/device%201");
    expect(deletes[0].headers.Authorization).toBe("Bearer dev-token");
    expect(result.current.session.status).toBe("none");
    expect(result.current.access.phase).toBe("auth");
    expect(queryClient.getQueryData(queryKeys.me)).toBeUndefined();
    expect(mockSecureValues.has("findfood.deviceId")).toBe(false);
    expect(mockSecureValues.has("findfood.activeRole")).toBe(false);
    expect(mockedSignOutLocally).not.toHaveBeenCalled();
  });

  it("signs out even when the device cannot be unregistered", async () => {
    mockSecureValues.set("findfood.deviceId", "device-1");
    serve((call) =>
      call.method === "DELETE"
        ? Promise.reject(new TypeError("Network request failed"))
        : { status: 200, body: me() },
    );
    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));

    await act(() => result.current.actions.cerrarSesion());

    expect(result.current.session.status).toBe("none");
    expect(mockSecureValues.has("findfood.deviceId")).toBe(false);
  });

  it("gives up on a hung device unregistration after a short timeout", async () => {
    mockSecureValues.set("findfood.deviceId", "device-1");
    serve((call) =>
      call.method === "DELETE" ? new Promise<Reply>(() => {}) : { status: 200, body: me() },
    );
    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    jest.useFakeTimers();
    try {
      let done = false;
      let signOut: Promise<void> = Promise.resolve();
      await act(async () => {
        signOut = result.current.actions.cerrarSesion().then(() => {
          done = true;
        });
        await jest.advanceTimersByTimeAsync(2_900);
      });
      expect(done).toBe(false);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
        await signOut;
      });

      expect(done).toBe(true);
      expect(result.current.session.status).toBe("none");
    } finally {
      jest.useRealTimers();
    }
  });

  it("is the handler for unauthorized API responses", async () => {
    serve(() => ({ status: 200, body: me() }));
    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));

    await act(async () => {
      sessionStore.notifyUnauthorized();
    });

    await waitFor(() => expect(result.current.session.status).toBe("none"));
  });
});

describe("real profile", () => {
  beforeEach(() => {
    testEnv.appEnv = "real";
    auth.getSession.mockResolvedValue({ data: { session: realSession }, error: null });
  });

  it("restores the Supabase session and follows its events", async () => {
    const calls = serve(() => ({ status: 200, body: me() }));
    const { result, queryClient, unmount } = await renderSession();

    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    expect(result.current.session).toEqual({ status: "present", email: "ana@example.com" });
    expect(calls[0].headers.Authorization).toBe("Bearer real-token");

    await act(async () => auth.emit("TOKEN_REFRESHED", { ...realSession, access_token: "t2" }));
    expect(sessionStore.getAccessToken()).toBe("t2");

    await act(async () => auth.emit("PASSWORD_RECOVERY", realSession));
    expect(result.current.access.phase).toBe("recovering");

    await act(async () => auth.emit("SIGNED_OUT", null));
    expect(result.current.session.status).toBe("none");
    expect(result.current.access.phase).toBe("auth");
    expect(queryClient.getQueryData(queryKeys.me)).toBeUndefined();

    await unmount();
    expect(auth.subscription.unsubscribe).toHaveBeenCalledTimes(1);
    sessionStore.notifyUnauthorized();
    expect(mockedSignOutLocally).not.toHaveBeenCalled();
  });

  it("fetches /me again when Supabase signs in or updates the user, not on a token refresh", async () => {
    const calls = serve(() => ({ status: 200, body: me() }));
    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    expect(calls).toHaveLength(1);

    // A new password clears CAMBIAR_PASSWORD; a verified code clears CONFIRMAR_CORREO.
    await act(async () => auth.emit("USER_UPDATED", realSession));
    await waitFor(() => expect(calls).toHaveLength(2));

    await act(async () => auth.emit("SIGNED_IN", realSession));
    await waitFor(() => expect(calls).toHaveLength(3));

    await act(async () => auth.emit("TOKEN_REFRESHED", { ...realSession, access_token: "t2" }));
    expect(calls).toHaveLength(3);
  });

  describe("password recovery flag", () => {
    const RECOVERING_KEY = "findfood.recovering";

    it("restores a recovery in progress on a cold start instead of opening the app", async () => {
      mockSecureValues.set(RECOVERING_KEY, "1");
      serve(() => ({ status: 200, body: me() }));

      const { result } = await renderSession();

      await waitFor(() => expect(result.current.session.status).toBe("present"));
      await waitFor(() => expect(result.current.access.phase).toBe("recovering"));
    });

    it("never reports the app before the flag is read", async () => {
      mockSecureValues.set(RECOVERING_KEY, "1");
      serve(() => ({ status: 200, body: me() }));
      const phases: string[] = [];

      const { result } = await renderSession();
      phases.push(result.current.access.phase);
      await waitFor(() => {
        phases.push(result.current.access.phase);
        expect(result.current.access.phase).toBe("recovering");
      });

      expect(phases).not.toContain("app");
    });

    it("forgets a stored flag whose recovery session is gone", async () => {
      mockSecureValues.set(RECOVERING_KEY, "1");
      auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

      const { result } = await renderSession();

      await waitFor(() => expect(result.current.access.phase).toBe("auth"));
      await waitFor(() => expect(mockSecureValues.has(RECOVERING_KEY)).toBe(false));
    });

    describe("when a recovery starts while the stored flag is still being read", () => {
      const getItem = jest.mocked(SecureStore.getItemAsync);
      const readStored = getItem.getMockImplementation();
      let heldReads: (() => void)[] = [];

      /** Holds every read of the flag until `finishReads`, then reads storage. */
      function holdFlagRead() {
        heldReads = [];
        getItem.mockImplementation((key: string) =>
          key === RECOVERING_KEY
            ? new Promise((resolve) => {
                heldReads.push(() => resolve(mockSecureValues.get(key) ?? null));
              })
            : Promise.resolve(mockSecureValues.get(key) ?? null),
        );
      }

      function finishReads() {
        for (const finish of heldReads.splice(0)) finish();
      }

      beforeEach(() => {
        // An old flag whose recovery session is gone.
        mockSecureValues.set(RECOVERING_KEY, "1");
        auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
        holdFlagRead();
      });

      afterEach(() => {
        getItem.mockImplementation(readStored);
      });

      it("keeps the flag a new reset link stored", async () => {
        const { result } = await renderSession();
        await waitFor(() => expect(result.current.session.status).toBe("none"));

        await act(() => result.current.actions.setRecovering(true));
        await act(async () => finishReads());

        await waitFor(() => expect(result.current.access.phase).toBe("recovering"));
        expect(mockSecureValues.get(RECOVERING_KEY)).toBe("1");
      });

      it("keeps the flag of a PASSWORD_RECOVERY event", async () => {
        serve(() => ({ status: 200, body: me() }));
        const { result } = await renderSession();
        await waitFor(() => expect(result.current.session.status).toBe("none"));

        // The event also brings the session: the flag is read again for it.
        await act(async () => auth.emit("PASSWORD_RECOVERY", realSession));
        await waitFor(() => expect(mockSecureValues.get(RECOVERING_KEY)).toBe("1"));
        await act(async () => finishReads());

        expect(result.current.access.phase).toBe("recovering");
        expect(mockSecureValues.get(RECOVERING_KEY)).toBe("1");
      });
    });

    it("persists the flag, and clears it when the recovery ends or the session does", async () => {
      serve(() => ({ status: 200, body: me() }));
      const { result } = await renderSession();
      await waitFor(() => expect(result.current.access.phase).toBe("app"));

      await act(() => result.current.actions.setRecovering(true));
      expect(mockSecureValues.get(RECOVERING_KEY)).toBe("1");
      expect(result.current.access.phase).toBe("recovering");

      await act(() => result.current.actions.setRecovering(false));
      expect(mockSecureValues.has(RECOVERING_KEY)).toBe(false);
      expect(result.current.access.phase).toBe("app");

      await act(async () => auth.emit("PASSWORD_RECOVERY", realSession));
      await waitFor(() => expect(mockSecureValues.get(RECOVERING_KEY)).toBe("1"));

      await act(() => result.current.actions.cerrarSesion());
      expect(mockSecureValues.has(RECOVERING_KEY)).toBe(false);
      expect(result.current.access.phase).toBe("auth");
    });
  });

  it("starts without session when Supabase has none", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const calls = serve(() => ({ status: 200, body: me() }));

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.session.status).toBe("none"));
    expect(result.current.access.phase).toBe("auth");
    expect(calls).toHaveLength(0);
  });

  it("cerrarSesion signs out of Supabase on this device and removes the stored session", async () => {
    serve(() => ({ status: 200, body: me() }));
    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));

    await act(() => result.current.actions.cerrarSesion());

    expect(mockedSignOutLocally).toHaveBeenCalledTimes(1);
    expect(result.current.session.status).toBe("none");
  });

  it("cerrarSesion also signs out of Google, so the next sign-in shows the account picker", async () => {
    serve(() => ({ status: 200, body: me() }));
    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));

    await act(() => result.current.actions.cerrarSesion());

    expect(mockedSignOutFromGoogle).toHaveBeenCalledTimes(1);
    expect(result.current.session.status).toBe("none");
  });

  it("refreshes the token through Supabase after a 401 and retries the request", async () => {
    auth.refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "fresh-token" } },
      error: null,
    });
    const calls = serve((call) =>
      call.headers.Authorization === "Bearer fresh-token"
        ? { status: 200, body: me() }
        : { status: 401, body: { type: "token-invalido", title: "Expired", status: 401 } },
    );

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(calls.map((call) => call.headers.Authorization)).toEqual([
      "Bearer real-token",
      "Bearer fresh-token",
    ]);
    expect(mockedSignOutLocally).not.toHaveBeenCalled();
    expect(result.current.session.status).toBe("present");
  });

  it("signs out when Supabase rejects the refresh token", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { ...realSession, access_token: "revoked-token" } },
      error: null,
    });
    auth.refreshSession.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: new AuthApiError("Invalid Refresh Token", 400, "refresh_token_not_found"),
    });
    const calls = serve(() => ({
      status: 401,
      body: { type: "token-invalido", title: "Revoked", status: 401 },
    }));

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.session.status).toBe("none"));
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockedSignOutLocally).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
    expect(result.current.access.phase).toBe("auth");
  });
});

describe("offline", () => {
  it("ends an offline start in a connection error and recovers on reconnect", async () => {
    onlineManager.setOnline(false);
    let reachable = false;
    const calls = serve(() =>
      reachable ? { status: 200, body: me() } : networkFailure(),
    );

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.access.phase).toBe("error"));
    expect(result.current.me.error).toMatchObject({ type: "sin-conexion" });
    expect(calls).toHaveLength(1);

    reachable = true;
    await act(async () => {
      onlineManager.setOnline(true);
    });

    await waitFor(() => expect(result.current.access.phase).toBe("app"));
    expect(calls).toHaveLength(2);
  });

  it("keeps a cached account usable while offline", async () => {
    let reachable = true;
    serve(() => (reachable ? { status: 200, body: me() } : networkFailure()));
    const { result, queryClient } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));

    reachable = false;
    await act(async () => {
      onlineManager.setOnline(false);
      void queryClient.refetchQueries({ queryKey: queryKeys.me });
    });

    await waitFor(() => expect(result.current.me.error).toMatchObject({ type: "sin-conexion" }));
    expect(result.current.access.phase).toBe("app");
    expect(result.current.me.data).toEqual(me());
  });
});
