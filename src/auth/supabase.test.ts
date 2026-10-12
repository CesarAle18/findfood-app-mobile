import { AuthRetryableFetchError } from "@supabase/supabase-js";
import type * as ReactNative from "react-native";

import type { ConfigError, ConfigResult, Env } from "@/config/env";

import type * as SupabaseModule from "./supabase";

const mockCreateClient = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  ...jest.requireActual("@supabase/supabase-js"),
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

// Plain functions, not jest.fn: restoreAllMocks would drop their implementations.
const mockStoredValues = new Map<string, string>();
const mockFailingKeys = new Set<string>();
const mockStorage = {
  getItem: async (key: string) => mockStoredValues.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    mockStoredValues.set(key, value);
  },
  removeItem: async (key: string) => {
    if (mockFailingKeys.has(key)) throw new Error("Keychain unavailable");
    mockStoredValues.delete(key);
  },
};

jest.mock("./secure-storage", () => ({ secureStorage: mockStorage }));

const mockSupabaseFetch = () => Promise.reject(new Error("Not used by these tests"));

jest.mock("./supabase-fetch", () => ({ createSupabaseFetch: () => mockSupabaseFetch }));

function fakeAuth() {
  return {
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
    refreshSession: jest.fn(async () => ({
      data: { session: { access_token: "refreshed-token" } },
      error: null,
    })),
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    // Like auth-js when reading the current session fails first: nothing is removed.
    signOut: jest.fn(async (): Promise<{ error: Error | null }> => ({ error: null })),
  };
}

const REAL_ENV: Env = {
  appEnv: "real",
  apiUrl: "http://api.test",
  supabaseUrl: "http://supabase.test",
  supabaseAnonKey: "anon-key",
};

interface Loaded {
  module: typeof SupabaseModule;
  addAppStateListener: jest.SpyInstance;
  emitAppState: (state: ReactNative.AppStateStatus) => void;
}

/**
 * Evaluates ./supabase in a fresh registry with `env` and the given platform. `configResult`
 * is the valid result for `env` unless a test passes its own.
 */
function loadSupabase(
  env: Env,
  os: "ios" | "android" | "web" = "ios",
  configResult: ConfigResult = { ok: true, env },
): Loaded {
  let loaded: Loaded | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppState, Platform } = require("react-native") as typeof ReactNative;
    jest.replaceProperty(Platform, "OS", os);
    let listener: (state: ReactNative.AppStateStatus) => void = () => {};
    const addAppStateListener = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, handler) => {
        listener = handler;
        return { remove: jest.fn() } as unknown as ReactNative.NativeEventSubscription;
      });
    jest.doMock("@/config/env", () => ({ env, configResult }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("./supabase") as typeof SupabaseModule;
    loaded = { module, addAppStateListener, emitAppState: (state) => listener(state) };
  });
  if (!loaded) throw new Error("./supabase did not load");
  return loaded;
}

afterEach(() => {
  jest.restoreAllMocks();
  mockCreateClient.mockReset();
  mockStoredValues.clear();
  mockFailingKeys.clear();
});

describe("without Supabase configuration", () => {
  it.each<[string, Env]>([
    ["the local profile", { appEnv: "local", apiUrl: "http://api.test", devToken: "dev" }],
    ["a missing anon key", { ...REAL_ENV, supabaseAnonKey: undefined }],
    ["a missing URL", { ...REAL_ENV, supabaseUrl: undefined }],
  ])("has no client with %s", async (_label, env) => {
    const { module, addAppStateListener } = loadSupabase(env);

    expect(module.supabase).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(addAppStateListener).not.toHaveBeenCalled();
    await expect(module.refreshAccessToken()).resolves.toBeNull();
  });

  it("has no client when the configuration is invalid", async () => {
    const actual = jest.requireActual<{ ConfigError: typeof ConfigError }>("@/config/env");
    const invalid: ConfigResult = {
      ok: false,
      error: new actual.ConfigError(["EXPO_PUBLIC_API_URL is missing."]),
    };

    // Even Supabase values that look usable are ignored: the app shows the configuration
    // error instead of starting.
    const { module, addAppStateListener } = loadSupabase(REAL_ENV, "ios", invalid);

    expect(module.supabase).toBeNull();
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(addAppStateListener).not.toHaveBeenCalled();
    await expect(module.refreshAccessToken()).resolves.toBeNull();
  });

  it("has nothing to sign out of", async () => {
    mockStoredValues.set("findfood.auth", "{}");
    const { module } = loadSupabase({
      appEnv: "local",
      apiUrl: "http://api.test",
      devToken: "dev",
    });

    await expect(module.signOutLocally()).resolves.toBeUndefined();
    expect(mockStoredValues.has("findfood.auth")).toBe(true);
  });
});

describe("signOutLocally", () => {
  const FLOW_A = "0123456789abcdef0123456789abcdef";
  const FLOW_B = "fedcba9876543210fedcba9876543210";

  /** What auth-js 2.117.3 persists for a session with two pending PKCE flows. */
  function seedStoredSession(flowIndex = JSON.stringify([FLOW_A, FLOW_B])) {
    mockStoredValues.set("findfood.auth", '{"access_token":"stale"}');
    mockStoredValues.set("findfood.auth-user", '{"id":"u-1"}');
    mockStoredValues.set("findfood.auth-code-verifier", '"verifier-b"');
    mockStoredValues.set("findfood.auth-flows-code-verifier", flowIndex);
    mockStoredValues.set(`findfood.auth-flow-${FLOW_A}-code-verifier`, '"verifier-a"');
    mockStoredValues.set(`findfood.auth-flow-${FLOW_B}-code-verifier`, '"verifier-b"');
    mockStoredValues.set("another-key", "kept");
  }

  /** A native client with the app in the foreground (its ticker running). */
  function loadClient() {
    const auth = fakeAuth();
    mockCreateClient.mockReturnValue({ auth });
    const { module, emitAppState } = loadSupabase(REAL_ENV);
    emitAppState("active");
    auth.startAutoRefresh.mockClear();
    return {
      auth,
      signOutLocally: module.signOutLocally,
      deadlineMs: module.SIGN_OUT_DEADLINE_MS,
    };
  }

  it("signs out on this device and removes every key auth-js stores", async () => {
    seedStoredSession();
    const { auth, signOutLocally } = loadClient();

    await signOutLocally();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect([...mockStoredValues.keys()]).toEqual(["another-key"]);
  });

  it("removes the stored session when sign-out returns an error", async () => {
    // e.g. an expired session whose refresh fails offline: auth-js returns the error
    // before removing anything.
    seedStoredSession();
    const { auth, signOutLocally } = loadClient();
    auth.signOut.mockResolvedValue({
      error: new AuthRetryableFetchError("Network request failed", 0),
    });

    await expect(signOutLocally()).resolves.toBeUndefined();

    expect([...mockStoredValues.keys()]).toEqual(["another-key"]);
  });

  it("removes the stored session when sign-out throws", async () => {
    seedStoredSession();
    const { auth, signOutLocally } = loadClient();
    auth.signOut.mockRejectedValue(new Error("boom"));

    await expect(signOutLocally()).resolves.toBeUndefined();

    expect([...mockStoredValues.keys()]).toEqual(["another-key"]);
  });

  it("removes the stored session only once sign-out has finished", async () => {
    seedStoredSession();
    const { auth, signOutLocally } = loadClient();
    let finishSignOut: () => void = () => {};
    auth.signOut.mockReturnValue(
      new Promise((resolve) => {
        finishSignOut = () => resolve({ error: null });
      }),
    );

    const done = signOutLocally();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(mockStoredValues.has("findfood.auth")).toBe(true);

    finishSignOut();
    await done;
    expect(mockStoredValues.has("findfood.auth")).toBe(false);
  });

  it("pauses the refresh ticker until sign-out has finished", async () => {
    seedStoredSession();
    const { auth, signOutLocally } = loadClient();

    await signOutLocally();

    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signOut.mock.invocationCallOrder[0],
    );
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.startAutoRefresh.mock.invocationCallOrder[0]).toBeGreaterThan(
      auth.signOut.mock.invocationCallOrder[0],
    );
  });

  it("leaves the ticker paused when the app went to the background meanwhile", async () => {
    const auth = fakeAuth();
    mockCreateClient.mockReturnValue({ auth });
    const { module, emitAppState } = loadSupabase(REAL_ENV);
    emitAppState("background");

    await module.signOutLocally();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  it("leaves the ticker to auth-js on web", async () => {
    const auth = fakeAuth();
    mockCreateClient.mockReturnValue({ auth });
    const { module } = loadSupabase(REAL_ENV, "web");

    await module.signOutLocally();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    expect(auth.startAutoRefresh).not.toHaveBeenCalled();
  });

  describe("when Supabase's sign-out hangs", () => {
    // e.g. offline with an expired session: auth-js retries the refresh inside signOut.
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function hangingSignOut(auth: ReturnType<typeof fakeAuth>) {
      let settle: () => void = () => {};
      auth.signOut.mockReturnValue(
        new Promise((resolve) => {
          settle = () => resolve({ error: null });
        }),
      );
      return () => settle();
    }

    it("stops waiting at the deadline and removes the stored session anyway", async () => {
      seedStoredSession();
      const { auth, signOutLocally, deadlineMs } = loadClient();
      hangingSignOut(auth);
      let done = false;

      const signingOut = signOutLocally().then(() => {
        done = true;
      });
      await jest.advanceTimersByTimeAsync(deadlineMs - 1);
      expect(done).toBe(false);
      expect(mockStoredValues.has("findfood.auth")).toBe(true);

      await jest.advanceTimersByTimeAsync(1);
      await signingOut;

      expect(done).toBe(true);
      expect([...mockStoredValues.keys()]).toEqual(["another-key"]);
      // The ticker stays paused while auth-js is still signing out.
      expect(auth.startAutoRefresh).not.toHaveBeenCalled();
    });

    it("removes a session a late sign-out stored again after the deadline", async () => {
      seedStoredSession();
      const { auth, signOutLocally, deadlineMs } = loadClient();
      const settle = hangingSignOut(auth);

      const signingOut = signOutLocally();
      await jest.advanceTimersByTimeAsync(deadlineMs);
      await signingOut;
      expect(mockStoredValues.has("findfood.auth")).toBe(false);

      // Its refresh succeeded once the network was back, and stored the session again.
      mockStoredValues.set("findfood.auth", '{"access_token":"refreshed"}');
      mockStoredValues.set("findfood.auth-user", '{"id":"u-1"}');
      settle();
      await jest.advanceTimersByTimeAsync(0);

      expect([...mockStoredValues.keys()]).toEqual(["another-key"]);
      expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("never rejects and removes every other key when one removal fails", async () => {
    seedStoredSession();
    mockFailingKeys.add("findfood.auth-user");
    const { signOutLocally } = loadClient();

    await expect(signOutLocally()).resolves.toBeUndefined();

    expect([...mockStoredValues.keys()].sort()).toEqual(["another-key", "findfood.auth-user"]);
  });

  it.each([
    ["not JSON", "[oops"],
    ["not a list", '{"0":"x"}'],
    ["invalid ids", JSON.stringify(["short", 42, "../escape-attempt", null])],
  ])("ignores a PKCE flow index that is %s", async (_label, flowIndex) => {
    seedStoredSession(flowIndex);
    const { signOutLocally } = loadClient();

    await expect(signOutLocally()).resolves.toBeUndefined();

    expect(mockStoredValues.has("findfood.auth")).toBe(false);
    expect(mockStoredValues.has("findfood.auth-flows-code-verifier")).toBe(false);
    // Slots of flows the index no longer lists cannot be found (auth-js has the same limit).
    expect(mockStoredValues.has(`findfood.auth-flow-${FLOW_A}-code-verifier`)).toBe(true);
  });

  it("still removes the slots of the valid ids next to invalid ones", async () => {
    seedStoredSession(JSON.stringify([FLOW_A, "bad id"]));
    const { signOutLocally } = loadClient();

    await signOutLocally();

    expect(mockStoredValues.has(`findfood.auth-flow-${FLOW_A}-code-verifier`)).toBe(false);
    expect(mockStoredValues.has(`findfood.auth-flow-${FLOW_B}-code-verifier`)).toBe(true);
  });
});

describe("with Supabase configuration", () => {
  it("creates the auth client with secure storage, a known key, PKCE and bounded fetch", () => {
    const client = { auth: fakeAuth() };
    mockCreateClient.mockReturnValue(client);

    const { module } = loadSupabase(REAL_ENV);

    expect(module.supabase).toBe(client);
    expect(module.AUTH_STORAGE_KEY).toBe("findfood.auth");
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith("http://supabase.test", "anon-key", {
      auth: {
        storage: mockStorage,
        storageKey: "findfood.auth",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
      global: { fetch: mockSupabaseFetch },
    });
  });

  it("runs the refresh ticker only while the app is in the foreground", () => {
    const auth = fakeAuth();
    mockCreateClient.mockReturnValue({ auth });

    const { addAppStateListener, emitAppState } = loadSupabase(REAL_ENV, "android");

    expect(addAppStateListener).toHaveBeenCalledTimes(1);
    expect(addAppStateListener).toHaveBeenCalledWith("change", expect.any(Function));
    emitAppState("active");
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
    expect(auth.stopAutoRefresh).not.toHaveBeenCalled();
    emitAppState("background");
    emitAppState("inactive");
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(2);
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);
  });

  it("leaves the ticker alone on web", () => {
    mockCreateClient.mockReturnValue({ auth: fakeAuth() });

    const { addAppStateListener } = loadSupabase(REAL_ENV, "web");

    expect(addAppStateListener).not.toHaveBeenCalled();
  });

  it("refreshes the access token through Supabase", async () => {
    const auth = fakeAuth();
    mockCreateClient.mockReturnValue({ auth });

    const { module } = loadSupabase(REAL_ENV);

    await expect(module.refreshAccessToken()).resolves.toBe("refreshed-token");
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });
});
