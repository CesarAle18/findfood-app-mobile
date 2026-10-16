import { distanceMeters, shouldSend, type LocationSample } from "./throttle";

const OPTIONS = { minIntervalMs: 60_000, minDistanceM: 100 };
const base: LocationSample = { at: 1_000_000, lat: 4.65, lng: -74.06 };

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(base, base)).toBe(0);
  });

  it("measures about 111 km per degree of latitude", () => {
    const meters = distanceMeters(base, { ...base, lat: base.lat + 1 });
    expect(meters).toBeGreaterThan(110_000);
    expect(meters).toBeLessThan(112_000);
  });
});

describe("shouldSend", () => {
  it("sends the first sample", () => {
    expect(shouldSend(null, base, OPTIONS)).toBe(true);
  });

  it("holds a nearby sample taken shortly after the last one", () => {
    const next = { at: base.at + 30_000, lat: base.lat + 0.0001, lng: base.lng };
    expect(shouldSend(base, next, OPTIONS)).toBe(false);
  });

  it("sends once a minute has passed, even without moving", () => {
    expect(shouldSend(base, { ...base, at: base.at + 60_000 }, OPTIONS)).toBe(true);
  });

  it("sends after moving 100 m, even within the minute", () => {
    // ~0.001° of latitude is ~111 m.
    const next = { at: base.at + 5_000, lat: base.lat + 0.001, lng: base.lng };
    expect(shouldSend(base, next, OPTIONS)).toBe(true);
  });

  it("holds a sample older than the last one sent", () => {
    expect(shouldSend(base, { ...base, at: base.at - 120_000 }, OPTIONS)).toBe(false);
  });
});
