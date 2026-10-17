import { hasGoogleMapsKey } from "./maps";

describe("hasGoogleMapsKey", () => {
  const extra = { googleMaps: { android: true, ios: false } };

  it("answers per platform from the build's extra.googleMaps", () => {
    expect(hasGoogleMapsKey("android", extra)).toBe(true);
    expect(hasGoogleMapsKey("ios", extra)).toBe(false);
  });

  it("is false for a build without any key, and on web", () => {
    expect(hasGoogleMapsKey("android", {})).toBe(false);
    expect(hasGoogleMapsKey("android", undefined)).toBe(false);
    expect(hasGoogleMapsKey("web", extra)).toBe(false);
  });

  it("only trusts a real boolean", () => {
    expect(hasGoogleMapsKey("android", { googleMaps: { android: "true" } })).toBe(false);
  });
});
