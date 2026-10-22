import { api } from "@/api";
import { resetApiMock, sentRequests, type ApiMock } from "@/test-utils/api";

import {
  autocompletarDireccion,
  geocodificar,
  geocodificarInversa,
  getLugar,
  isApproximate,
} from "./geo";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const sesion = "0b9f1c2e-5d7a-4f4e-9c1a-3b2d1e0f9a8b";

beforeEach(() => resetApiMock(mockedApi));

describe("geo service", () => {
  it("asks /geo for suggestions, with the session and an optional bias point", async () => {
    const signal = new AbortController().signal;
    await autocompletarDireccion("Calle 72", sesion, { lat: 4.6, lng: -74.1 }, signal);
    await autocompletarDireccion("Calle 72", sesion);

    expect(sentRequests(mockedApi)).toEqual([
      {
        method: "get",
        path: "/geo/autocompletar",
        options: { query: { q: "Calle 72", sesion, lat: 4.6, lng: -74.1 }, signal },
      },
      {
        method: "get",
        path: "/geo/autocompletar",
        options: { query: { q: "Calle 72", sesion, lat: undefined, lng: undefined } },
      },
    ]);
  });

  it("closes the session with the picked place, and geocodes both ways", async () => {
    await getLugar("ChIJ/72", sesion);
    await geocodificar("Cra 45 #12-30");
    await geocodificarInversa({ lat: 4.6, lng: -74.1 });

    expect(sentRequests(mockedApi)).toEqual([
      { method: "get", path: "/geo/lugares/ChIJ%2F72", options: { query: { sesion } } },
      { method: "get", path: "/geo/geocodificar", options: { query: { direccion: "Cra 45 #12-30" } } },
      { method: "get", path: "/geo/inversa", options: { query: { lat: 4.6, lng: -74.1 } } },
    ]);
  });

  it("treats centroids as approximate", () => {
    expect(isApproximate("ROOFTOP")).toBe(false);
    expect(isApproximate("RANGE_INTERPOLATED")).toBe(false);
    expect(isApproximate("GEOMETRIC_CENTER")).toBe(true);
    expect(isApproximate("APPROXIMATE")).toBe(true);
  });
});
