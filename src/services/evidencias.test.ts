import { waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock, type SentRequest } from "@/test-utils/api";
import { mutationCase, renderWithClient } from "@/test-utils/query";

import {
  getEvidencias,
  registrarEvidencia,
  solicitarSubida,
  useEvidencias,
  useRegistrarEvidenciaMutation,
  useSolicitarSubidaMutation,
  type RegistrarEvidenciaBody,
} from "./evidencias";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const signal = new AbortController().signal;
const { evidencias } = queryKeys;

const evidencia: RegistrarEvidenciaBody = {
  id: "6f1c3c1e-7a51-4bd3-9a43-0a1f2b3c4d5e",
  tipo: "RECOGIDA",
  ruta: "evidencias/u-1/foto.jpg",
  capturada_at: "2026-10-10T15:00:00-05:00",
  parada_id: "p-1",
  ubicacion: { lat: 4.6, lng: -74.08 },
  precision_m: 6,
};

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("requests", () => {
  it.each<[string, () => Promise<unknown>, SentRequest]>([
    [
      "solicitarSubida",
      () => solicitarSubida({ proposito: "EVIDENCIA", extension: "jpg" }),
      {
        method: "post",
        path: "/evidencias/upload-url",
        options: { body: { proposito: "EVIDENCIA", extension: "jpg" } },
      },
    ],
    [
      "registrarEvidencia",
      () => registrarEvidencia(evidencia),
      { method: "post", path: "/evidencias", options: { body: evidencia } },
    ],
    [
      "getEvidencias",
      () => getEvidencias({ parada_id: "p-1" }, signal),
      { method: "get", path: "/evidencias", options: { query: { parada_id: "p-1" }, signal } },
    ],
  ])("%s", async (_name, call, request) => {
    await call();
    expect(sentRequests(mockedApi)).toEqual([request]);
  });
});

describe("queries", () => {
  it("useEvidencias caches each parent's evidence under its own key", async () => {
    mockedApi.get.mockResolvedValueOnce([]);

    const { result, client } = await renderWithClient(() => useEvidencias({ parada_id: "p-1" }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(evidencias.list({ parada_id: "p-1" }))).toEqual([]);
  });
});

describe("mutations invalidate exactly the queries they change", () => {
  it.each([
    mutationCase("POST /evidencias", useRegistrarEvidenciaMutation, evidencia, [
      evidencias.list({ parada_id: "p-1" }),
    ]),
    // A signed upload URL changes nothing until the evidence is registered.
    mutationCase(
      "POST /evidencias/upload-url",
      useSolicitarSubidaMutation,
      { proposito: "PRODUCTO", extension: "png" },
      [],
    ),
  ])("$name", async ({ invalidated, expected }) => {
    expect(await invalidated()).toEqual(expected);
  });
});
