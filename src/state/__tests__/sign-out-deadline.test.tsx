/**
 * Offline sign-out end to end through the real session provider and the real
 * `signOutLocally`: only the Supabase client (whose sign-out never settles, like auth-js
 * retrying an expired session's refresh offline), storage and the network are fakes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";

import type { MeDto } from "@/api/types";
import { SIGN_OUT_DEADLINE_MS } from "@/auth/supabase";
import { sessionStore } from "@/auth/session-store";
import { routeForAccess } from "@/navigation/access-route";
import { SessionProvider, useAccess, useSession, useSessionActions } from "@/state/session";
import { meFixture } from "@/test-utils/fixtures";

jest.mock("@/config/env", () => {
  const env = {
    appEnv: "real",
    apiUrl: "http://api.test",
    supabaseUrl: "http://supabase.test",
    supabaseAnonKey: "anon-key",
  };
  return { env, configResult: { ok: true, env } };
});

const mockAuthValues = new Map<string, string>();

jest.mock("@/auth/secure-storage", () => ({
  secureStorage: {
    getItem: async (key: string) => mockAuthValues.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockAuthValues.set(key, value);
    },
    removeItem: async (key: string) => {
      mockAuthValues.delete(key);
    },
  },
}));

jest.mock("@/auth/supabase-fetch", () => ({ createSupabaseFetch: () => fetch }));

jest.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => {},
  deleteItemAsync: async () => {},
}));

const session = { access_token: "expired-token", user: { id: "u-1", email: "maria@correo.com" } };

// Built in the factory: `@/auth/supabase` creates its client while the imports load.
jest.mock("@supabase/supabase-js", () => {
  const auth = {
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: () => {} } } })),
    getSession: jest.fn(async () => ({
      data: {
        session: { access_token: "expired-token", user: { id: "u-1", email: "maria@correo.com" } },
      },
      error: null,
    })),
    refreshSession: jest.fn(),
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
    // Offline with an expired session: never settles within the deadline.
    signOut: jest.fn(() => new Promise<never>(() => {})),
  };
  return {
    ...jest.requireActual("@supabase/supabase-js"),
    createClient: () => ({ auth }),
    mockAuth: auth,
  };
});

const { mockAuth } = jest.requireMock<{ mockAuth: { signOut: jest.Mock } }>(
  "@supabase/supabase-js",
);

const realFetch = globalThis.fetch;

beforeEach(() => {
  mockAuthValues.set("findfood.auth", JSON.stringify(session));
  globalThis.fetch = jest.fn(async () => ({
    status: 200,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(meFixture() satisfies MeDto),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
});

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
  return renderHook(
    () => ({ session: useSession(), access: useAccess(), actions: useSessionActions() }),
    { wrapper: Wrapper },
  );
}

it("ends the session at the deadline when Supabase never answers, and the guards open login", async () => {
  const { result } = await renderSession();
  await waitFor(() => expect(result.current.access.phase).toBe("app"));
  jest.useFakeTimers();

  let done = false;
  let signingOut: Promise<void> = Promise.resolve();
  await act(async () => {
    signingOut = result.current.actions.cerrarSesion().then(() => {
      done = true;
    });
    await jest.advanceTimersByTimeAsync(SIGN_OUT_DEADLINE_MS - 1);
  });
  expect(done).toBe(false);
  expect(result.current.session.status).toBe("present");

  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
    await signingOut;
  });

  expect(done).toBe(true);
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mockAuthValues.has("findfood.auth")).toBe(false);
  expect(sessionStore.getAccessToken()).toBeNull();
  expect(result.current.session.status).toBe("none");
  expect(result.current.access.phase).toBe("auth");
  expect(routeForAccess(result.current.access.phase, result.current.access.activeRole)).toBe(
    "/login",
  );
});
