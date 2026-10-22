import { act, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";

import { api } from "@/api";
import { supabase } from "@/auth/supabase";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { renderWithClient } from "@/test-utils/query";

import { LIVE_EVENT, toLivePosition, useLiveRoute } from "./live-route";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockChannel = { subscribe: jest.fn(), send: jest.fn(async () => "ok") };
jest.mock("@/auth/supabase", () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(async () => "ok"),
  },
}));

const mockedApi = api as unknown as ApiMock;
const watch = jest.mocked(Location.watchPositionAsync);
const permissions = jest.mocked(Location.useForegroundPermissions);
const defaultPermissions = permissions.getMockImplementation()!;

function grantLocation() {
  const granted = { status: "granted", granted: true, canAskAgain: true, expires: "never" };
  permissions.mockImplementation(() => [
    granted as never,
    jest.fn(async () => granted as never),
    jest.fn(async () => granted as never),
  ]);
}

function fix(latitude: number, longitude: number, extra: Partial<Location.LocationObjectCoords> = {}) {
  return {
    timestamp: Date.parse("2026-10-21T20:00:00Z"),
    coords: {
      latitude,
      longitude,
      altitude: null,
      accuracy: 6,
      altitudeAccuracy: null,
      heading: 90,
      speed: 10,
      ...extra,
    },
  } as Location.LocationObject;
}

beforeEach(() => {
  resetApiMock(mockedApi);
  jest.clearAllMocks();
});

afterEach(() => {
  permissions.mockImplementation(defaultPermissions);
});

describe("toLivePosition", () => {
  it("speaks the panel's contract: km/h, and null for what the platform does not know", () => {
    expect(toLivePosition(fix(4.65, -74.06))).toEqual({
      lat: 4.65,
      lng: -74.06,
      rumbo: 90,
      velocidad_kmh: 36,
      precision_m: 6,
      at: "2026-10-21T20:00:00.000Z",
    });
    expect(toLivePosition(fix(4.65, -74.06, { heading: -1, speed: -1, accuracy: null }))).toMatchObject({
      rumbo: null,
      velocidad_kmh: null,
      precision_m: null,
    });
  });
});

describe("useLiveRoute", () => {
  it("without location permission only asks the API for the estimate from the last sample", async () => {
    const { result } = await renderWithClient(() => useLiveRoute("r-1"));

    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledWith("/rutas/r-1/seguimiento", expect.anything()));
    expect(mockedApi.get.mock.calls[0][1]).toMatchObject({ query: { lat: undefined, lng: undefined } });
    expect(watch).not.toHaveBeenCalled();
    expect(supabase!.channel).not.toHaveBeenCalled();
    expect(result.current.position).toBeNull();
    expect(result.current.gate).not.toBe("granted");
  });

  it("does nothing without a route in progress", async () => {
    grantLocation();
    await renderWithClient(() => useLiveRoute(null));

    expect(watch).not.toHaveBeenCalled();
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("shares each fix on the route's private channel and estimates from it", async () => {
    const remove = jest.fn();
    let onFix: (location: Location.LocationObject) => void = () => {};
    watch.mockImplementationOnce(async (_options, callback) => {
      onFix = callback;
      return { remove };
    });
    mockedApi.get.mockResolvedValue({ tramo: null });
    grantLocation();
    const { result, unmount } = await renderWithClient(() => useLiveRoute("r-1"));

    expect(supabase!.channel).toHaveBeenCalledWith("ruta:r-1", { config: { private: true } });
    expect(watch.mock.calls[0][0]).toMatchObject({ timeInterval: 5_000, distanceInterval: 10 });

    await act(async () => onFix(fix(4.65, -74.06)));

    expect(result.current.position).toMatchObject({ lat: 4.65, lng: -74.06 });
    expect(mockChannel.send).toHaveBeenCalledWith({
      type: "broadcast",
      event: LIVE_EVENT,
      payload: expect.objectContaining({ lat: 4.65, lng: -74.06, rumbo: 90 }),
    });
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith("/rutas/r-1/seguimiento", {
        query: { lat: 4.65, lng: -74.06 },
        signal: expect.anything(),
      }),
    );

    await unmount();
    expect(remove).toHaveBeenCalled();
    expect(supabase!.removeChannel).toHaveBeenCalledWith(mockChannel);
  });
});
