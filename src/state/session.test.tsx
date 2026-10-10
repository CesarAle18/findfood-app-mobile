import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import type { PropsWithChildren } from "react";

import type { MeDto } from "@/api/types";
import { sessionStore } from "@/auth/session-store";
import { supabase } from "@/auth/supabase";
import { env } from "@/config/env";
import { queryKeys } from "@/services/query-keys";

import { SessionProvider, useAccess, useMe, useSession, useSessionActions } from "./session";

jest.mock("@/config/env", () => ({
  env: { appEnv: "local", apiUrl: "http://api.test", devToken: "dev-token" },
}));

jest.mock("@/auth/supabase", () => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  const subscription = {
    unsubscribe: jest.fn(() => {
      listener = null;
    }),
  };
  const auth = {
    subscription,
    getSession: jest.fn(),
    onAuthStateChange: jest.fn((callback: typeof listener) => {
      listener = callback;
      return { data: { subscription } };
    }),
    signOut: jest.fn(async () => {
      listener?.("SIGNED_OUT", null);
      return { error: null };
    }),
    emit: (event: string, session: unknown) => listener?.(event, session),
  };
  return { supabase: { auth }, refreshAccessToken: jest.fn(async () => null) };
});

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
  onAuthStateChange: jest.Mock;
  signOut: jest.Mock;
  emit(event: string, session: unknown): void;
}

const auth = (supabase as unknown as { auth: FakeAuth }).auth;
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
});

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
    expect(auth.signOut).not.toHaveBeenCalled();
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
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("starts without session when Supabase has none", async () => {
    auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const calls = serve(() => ({ status: 200, body: me() }));

    const { result } = await renderSession();

    await waitFor(() => expect(result.current.session.status).toBe("none"));
    expect(result.current.access.phase).toBe("auth");
    expect(calls).toHaveLength(0);
  });

  it("cerrarSesion signs out of Supabase on this device only", async () => {
    serve(() => ({ status: 200, body: me() }));
    const { result } = await renderSession();
    await waitFor(() => expect(result.current.access.phase).toBe("app"));

    await act(() => result.current.actions.cerrarSesion());

    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(result.current.session.status).toBe("none");
  });
});
