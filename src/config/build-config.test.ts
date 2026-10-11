/**
 * Guards for the native build configuration: the EAS profiles the team relies on exist,
 * and eas.json never inlines the development-only token or the local profile. Remote EAS
 * environment variables are out of reach here; the real protection is that the token is
 * read only under `__DEV__` (proved by `npm run check:release-token`).
 */
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
