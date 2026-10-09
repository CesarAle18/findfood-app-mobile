import type * as EnvModule from "./env";

type RawEnv = EnvModule.RawEnv;

type PublicVar =
  | "EXPO_PUBLIC_APP_ENV"
  | "EXPO_PUBLIC_API_URL"
  | "EXPO_PUBLIC_SUPABASE_URL"
  | "EXPO_PUBLIC_SUPABASE_ANON_KEY"
  | "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"
  | "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"
  | "EXPO_PUBLIC_DEV_TOKEN";

type PublicVars = Partial<Record<PublicVar, string>>;

const REAL_VARS: PublicVars = {
  EXPO_PUBLIC_API_URL: "https://api.findfood.test",
  EXPO_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

const REAL_RAW: RawEnv = {
  apiUrl: "https://api.findfood.test",
  supabaseUrl: "https://project.supabase.co",
  supabaseAnonKey: "anon-key",
};

const LOCAL_RAW: RawEnv = {
  appEnv: "local",
  apiUrl: "http://192.168.1.10:3000",
  devToken: "header.payload.signature",
};

// `__DEV__` is a writable global under jest-expo, typed as a const by react-native.
function setDev(value: boolean) {
  Object.assign(globalThis, { __DEV__: value });
}

/**
 * Evaluates `./env` in an isolated registry with exactly `vars` as the public
 * environment, so the module-level `env` export is built from them.
 */
function loadEnvModule(vars: PublicVars, isDev = true): typeof EnvModule {
  const saved = { ...process.env };
  const savedDev = __DEV__;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("EXPO_PUBLIC_")) delete process.env[key];
  }
  Object.assign(process.env, vars);
  setDev(isDev);
  try {
    let loaded: typeof EnvModule | undefined;
    jest.isolateModules(() => {
      // `import()` is left untransformed under jest-expo and would need
      // --experimental-vm-modules; require re-evaluates the module synchronously.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require("./env") as typeof EnvModule;
    });
    if (!loaded) throw new Error("./env did not load");
    return loaded;
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
    setDev(savedDev);
  }
}

function expectLoadToThrowConfigError(vars: PublicVars, isDev = true) {
  let thrown: unknown;
  try {
    loadEnvModule(vars, isDev);
  } catch (error) {
    thrown = error;
  }
  // Each isolated load has its own ConfigError class, so match by name.
  expect(thrown).toMatchObject({ name: "ConfigError" });
}

describe("readEnv", () => {
  let readEnv: typeof EnvModule.readEnv;
  let ConfigError: typeof EnvModule.ConfigError;

  beforeAll(() => {
    ({ readEnv, ConfigError } = loadEnvModule(REAL_VARS));
  });

  function configError(raw: RawEnv, isDev = true): EnvModule.ConfigError {
    try {
      readEnv(raw, isDev);
    } catch (error) {
      if (error instanceof ConfigError) return error;
      throw error;
    }
    throw new Error("Expected readEnv to throw a ConfigError");
  }

  it("defaults to the real profile when EXPO_PUBLIC_APP_ENV is unset or empty", () => {
    expect(readEnv(REAL_RAW, true).appEnv).toBe("real");
    expect(readEnv({ ...REAL_RAW, appEnv: "" }, true).appEnv).toBe("real");
  });

  it("returns the real profile with optional values left undefined", () => {
    expect(
      readEnv(
        { ...REAL_RAW, googleWebClientId: "", googleIosClientId: "  " },
        true,
      ),
    ).toEqual({
      appEnv: "real",
      apiUrl: "https://api.findfood.test",
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "anon-key",
      googleWebClientId: undefined,
      googleIosClientId: undefined,
      devToken: undefined,
    });
  });

  it("keeps the Google client IDs when they are set", () => {
    const env = readEnv(
      { ...REAL_RAW, googleWebClientId: "web-id", googleIosClientId: "ios-id" },
      false,
    );
    expect(env.googleWebClientId).toBe("web-id");
    expect(env.googleIosClientId).toBe("ios-id");
  });

  it("strips trailing slashes from the API and Supabase URLs", () => {
    const env = readEnv(
      {
        ...REAL_RAW,
        apiUrl: "https://api.findfood.test/base//",
        supabaseUrl: "https://project.supabase.co/",
      },
      true,
    );
    expect(env.apiUrl).toBe("https://api.findfood.test/base");
    expect(env.supabaseUrl).toBe("https://project.supabase.co");
  });

  it.each(["not a url", "ftp://api.findfood.test", "https://", "https://api.test?x=1"])(
    "rejects %p as EXPO_PUBLIC_API_URL",
    (apiUrl) => {
      expect(configError({ ...REAL_RAW, apiUrl }).message).toContain(
        "EXPO_PUBLIC_API_URL",
      );
    },
  );

  it("rejects a Supabase URL that is not http(s)", () => {
    expect(
      configError({ ...REAL_RAW, supabaseUrl: "project.supabase.co" }).message,
    ).toContain("EXPO_PUBLIC_SUPABASE_URL");
  });

  it.each([
    ["apiUrl", "EXPO_PUBLIC_API_URL"],
    ["supabaseUrl", "EXPO_PUBLIC_SUPABASE_URL"],
    ["supabaseAnonKey", "EXPO_PUBLIC_SUPABASE_ANON_KEY"],
  ] as const)("requires %s in the real profile", (field, variable) => {
    const error = configError({ ...REAL_RAW, [field]: undefined });
    expect(error.problems).toHaveLength(1);
    expect(error.message).toContain(variable);
  });

  it("treats whitespace-only values as missing", () => {
    expect(configError({ ...REAL_RAW, supabaseAnonKey: "   " }).message).toContain(
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    );
  });

  it("reports every missing variable in one error with setup guidance", () => {
    const error = configError({});
    expect(error.problems).toHaveLength(3);
    expect(error.message).toContain("EXPO_PUBLIC_API_URL");
    expect(error.message).toContain("EXPO_PUBLIC_SUPABASE_URL");
    expect(error.message).toContain("EXPO_PUBLIC_SUPABASE_ANON_KEY");
    expect(error.message).toContain(".env.example");
    expect(error.message).toContain("npm run start:local");
    expect(error.message).toContain("npm run start:real");
  });

  it("rejects an unknown profile", () => {
    expect(configError({ ...REAL_RAW, appEnv: "staging" }).message).toContain(
      "EXPO_PUBLIC_APP_ENV",
    );
  });

  it("accepts the local profile without Supabase and exposes the dev token", () => {
    expect(readEnv(LOCAL_RAW, true)).toEqual({
      appEnv: "local",
      apiUrl: "http://192.168.1.10:3000",
      supabaseUrl: undefined,
      supabaseAnonKey: undefined,
      googleWebClientId: undefined,
      googleIosClientId: undefined,
      devToken: "header.payload.signature",
    });
  });

  it("requires a dev token in the local profile and says how to generate it", () => {
    const error = configError({ ...LOCAL_RAW, devToken: undefined });
    expect(error.message).toContain("EXPO_PUBLIC_DEV_TOKEN");
    expect(error.message).toContain("npm run start:local");
  });

  it("rejects the local profile outside development", () => {
    const error = configError(LOCAL_RAW, false);
    expect(error.problems).toHaveLength(1);
    expect(error.message).toMatch(/development/i);
  });

  it("never returns a dev token for the real profile", () => {
    const raw = { ...REAL_RAW, devToken: "header.payload.signature" };
    expect(readEnv(raw, true).devToken).toBeUndefined();
    expect(readEnv(raw, false).devToken).toBeUndefined();
  });
});

describe("env", () => {
  it("is built from the EXPO_PUBLIC_* variables", () => {
    const { env } = loadEnvModule({
      EXPO_PUBLIC_APP_ENV: "local",
      EXPO_PUBLIC_API_URL: "http://192.168.1.10:3000/",
      EXPO_PUBLIC_DEV_TOKEN: "header.payload.signature",
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: "web-id",
    });
    expect(env).toMatchObject({
      appEnv: "local",
      apiUrl: "http://192.168.1.10:3000",
      devToken: "header.payload.signature",
      googleWebClientId: "web-id",
    });
  });

  it("ignores EXPO_PUBLIC_DEV_TOKEN when __DEV__ is false", () => {
    const { env } = loadEnvModule(
      { ...REAL_VARS, EXPO_PUBLIC_DEV_TOKEN: "header.payload.signature" },
      false,
    );
    expect(env.appEnv).toBe("real");
    expect(env.devToken).toBeUndefined();
  });

  it("imports with the defaults from jest.setup.ts", () => {
    let loaded: typeof EnvModule | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require("@/config/env") as typeof EnvModule;
    });
    expect(loaded?.env.apiUrl).toEqual(expect.any(String));
  });

  it("fails at import time when the configuration is invalid", () => {
    expectLoadToThrowConfigError({
      EXPO_PUBLIC_API_URL: REAL_VARS.EXPO_PUBLIC_API_URL,
    });
    expectLoadToThrowConfigError(
      {
        EXPO_PUBLIC_APP_ENV: "local",
        EXPO_PUBLIC_API_URL: "http://192.168.1.10:3000",
        EXPO_PUBLIC_DEV_TOKEN: "header.payload.signature",
      },
      false,
    );
  });
});
