import { waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import { ROUTES_IN_PROGRESS, ROUTES_PLANNED, type RutasFilters } from "@/services/rutas";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { pageFixture, rutaDetalleFixture, rutaResumenFixture } from "@/test-utils/fixtures";
import { renderWithClient } from "@/test-utils/query";

import { useCurrentRoute } from "../route-queries";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;

const enCurso = rutaResumenFixture({ id: "ruta-en-curso", estado: "EN_CURSO" });
const planificada = rutaResumenFixture({ id: "ruta-plan" });

/** Answers `GET /rutas` by state and `GET /rutas/:id` with a detail of that id. */
function answer({
  inProgress = [],
  planned = [],
  plannedTotal = planned.length,
}: {
  inProgress?: (typeof enCurso)[];
  planned?: (typeof enCurso)[];
  plannedTotal?: number;
}) {
  mockedApi.get.mockImplementation(async (path: string, options?: { query?: RutasFilters }) => {
    if (path === "/rutas") {
      return options?.query?.estado === "EN_CURSO"
        ? pageFixture(inProgress)
        : pageFixture(planned, plannedTotal);
    }
    const id = decodeURIComponent(path.replace("/rutas/", ""));
    return rutaDetalleFixture({ id });
  });
}

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("useCurrentRoute", () => {
  it("prefers the route in progress and loads its detail", async () => {
    answer({ inProgress: [enCurso], planned: [planificada], plannedTotal: 2 });

    const { result, client } = await renderWithClient(() => useCurrentRoute());

    await waitFor(() => expect(result.current.ruta.data?.id).toBe("ruta-en-curso"));
    expect(result.current.summary?.id).toBe("ruta-en-curso");
    expect(result.current.totals).toEqual({ enCurso: 1, planificadas: 2 });
    expect(result.current.isPending).toBe(false);
    // Shared with Home, Rutas and the location tracking.
    expect(client.getQueryData(queryKeys.rutas.list(ROUTES_IN_PROGRESS))).toBeDefined();
    expect(client.getQueryData(queryKeys.rutas.list(ROUTES_PLANNED))).toBeDefined();
  });

  it("falls back to the next planned route", async () => {
    answer({ planned: [planificada] });

    const { result } = await renderWithClient(() => useCurrentRoute());

    await waitFor(() => expect(result.current.ruta.data?.id).toBe("ruta-plan"));
    expect(result.current.summary?.id).toBe("ruta-plan");
  });

  it("settles without a route, and never asks for a detail", async () => {
    answer({});

    const { result } = await renderWithClient(() => useCurrentRoute());

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.summary).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(result.current.totals).toEqual({ enCurso: 0, planificadas: 0 });
    expect(mockedApi.get.mock.calls.map(([path]) => path)).toEqual(["/rutas", "/rutas"]);
  });

  it("reports a failed list", async () => {
    mockedApi.get.mockRejectedValue(new ApiError({ status: 500, type: "error-interno", title: "x" }));

    const { result } = await renderWithClient(() => useCurrentRoute());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPending).toBe(false);
  });

  it("refetches the lists and the detail", async () => {
    answer({ inProgress: [enCurso] });
    const { result } = await renderWithClient(() => useCurrentRoute());
    await waitFor(() => expect(result.current.ruta.isSuccess).toBe(true));
    mockedApi.get.mockClear();

    await result.current.refetch();

    expect(mockedApi.get.mock.calls.map(([path]) => path).sort()).toEqual([
      "/rutas",
      "/rutas",
      "/rutas/ruta-en-curso",
    ]);
  });
});
