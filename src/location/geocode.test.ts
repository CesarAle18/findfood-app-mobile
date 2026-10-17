import * as Location from "expo-location";

import { addressQuery, geocodeAddress } from "./geocode";

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
});
