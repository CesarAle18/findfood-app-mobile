import * as Location from "expo-location";

import {
  GPS_PRECISION_MIN_M,
  getCurrentFix,
  isWithinArrivalRadius,
  needsManualConfirmation,
} from "./current-fix";

const mockedLocation = jest.mocked(Location);

const permission = (status: "granted" | "denied" | "undetermined") =>
  ({ status, granted: status === "granted", canAskAgain: true, expires: "never" }) as never;

const position = (accuracy: number | null) =>
  ({
    coords: {
      latitude: 3.42,
      longitude: -76.54,
      altitude: null,
      accuracy,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 0,
  }) as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission("granted"));
  mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(permission("granted"));
  mockedLocation.getCurrentPositionAsync.mockResolvedValue(position(12));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("getCurrentFix", () => {
  it("reads a precise position without prompting when already allowed", async () => {
    await expect(getCurrentFix()).resolves.toEqual({
      ubicacion: { lat: 3.42, lng: -76.54 },
      precision_m: 12,
    });
    expect(mockedLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedLocation.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.High,
    });
  });

  it("asks for the permission when it was never asked", async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission("undetermined"));

    await expect(getCurrentFix()).resolves.not.toBeNull();
    expect(mockedLocation.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it("is null when the prompt is refused", async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission("undetermined"));
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(permission("denied"));

    await expect(getCurrentFix()).resolves.toBeNull();
    expect(mockedLocation.getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it("is null, without prompting again, when the permission was denied", async () => {
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission("denied"));

    await expect(getCurrentFix()).resolves.toBeNull();
    expect(mockedLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it("is null when the device cannot get a position", async () => {
    mockedLocation.getCurrentPositionAsync.mockRejectedValue(new Error("location off"));

    await expect(getCurrentFix()).resolves.toBeNull();
  });

  it("gives up after the timeout", async () => {
    jest.useFakeTimers();
    mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}));

    const fix = getCurrentFix({ timeoutMs: 5_000 });
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(fix).resolves.toBeNull();
  });

  it("does not count the time the user takes to answer the permission prompt", async () => {
    jest.useFakeTimers();
    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue(permission("undetermined"));
    mockedLocation.requestForegroundPermissionsAsync.mockReturnValue(
      new Promise((resolve) => setTimeout(() => resolve(permission("granted")), 8_000)) as never,
    );

    const fix = getCurrentFix({ timeoutMs: 5_000 });
    await jest.advanceTimersByTimeAsync(8_000);

    await expect(fix).resolves.toEqual({ ubicacion: { lat: 3.42, lng: -76.54 }, precision_m: 12 });
  });
});

describe("needsManualConfirmation", () => {
  const fix = (precision_m: number | null) => ({ ubicacion: { lat: 3.42, lng: -76.54 }, precision_m });

  it.each([
    ["no fix", null, true],
    ["unknown precision", fix(null), true],
    ["too coarse", fix(GPS_PRECISION_MIN_M + 0.1), true],
    ["at the minimum", fix(GPS_PRECISION_MIN_M), false],
    ["precise", fix(8), false],
  ])("%s", (_name, value, expected) => {
    expect(needsManualConfirmation(value)).toBe(expected);
  });
});

describe("isWithinArrivalRadius", () => {
  const stop = { lat: 3.42, lng: -76.54 };
  const fixAt = (lat: number) => ({ ubicacion: { lat, lng: stop.lng }, precision_m: 10 });

  it("accepts a fix within 1 km of the stop", () => {
    expect(isWithinArrivalRadius(fixAt(3.425), stop)).toBe(true);
  });

  it("rejects a fix farther than 1 km", () => {
    expect(isWithinArrivalRadius(fixAt(3.43), stop)).toBe(false);
  });
});
