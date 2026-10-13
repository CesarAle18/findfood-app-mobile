import { waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock, type SentRequest } from "@/test-utils/api";
import { mutationCase, renderWithClient } from "@/test-utils/query";

import {
  getNotificaciones,
  getNotificacionesNoLeidas,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  useMarcarNotificacionLeidaMutation,
  useMarcarTodasLeidasMutation,
  useNotificaciones,
  useNotificacionesNoLeidas,
  type BandejaDto,
} from "./notificaciones";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const signal = new AbortController().signal;
const { notificaciones } = queryKeys;

const bandeja: BandejaDto = {
  datos: [],
  total: 0,
  limite: 1,
  desplazamiento: 0,
  no_leidas: 3,
};

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("requests", () => {
  it.each<[string, () => Promise<unknown>, SentRequest]>([
    [
      "getNotificaciones",
      () => getNotificaciones({ solo_no_leidas: true, limite: 20, desplazamiento: 40 }, signal),
      {
        method: "get",
        path: "/me/notificaciones",
        options: { query: { solo_no_leidas: true, limite: 20, desplazamiento: 40 }, signal },
      },
    ],
    [
      "marcarNotificacionLeida",
      () => marcarNotificacionLeida("n-1"),
      { method: "post", path: "/me/notificaciones/n-1/leer" },
    ],
    ["marcarTodasLeidas", () => marcarTodasLeidas(), { method: "post", path: "/me/notificaciones/leer-todas" }],
  ])("%s", async (_name, call, request) => {
    await call();
    expect(sentRequests(mockedApi)).toEqual([request]);
  });

  it("getNotificacionesNoLeidas reads the unread count from the smallest page", async () => {
    mockedApi.get.mockResolvedValueOnce(bandeja);

    await expect(getNotificacionesNoLeidas(signal)).resolves.toBe(3);

    expect(sentRequests(mockedApi)).toEqual([
      {
        method: "get",
        path: "/me/notificaciones",
        options: { query: { solo_no_leidas: true, limite: 1 }, signal },
      },
    ]);
  });
});

describe("queries", () => {
  it("cache the inbox pages and the unread count under their own keys", async () => {
    mockedApi.get.mockResolvedValue(bandeja);

    const { result, client } = await renderWithClient(() => ({
      list: useNotificaciones({ limite: 50 }),
      unread: useNotificacionesNoLeidas(),
    }));

    await waitFor(() => expect(result.current.unread.data).toBe(3));
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      notificaciones.list({ limite: 50 }),
      notificaciones.unreadCount(),
    ]);
  });
});

describe("mutations invalidate exactly the queries they change", () => {
  it.each([
    mutationCase("POST /me/notificaciones/:id/leer", useMarcarNotificacionLeidaMutation, "n-1", [
      notificaciones.lists(),
      notificaciones.unreadCount(),
    ]),
    mutationCase("POST /me/notificaciones/leer-todas", useMarcarTodasLeidasMutation, undefined, [
      notificaciones.lists(),
      notificaciones.unreadCount(),
    ]),
  ])("$name", async ({ invalidated, expected }) => {
    expect(await invalidated()).toEqual(expected);
  });
});
