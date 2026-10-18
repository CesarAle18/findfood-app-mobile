import { act, waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock, type SentRequest } from "@/test-utils/api";
import { rutaDetalleFixture } from "@/test-utils/fixtures";
import { mutationCase, renderWithClient } from "@/test-utils/query";

import {
  cancelarRuta,
  confirmarParada,
  crearRuta,
  getRuta,
  getRutas,
  iniciarRuta,
  registrarLlegada,
  reportarParadaFallida,
  useCancelarRutaMutation,
  useConfirmarParadaMutation,
  useCrearRutaMutation,
  useIniciarRutaMutation,
  useParadaFallidaMutation,
  useRegistrarLlegadaMutation,
  useRuta,
  useRutas,
  type ConfirmarParadaBody,
  type ParadaDto,
} from "./rutas";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const signal = new AbortController().signal;
const { asignaciones, donaciones, perfil, rutas } = queryKeys;

const ubicacion = { lat: 4.6, lng: -74.08 };
const confirmacion: ConfirmarParadaBody = {
  confirmada_en_dispositivo: "2026-10-10T15:00:00-05:00",
  peso_confirmado_kg: 12.5,
  ubicacion,
  precision_m: 8,
};
const fallida = { tipo_incidencia_id: 1, descripcion: "El donante no estaba" };

function parada(overrides: Partial<ParadaDto> = {}): ParadaDto {
  return {
    id: "p-1",
    ruta_id: "r-1",
    orden: 1,
    tipo: "RECOGIDA",
    estado: "COMPLETADA",
    donacion_id: "d-1",
    almacen_id: null,
    direccion: "Calle 10 # 5-20",
    lat: 4.6,
    lng: -74.08,
    hora_estimada_llegada: null,
    hora_real_llegada: null,
    peso_confirmado_kg: null,
    confirmacion_manual: false,
    precision_confirmacion_m: null,
    confirmada_at: null,
    observaciones: null,
    estado_producto: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("requests", () => {
  it.each<[string, () => Promise<unknown>, SentRequest]>([
    [
      "getRutas",
      () => getRutas({ estado: "EN_CURSO" }, signal),
      { method: "get", path: "/rutas", options: { query: { estado: "EN_CURSO" }, signal } },
    ],
    ["getRuta", () => getRuta("r-1", signal), { method: "get", path: "/rutas/r-1", options: { signal } }],
    [
      "crearRuta",
      () => crearRuta({ donacion_ids: ["d-1", "d-2"], origen: ubicacion }),
      { method: "post", path: "/rutas", options: { body: { donacion_ids: ["d-1", "d-2"], origen: ubicacion } } },
    ],
    ["iniciarRuta", () => iniciarRuta("r-1"), { method: "post", path: "/rutas/r-1/iniciar" }],
    ["cancelarRuta", () => cancelarRuta("r-1"), { method: "post", path: "/rutas/r-1/cancelar" }],
    [
      "registrarLlegada with a location",
      () => registrarLlegada("p-1", { ubicacion }),
      { method: "post", path: "/paradas/p-1/llegada", options: { body: { ubicacion } } },
    ],
    [
      "registrarLlegada without a location",
      () => registrarLlegada("p-1"),
      { method: "post", path: "/paradas/p-1/llegada", options: { body: {} } },
    ],
    [
      "confirmarParada",
      () => confirmarParada("p-1", confirmacion),
      { method: "post", path: "/paradas/p-1/confirmar", options: { body: confirmacion } },
    ],
    [
      "reportarParadaFallida",
      () => reportarParadaFallida("p-1", fallida),
      { method: "post", path: "/paradas/p-1/fallida", options: { body: fallida } },
    ],
  ])("%s", async (_name, call, request) => {
    await call();
    expect(sentRequests(mockedApi)).toEqual([request]);
  });
});

describe("queries", () => {
  it("cache lists and details under their own keys", async () => {
    mockedApi.get.mockResolvedValue({ datos: [], total: 0, limite: 20, desplazamiento: 0 });

    const { result, client } = await renderWithClient(() => ({
      list: useRutas({ estado: "PLANIFICADA" }),
      detail: useRuta("r-1"),
    }));

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      rutas.list({ estado: "PLANIFICADA" }),
      rutas.detail("r-1"),
    ]);
  });
});

describe("mutations invalidate exactly the queries they change", () => {
  beforeEach(() => {
    mockedApi.post.mockResolvedValue(parada());
  });

  it.each([
    // The assignments get their route; the donations' details show it.
    mutationCase("POST /rutas", useCrearRutaMutation, { donacion_ids: ["d-1", "d-2"] }, [
      rutas.lists(),
      asignaciones.ofertas(),
      donaciones.detail("d-1"),
      donaciones.detail("d-2"),
    ]),
    // Its donations move to EN_RECOLECCION.
    mutationCase("POST /rutas/:id/iniciar", useIniciarRutaMutation, "r-1", [
      rutas.lists(),
      asignaciones.ofertas(),
      donaciones.all,
    ]),
    // The assignments leave the route (or, for the bank fleet, the donations are published again).
    mutationCase("POST /rutas/:id/cancelar", useCancelarRutaMutation, "r-1", [
      rutas.lists(),
      asignaciones.ofertas(),
      donaciones.all,
    ]),
    // Only the stop changes; a pickup stop also shows in its donation's history.
    mutationCase("POST /paradas/:id/llegada", useRegistrarLlegadaMutation, { id: "p-1" }, [
      rutas.detail("r-1"),
      donaciones.historial("d-1"),
    ]),
    // A pickup moves its donation to EN_TRANSITO; a delivery completes the route, the
    // donations and the assignments (and the volunteer's impact).
    mutationCase("POST /paradas/:id/confirmar", useConfirmarParadaMutation, { id: "p-1", body: confirmacion }, [
      rutas.detail("r-1"),
      rutas.lists(),
      asignaciones.ofertas(),
      donaciones.all,
      perfil.impacto(),
    ]),
    // The stop fails and an incident opens; the donation keeps its state.
    mutationCase("POST /paradas/:id/fallida", useParadaFallidaMutation, { id: "p-1", body: fallida }, [
      rutas.detail("r-1"),
      donaciones.historial("d-1"),
    ]),
  ])("$name", async ({ invalidated, expected }) => {
    expect(await invalidated()).toEqual(expected);
  });

  it("an arrival at the delivery stop only changes the route", async () => {
    mockedApi.post.mockResolvedValue(parada({ tipo: "ENTREGA", donacion_id: null, almacen_id: "al-1" }));

    const { invalidated, expected } = mutationCase(
      "POST /paradas/:id/llegada",
      useRegistrarLlegadaMutation,
      { id: "p-2" },
      [rutas.detail("r-1")],
    );

    expect(await invalidated()).toEqual(expected);
  });
});

describe("route mutations cache the detail they answer with", () => {
  it.each([
    ["POST /rutas", useCrearRutaMutation, { donacion_ids: ["d-1"] }],
    ["POST /rutas/:id/iniciar", useIniciarRutaMutation, "ruta-1"],
    ["POST /rutas/:id/cancelar", useCancelarRutaMutation, "ruta-1"],
  ] as const)("%s", async (_name, useMutationHook, variables) => {
    const detalle = rutaDetalleFixture({ estado: "EN_CURSO" });
    mockedApi.post.mockResolvedValue(detalle);
    const { result, client } = await renderWithClient(() => useMutationHook());

    await act(async () => {
      await (result.current.mutateAsync as (v: typeof variables) => Promise<unknown>)(variables);
    });

    // No refetch of the detail: the screen shows the new state at once.
    expect(client.getQueryData(rutas.detail("ruta-1"))).toBe(detalle);
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});
