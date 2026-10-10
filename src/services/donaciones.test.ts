import { waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock, type SentRequest } from "@/test-utils/api";
import { mutationCase, renderWithClient } from "@/test-utils/query";

import {
  actualizarDonacion,
  cancelarDonacion,
  crearDonacion,
  getDonacion,
  getDonaciones,
  getHistorialDonacion,
  publicarDonacion,
  useActualizarDonacionMutation,
  useCancelarDonacionMutation,
  useCrearDonacionMutation,
  useDonacion,
  useDonaciones,
  useHistorialDonacion,
  usePublicarDonacionMutation,
  type CrearDonacionBody,
} from "./donaciones";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const signal = new AbortController().signal;
const { donaciones } = queryKeys;

const nueva: CrearDonacionBody = {
  titulo: "Pan del día",
  ventana_recogida_inicio: "2026-10-10T14:00:00-05:00",
  ventana_recogida_fin: "2026-10-10T18:00:00-05:00",
  direccion_recogida: "Calle 10 # 5-20",
  ubicacion_recogida: { lat: 4.6, lng: -74.08 },
  items: [{ tipo_alimento_id: 3, cantidad: 20, peso_estimado_kg: 8, fecha_vencimiento: "2026-10-12" }],
};
const cancelacion = { motivo_id: 4, observacion: "Ya no está disponible" };

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("requests", () => {
  it.each<[string, () => Promise<unknown>, SentRequest]>([
    [
      "getDonaciones",
      () => getDonaciones({ estado: "PUBLICADA", limite: 10 }, signal),
      { method: "get", path: "/donaciones", options: { query: { estado: "PUBLICADA", limite: 10 }, signal } },
    ],
    ["getDonacion", () => getDonacion("d-1", signal), { method: "get", path: "/donaciones/d-1", options: { signal } }],
    [
      "getHistorialDonacion",
      () => getHistorialDonacion("d-1", signal),
      { method: "get", path: "/donaciones/d-1/historial", options: { signal } },
    ],
    ["crearDonacion", () => crearDonacion(nueva), { method: "post", path: "/donaciones", options: { body: nueva } }],
    [
      "actualizarDonacion",
      () => actualizarDonacion("d-1", { titulo: "Pan y frutas" }),
      { method: "patch", path: "/donaciones/d-1", options: { body: { titulo: "Pan y frutas" } } },
    ],
    ["publicarDonacion", () => publicarDonacion("d-1"), { method: "post", path: "/donaciones/d-1/publicar" }],
    [
      "cancelarDonacion",
      () => cancelarDonacion("d-1", cancelacion),
      { method: "post", path: "/donaciones/d-1/cancelar", options: { body: cancelacion } },
    ],
  ])("%s", async (_name, call, request) => {
    await call();
    expect(sentRequests(mockedApi)).toEqual([request]);
  });
});

describe("queries", () => {
  it("cache lists, details and history under their own keys", async () => {
    mockedApi.get.mockImplementation(async (path: string) =>
      path === "/donaciones" ? { datos: [], total: 0, limite: 20, desplazamiento: 0 } : [],
    );

    const { result, client } = await renderWithClient(() => ({
      list: useDonaciones({ estado: "BORRADOR" }),
      detail: useDonacion("d-1"),
      history: useHistorialDonacion("d-1"),
    }));

    await waitFor(() => expect(result.current.history.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      donaciones.list({ estado: "BORRADOR" }),
      donaciones.detail("d-1"),
      donaciones.historial("d-1"),
    ]);
  });
});

describe("mutations invalidate exactly the queries they change", () => {
  it.each([
    mutationCase("POST /donaciones", useCrearDonacionMutation, nueva, [donaciones.lists()]),
    // Editing records no state change, so the history stays as it is.
    mutationCase("PATCH /donaciones/:id", useActualizarDonacionMutation, { id: "d-1", body: { titulo: "Pan" } }, [
      donaciones.lists(),
      donaciones.detail("d-1"),
    ]),
    mutationCase("POST /donaciones/:id/publicar", usePublicarDonacionMutation, "d-1", [
      donaciones.lists(),
      donaciones.detail("d-1"),
      donaciones.historial("d-1"),
    ]),
    mutationCase("POST /donaciones/:id/cancelar", useCancelarDonacionMutation, { id: "d-1", body: cancelacion }, [
      donaciones.lists(),
      donaciones.detail("d-1"),
      donaciones.historial("d-1"),
    ]),
  ])("$name", async ({ invalidated, expected }) => {
    expect(await invalidated()).toEqual(expected);
  });
});
