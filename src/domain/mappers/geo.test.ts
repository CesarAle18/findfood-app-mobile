import {
  BOGOTA_CENTER,
  formatCoordenada,
  formatGeocodedAddress,
  fromLatLng,
  isInServiceArea,
  lineStringToLatLngs,
  regionForPoints,
  toLatLng,
} from "./geo";

describe("toLatLng / fromLatLng", () => {
  it("maps the API's {lat,lng} to the map's {latitude,longitude}", () => {
    expect(toLatLng({ lat: 4.65, lng: -74.06 })).toEqual({ latitude: 4.65, longitude: -74.06 });
  });

  it("maps the map's {latitude,longitude} back to {lat,lng} without extra fields", () => {
    const region = { latitude: 4.7, longitude: -74.1, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    expect(fromLatLng(region)).toStrictEqual({ lat: 4.7, lng: -74.1 });
  });
});

describe("lineStringToLatLngs", () => {
  it("reads GeoJSON [lng, lat] pairs in order", () => {
    expect(
      lineStringToLatLngs({
        type: "LineString",
        coordinates: [
          [-74.06, 4.65],
          [-74.07, 4.66],
        ],
      }),
    ).toEqual([
      { latitude: 4.65, longitude: -74.06 },
      { latitude: 4.66, longitude: -74.07 },
    ]);
  });

  it("returns no points without geometry or coordinates", () => {
    expect(lineStringToLatLngs(null)).toEqual([]);
    expect(lineStringToLatLngs(undefined)).toEqual([]);
    expect(lineStringToLatLngs({ type: "LineString", coordinates: [] })).toEqual([]);
  });
});

describe("regionForPoints", () => {
  it("centers on Bogotá without points", () => {
    const region = regionForPoints([]);
    expect(region.latitude).toBe(BOGOTA_CENTER.latitude);
    expect(region.longitude).toBe(BOGOTA_CENTER.longitude);
    expect(region.latitudeDelta).toBeGreaterThan(0);
  });

  it("centers on a single point with the minimum span", () => {
    const region = regionForPoints([{ latitude: 4.65, longitude: -74.06 }]);
    expect(region).toEqual({
      latitude: 4.65,
      longitude: -74.06,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
  });

  it("spans every point with padding", () => {
    const region = regionForPoints(
      [
        { latitude: 4.6, longitude: -74.1 },
        { latitude: 4.7, longitude: -74.0 },
      ],
      0.5,
    );
    expect(region.latitude).toBeCloseTo(4.65);
    expect(region.longitude).toBeCloseTo(-74.05);
    expect(region.latitudeDelta).toBeCloseTo(0.15);
    expect(region.longitudeDelta).toBeCloseTo(0.15);
  });
});

describe("formatGeocodedAddress", () => {
  const empty = {
    formattedAddress: null,
    street: null,
    streetNumber: null,
    name: null,
    city: null,
  };

  it("prefers the platform's formatted address", () => {
    expect(
      formatGeocodedAddress({ ...empty, formattedAddress: " Cl. 76 #15-20, Bogotá ", street: "Cl. 76" }),
    ).toBe("Cl. 76 #15-20, Bogotá");
  });

  it("builds street, number and city otherwise", () => {
    expect(
      formatGeocodedAddress({ ...empty, street: "Calle 76", streetNumber: "15-20", city: "Bogotá" }),
    ).toBe("Calle 76 15-20, Bogotá");
  });

  it("falls back on the place name, and gives nothing without data", () => {
    expect(formatGeocodedAddress({ ...empty, name: "Parque 93" })).toBe("Parque 93");
    expect(formatGeocodedAddress(empty)).toBeNull();
    expect(formatGeocodedAddress(undefined)).toBeNull();
  });
});

describe("formatCoordenada", () => {
  it("shows a point with 5 decimals (about a metre)", () => {
    expect(formatCoordenada({ lat: 4.65, lng: -74.061234 })).toBe("4.65000, -74.06123");
  });
});

describe("isInServiceArea", () => {
  it("accepts Bogotá and its neighbouring municipalities", () => {
    expect(isInServiceArea({ lat: 4.65, lng: -74.06 })).toBe(true); // Bogotá
    expect(isInServiceArea({ lat: 4.86, lng: -74.05 })).toBe(true); // Chía
    expect(isInServiceArea({ lat: 4.58, lng: -74.22 })).toBe(true); // Soacha
  });

  it("refuses other cities", () => {
    expect(isInServiceArea({ lat: 6.24, lng: -75.58 })).toBe(false); // Medellín
    expect(isInServiceArea({ lat: 4.3, lng: -74.8 })).toBe(false); // Girardot
  });

  it("includes the edges of the area", () => {
    expect(isInServiceArea({ lat: 4.44, lng: -74.3 })).toBe(true);
    expect(isInServiceArea({ lat: 5.0, lng: -73.95 })).toBe(true);
    expect(isInServiceArea({ lat: 5.0001, lng: -74.0 })).toBe(false);
  });
});
