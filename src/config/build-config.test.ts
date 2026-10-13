/**
 * Guards for the native build configuration: the EAS profiles the team relies on exist,
 * and eas.json never inlines the development-only token or the local profile. Remote EAS
 * environment variables are out of reach here; the real protection is that the token is
 * read only under `__DEV__` (proved by `npm run check:release-token`).
 */
import type { ConfigContext } from "expo/config";

import appConfig from "../../app.config";
import appJson from "../../app.json";
import easJson from "../../eas.json";

type BuildProfile = {
  developmentClient?: boolean;
  distribution?: string;
  environment?: string;
  env?: Record<string, string>;
  android?: { buildType?: string };
};

const profiles = easJson.build as Record<string, BuildProfile>;

describe("app.json", () => {
  it("declares the native identifiers", () => {
    expect(appJson.expo.android.package).toBe("co.findfood.app");
    expect(appJson.expo.ios.bundleIdentifier).toBe("co.findfood.app");
  });

  it("loads the dev client plugin", () => {
    expect(appJson.expo.plugins).toContain("expo-dev-client");
  });
});

describe("app.config.ts", () => {
  const GOOGLE_PLUGIN = "@react-native-google-signin/google-signin";
  const IOS_CLIENT_ID = "123456789-abcdef.apps.googleusercontent.com";
  const originalIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  /** The config Expo resolves: app.json's `expo` passed through app.config.ts. */
  function resolveConfig(iosClientId: string | undefined) {
    if (iosClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = iosClientId;
    const context = { config: structuredClone(appJson.expo) } as unknown as ConfigContext;
    return appConfig(context);
  }

  afterEach(() => {
    if (originalIosClientId === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = originalIosClientId;
  });

  it("keeps everything app.json declares", () => {
    expect(resolveConfig(undefined)).toEqual(appJson.expo);
  });

  it("adds Google Sign-In's URL scheme for iOS, derived from the iOS client id", () => {
    const { plugins } = resolveConfig(` ${IOS_CLIENT_ID} `);

    expect(plugins).toEqual([
      ...appJson.expo.plugins,
      [GOOGLE_PLUGIN, { iosUrlScheme: "com.googleusercontent.apps.123456789-abcdef" }],
    ]);
  });

  it("leaves the plugin out without an iOS client id (Android needs no native setup)", () => {
    expect(JSON.stringify(resolveConfig("").plugins)).not.toContain(GOOGLE_PLUGIN);
    expect(JSON.stringify(appJson.expo.plugins)).not.toContain(GOOGLE_PLUGIN);
  });

  it("fails the build on an iOS client id with the wrong shape", () => {
    expect(() => resolveConfig("com.googleusercontent.apps.123")).toThrow(
      /EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID/,
    );
  });
});

describe("eas.json", () => {
  it("builds an installable development APK with the dev client", () => {
    expect(profiles.development).toMatchObject({
      developmentClient: true,
      distribution: "internal",
      environment: "development",
      android: { buildType: "apk" },
    });
  });

  it("builds an internal preview APK and a store bundle for production", () => {
    expect(profiles.preview).toMatchObject({
      distribution: "internal",
      environment: "preview",
      android: { buildType: "apk" },
    });
    expect(profiles.production).toMatchObject({
      environment: "production",
      android: { buildType: "app-bundle" },
    });
    expect(profiles.preview.developmentClient).not.toBe(true);
    expect(profiles.production.developmentClient).not.toBe(true);
  });

  it.each(Object.keys(profiles))("never sets the dev token or the local profile in %s", (name) => {
    const env = profiles[name].env ?? {};
    expect(env).not.toHaveProperty("EXPO_PUBLIC_DEV_TOKEN");
    expect(env.EXPO_PUBLIC_APP_ENV).not.toBe("local");
  });
});
