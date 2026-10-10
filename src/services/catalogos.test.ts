import { waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock } from "@/test-utils/api";
import { renderWithClient } from "@/test-utils/query";

import { catalogosQuery, getCatalogos, useCatalogos } from "./catalogos";

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

describe("useCatalogos", () => {
  it("shares one cached request between equal catalog lists", async () => {
    mockedApi.get.mockResolvedValue({ tipos_alimento: [], unidades_medida: [] });

    const { result, client } = await renderWithClient(() => ({
      first: useCatalogos(["unidades_medida", "tipos_alimento"]),
      second: useCatalogos(["tipos_alimento", "unidades_medida", "tipos_alimento"]),
    }));

    await waitFor(() => expect(result.current.second.isSuccess).toBe(true));
    expect(mockedApi.get).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      queryKeys.catalogos.byIncluir(["tipos_alimento", "unidades_medida"]),
    ]);
  });

  it("keeps catalogs fresh for an hour", () => {
    expect(catalogosQuery(["motivos"]).staleTime).toBe(60 * 60 * 1000);
  });
});
