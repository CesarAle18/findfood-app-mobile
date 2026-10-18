import { waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock, type SentRequest } from "@/test-utils/api";
import { mutationCase, renderWithClient } from "@/test-utils/query";

import {
  abandonarAsignacion,
  aceptarOferta,
  calificarAsignacion,
  getOfertas,
  OFFER_POLL_MS,
  pollWhileOffered,
  rechazarOferta,
  useAbandonarAsignacionMutation,
  useAceptarOfertaMutation,
  useCalificarAsignacionMutation,
  useOfertas,
  useRechazarOfertaMutation,
} from "./asignaciones";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const signal = new AbortController().signal;
const { asignaciones, donaciones, rutas } = queryKeys;

const motivo = { motivo_id: 2, observacion: "Estoy lejos" };
const calificacion = { puntaje: 4, comentario: "Muy amable", aspectos: ["PUNTUALIDAD"] };

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("requests", () => {
  it.each<[string, () => Promise<unknown>, SentRequest]>([
    ["getOfertas", () => getOfertas(signal), { method: "get", path: "/asignaciones/ofertas", options: { signal } }],
    ["aceptarOferta", () => aceptarOferta("a-1"), { method: "post", path: "/asignaciones/a-1/aceptar" }],
    [
      "rechazarOferta",
      () => rechazarOferta("a-1", motivo),
      { method: "post", path: "/asignaciones/a-1/rechazar", options: { body: motivo } },
    ],
    [
      "abandonarAsignacion",
      () => abandonarAsignacion("a-1", motivo),
      { method: "post", path: "/asignaciones/a-1/abandonar", options: { body: motivo } },
    ],
    [
      "calificarAsignacion",
      () => calificarAsignacion("a-1", calificacion),
      { method: "post", path: "/asignaciones/a-1/calificacion", options: { body: calificacion } },
    ],
  ])("%s", async (_name, call, request) => {
    await call();
    expect(sentRequests(mockedApi)).toEqual([request]);
  });
});

describe("queries", () => {
  it("useOfertas caches the offers under asignaciones.ofertas()", async () => {
    mockedApi.get.mockResolvedValueOnce([]);

    const { result, client } = await renderWithClient(() => useOfertas());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(asignaciones.ofertas())).toEqual([]);
  });
});

describe("pollWhileOffered", () => {
  const query = (data?: { estado: "OFRECIDA" | "ACEPTADA" }[]) => ({ state: { data } });

  it("polls while an offer still waits for an answer", () => {
    expect(pollWhileOffered(query([{ estado: "ACEPTADA" }, { estado: "OFRECIDA" }]))).toBe(
      OFFER_POLL_MS,
    );
    expect(OFFER_POLL_MS).toBe(15_000);
  });

  it("stops once every offer was answered, and before the first answer", () => {
    expect(pollWhileOffered(query([{ estado: "ACEPTADA" }]))).toBe(false);
    expect(pollWhileOffered(query([]))).toBe(false);
    expect(pollWhileOffered(query())).toBe(false);
  });
});

describe("mutations invalidate exactly the queries they change", () => {
  it.each([
    // The donation becomes ASIGNADA: its lists, detail and history change.
    mutationCase("POST /asignaciones/:id/aceptar", useAceptarOfertaMutation, "a-1", [
      asignaciones.ofertas(),
      donaciones.all,
    ]),
    // The donation stays PUBLICADA, but its detail no longer shows this offer and its history
    // records the rejected assignment (the response carries no donation id).
    mutationCase("POST /asignaciones/:id/rechazar", useRechazarOfertaMutation, { id: "a-1", body: motivo }, [
      asignaciones.ofertas(),
      donaciones.details(),
      donaciones.historiales(),
    ]),
    // The donation is published again (or expires) and its stop leaves the route, which
    // changes the route's stop count and weight in lists too.
    mutationCase("POST /asignaciones/:id/abandonar", useAbandonarAsignacionMutation, { id: "a-1", body: motivo }, [
      asignaciones.ofertas(),
      donaciones.all,
      rutas.lists(),
      rutas.details(),
    ]),
    // The donation detail flips `asignacion.calificada_por_mi` (the response carries no
    // donation id, so every detail).
    mutationCase(
      "POST /asignaciones/:id/calificacion",
      useCalificarAsignacionMutation,
      { id: "a-1", body: calificacion },
      [donaciones.details()],
    ),
  ])("$name", async ({ invalidated, expected }) => {
    expect(await invalidated()).toEqual(expected);
  });
});
