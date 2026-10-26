import * as Location from "expo-location";

import { ApiError } from "@/api/errors";
import { geocodificar, geocodificarInversa } from "@/services/geo";

import {
  addressQuery,
  clearReverseGeocodeCache,
  geocodeAddress,
  geocodeWithApi,
  reverseGeocodeWithApi,
} from "./geocode";

jest.mock("@/services/geo", () => ({
  ...jest.requireActual<typeof import("@/services/geo")>("@/services/geo"),
  geocodificar: jest.fn(),
  geocodificarInversa: jest.fn(),
}));

const problem = (status: number, type = "x") => new ApiError({ type, status, title: type });

beforeEach(() => {
  jest.mocked(geocodificar).mockReset();
  jest.mocked(geocodificarInversa).mockReset();
  clearReverseGeocodeCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("addressQuery", () => {
  it("adds the country unless the donor typed it", () => {
    expect(addressQuery(" Cra 45 #12-30 ")).toBe("Cra 45 #12-30, Colombia");
    expect(addressQuery("Cra 45 #12-30, Bogotá, colombia")).toBe("Cra 45 #12-30, Bogotá, colombia");
  });
});

describe("geocodeAddress", () => {
  it("answers the first match as {lat, lng}", async () => {
    jest.spyOn(Location, "geocodeAsync").mockResolvedValue([
      { latitude: 4.61, longitude: -74.07 },
      { latitude: 6.24, longitude: -75.58 },
    ]);

    await expect(geocodeAddress("Cra 45 #12-30")).resolves.toEqual({ lat: 4.61, lng: -74.07 });
  });

  it("answers null, never a guessed point, without a match or when the geocoder fails", async () => {
    const geocode = jest.spyOn(Location, "geocodeAsync").mockResolvedValue([]);
    await expect(geocodeAddress("Dirección rara")).resolves.toBeNull();

    geocode.mockRejectedValue(new Error("geocoder unavailable"));
    await expect(geocodeAddress("Cra 45 #12-30")).resolves.toBeNull();
  });

  it("answers null when the match is outside Bogotá's service area", async () => {
    jest.spyOn(Location, "geocodeAsync").mockResolvedValue([{ latitude: 6.24, longitude: -75.58 }]);

    await expect(geocodeAddress("Cra 45 #12-30")).resolves.toBeNull();
  });
});

describe("geocodeWithApi", () => {
  it("answers Google's point and flags centroids as approximate", async () => {
    jest.mocked(geocodificar).mockResolvedValueOnce({
      direccion: "Cra. 45 #12-30",
      ubicacion: { lat: 4.62, lng: -74.08 },
      precision: "RANGE_INTERPOLATED",
    });
    await expect(geocodeWithApi("Cra 45 #12-30")).resolves.toEqual({
      point: { lat: 4.62, lng: -74.08 },
      approximate: false,
    });

    jest.mocked(geocodificar).mockResolvedValueOnce({
      direccion: "Chapinero",
      ubicacion: { lat: 4.64, lng: -74.06 },
      precision: "GEOMETRIC_CENTER",
    });
    await expect(geocodeWithApi("Chapinero")).resolves.toMatchObject({ approximate: true });
  });

  it("answers null when the address does not exist and undefined when the API cannot search", async () => {
    jest.mocked(geocodificar).mockRejectedValueOnce(problem(404, "no-encontrado"));
    await expect(geocodeWithApi("Nada")).resolves.toBeNull();

    for (const failure of [problem(503, "geo-no-disponible"), problem(429), problem(0, "sin-conexion")]) {
      jest.mocked(geocodificar).mockRejectedValueOnce(failure);
      await expect(geocodeWithApi("Cra 45")).resolves.toBeUndefined();
    }
  });
});

describe("reverseGeocodeWithApi", () => {
  it("reuses the answer for a pin dropped on the same spot", async () => {
    jest.mocked(geocodificarInversa).mockResolvedValue({ direccion: "Calle 76 #15-20" });

    await expect(reverseGeocodeWithApi({ lat: 4.650001, lng: -74.06 })).resolves.toBe(
      "Calle 76 #15-20",
    );
    await expect(reverseGeocodeWithApi({ lat: 4.650003, lng: -74.06 })).resolves.toBe(
      "Calle 76 #15-20",
    );
    expect(geocodificarInversa).toHaveBeenCalledTimes(1);
  });

  it("caches 'no address here' but not an unavailable API", async () => {
    jest.mocked(geocodificarInversa).mockRejectedValueOnce(problem(503, "geo-no-disponible"));
    await expect(reverseGeocodeWithApi({ lat: 4.6, lng: -74 })).resolves.toBeUndefined();

    jest.mocked(geocodificarInversa).mockRejectedValueOnce(problem(404, "no-encontrado"));
    await expect(reverseGeocodeWithApi({ lat: 4.6, lng: -74 })).resolves.toBeNull();
    await expect(reverseGeocodeWithApi({ lat: 4.6, lng: -74 })).resolves.toBeNull();
    expect(geocodificarInversa).toHaveBeenCalledTimes(2);
  });
});
