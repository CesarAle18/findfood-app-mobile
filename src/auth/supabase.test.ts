import type * as ReactNative from "react-native";

import type { Env } from "@/config/env";

import type * as SupabaseModule from "./supabase";

const mockCreateClient = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  ...jest.requireActual("@supabase/supabase-js"),
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

jest.mock("./secure-storage", () => ({ secureStorage: { name: "secure-storage" } }));

function fakeAuth() {
  return {
    startAutoRefresh: jest.fn(async () => {}),
    stopAutoRefresh: jest.fn(async () => {}),
    refreshSession: jest.fn(async () => ({
      data: { session: { access_token: "refreshed-token" } },
      error: null,
    })),
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
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

/** Evaluates ./supabase in a fresh registry with `env` and the given platform. */
function loadSupabase(env: Env, os: "ios" | "android" | "web" = "ios"): Loaded {
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
    jest.doMock("@/config/env", () => ({ env }));
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
});

describe("with Supabase configuration", () => {
  it("creates the auth client with secure storage and PKCE", () => {
    const client = { auth: fakeAuth() };
    mockCreateClient.mockReturnValue(client);

    const { module } = loadSupabase(REAL_ENV);

    expect(module.supabase).toBe(client);
    expect(mockCreateClient).toHaveBeenCalledTimes(1);
    expect(mockCreateClient).toHaveBeenCalledWith("http://supabase.test", "anon-key", {
      auth: {
        storage: { name: "secure-storage" },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
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
