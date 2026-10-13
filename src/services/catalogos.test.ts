import { waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock } from "@/test-utils/api";
import { catalogosFixture } from "@/test-utils/fixtures";
import { renderWithClient } from "@/test-utils/query";

import {
  ALL_CATALOGOS,
  catalogosQuery,
  getCatalogos,
  selectMotivos,
  selectTiposAlimento,
  selectTiposVehiculo,
  selectUnidades,
  useMotivos,
  useTiposAlimento,
  useTiposVehiculo,
  useUnidades,
} from "./catalogos";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const signal = new AbortController().signal;

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("getCatalogos", () => {
  it("asks for each catalog once, in a stable order, with the motive scope", async () => {
    await getCatalogos(
      ["unidades_medida", "motivos", "unidades_medida"],
      "CANCELACION_DONACION",
      signal,
    );

    expect(sentRequests(mockedApi)).toEqual([
      {
        method: "get",
        path: "/catalogos",
        options: {
          query: { incluir: ["motivos", "unidades_medida"], ambito: "CANCELACION_DONACION" },
          signal,
        },
      },
    ]);
  });

  it("omits the scope when none is given", async () => {
    await getCatalogos(["tipos_alimento"]);

    expect(sentRequests(mockedApi)).toEqual([
      { method: "get", path: "/catalogos", options: { query: { incluir: ["tipos_alimento"] } } },
    ]);
  });
});

describe("catalogosQuery", () => {
  it("asks for every catalog without a scope", async () => {
    mockedApi.get.mockResolvedValue(catalogosFixture);
    await catalogosQuery().queryFn!({ signal } as never);

    expect(sentRequests(mockedApi)).toEqual([
      {
        method: "get",
        path: "/catalogos",
        options: { query: { incluir: [...ALL_CATALOGOS].sort() }, signal },
      },
    ]);
  });

  it("fills catalogs the response leaves out with empty lists", async () => {
    mockedApi.get.mockResolvedValue({ unidades_medida: catalogosFixture.unidades_medida });
    const catalogos = await catalogosQuery().queryFn!({ signal } as never);

    expect(catalogos.unidades_medida).toEqual(catalogosFixture.unidades_medida);
    expect(catalogos.motivos).toEqual([]);
    expect(catalogos.tipos_alimento).toEqual([]);
  });

  it("stays fresh for a day and is never garbage-collected", () => {
    const options = catalogosQuery();
    expect(options.staleTime).toBe(24 * 60 * 60 * 1000);
    expect(options.gcTime).toBe(Infinity);
    expect(options.queryKey).toEqual(queryKeys.catalogos.byIncluir(ALL_CATALOGOS));
  });
});

describe("selectors", () => {
  it("pick each catalog from the full response", () => {
    expect(selectTiposAlimento(catalogosFixture)).toBe(catalogosFixture.tipos_alimento);
    expect(selectUnidades(catalogosFixture)).toBe(catalogosFixture.unidades_medida);
    expect(selectTiposVehiculo(catalogosFixture)).toBe(catalogosFixture.tipos_vehiculo);
  });

  it("filter reasons by scope", () => {
    const motivos = selectMotivos("RECHAZO_ASIGNACION")(catalogosFixture);

    expect(motivos.map((motivo) => motivo.codigo)).toEqual(["MUY_LEJOS", "OTRO_RECHAZO"]);
    expect(motivos.every((motivo) => motivo.ambito === "RECHAZO_ASIGNACION")).toBe(true);
  });

  it("return one stable selector per scope", () => {
    expect(selectMotivos("CANCELACION_DONACION")).toBe(selectMotivos("CANCELACION_DONACION"));
    expect(selectMotivos("CANCELACION_DONACION")).not.toBe(selectMotivos("RECHAZO_ASIGNACION"));
  });
});

describe("derived hooks", () => {
  it("share one request for the whole catalog", async () => {
    mockedApi.get.mockResolvedValue(catalogosFixture);

    const { result, client } = await renderWithClient(() => ({
      tipos: useTiposAlimento(),
      unidades: useUnidades(),
      vehiculos: useTiposVehiculo(),
      cancelacion: useMotivos("CANCELACION_DONACION"),
    }));

    await waitFor(() => expect(result.current.cancelacion.isSuccess).toBe(true));
    expect(mockedApi.get).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
    expect(result.current.tipos.data).toEqual(catalogosFixture.tipos_alimento);
    expect(result.current.unidades.data).toEqual(catalogosFixture.unidades_medida);
    expect(result.current.vehiculos.data).toEqual(catalogosFixture.tipos_vehiculo);
    expect(result.current.cancelacion.data?.map((motivo) => motivo.codigo)).toEqual([
      "DONANTE_CANCELA",
    ]);
  });
});
