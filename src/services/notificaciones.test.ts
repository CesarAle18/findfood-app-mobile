import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react-native";

import { api } from "@/api";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock, type SentRequest } from "@/test-utils/api";
import { bandejaFixture, notificacionFixture } from "@/test-utils/fixtures";
import { mutationCase, renderWithClient } from "@/test-utils/query";

import {
  NOTIFICACIONES_PAGE_SIZE,
  getNotificaciones,
  getNotificacionesNoLeidas,
  marcarNotificacionLeida,
  marcarTodasLeidas,
  nextNotificacionesOffset,
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

describe("nextNotificacionesOffset", () => {
  it.each<[string, Pick<BandejaDto, "desplazamiento" | "limite" | "total">, number | undefined]>([
    ["first of several pages", { desplazamiento: 0, limite: 20, total: 45 }, 20],
    ["middle page", { desplazamiento: 20, limite: 20, total: 45 }, 40],
    ["last page", { desplazamiento: 40, limite: 20, total: 45 }, undefined],
    ["exactly full", { desplazamiento: 20, limite: 20, total: 40 }, undefined],
    ["empty inbox", { desplazamiento: 0, limite: 20, total: 0 }, undefined],
  ])("%s", (_name, page, expected) => {
    expect(nextNotificacionesOffset({ ...page, datos: [], no_leidas: 0 })).toBe(expected);
  });
});

describe("queries", () => {
  it("pages the inbox by offset under a key that depends on the unread filter", async () => {
    mockedApi.get.mockImplementation(async (_path: string, { query }: { query: object }) =>
      "limite" in query && query.limite === 1
        ? bandeja
        : bandejaFixture([notificacionFixture()], { total: 30 }),
    );

    const { result, client } = await renderWithClient(() => ({
      list: useNotificaciones({ soloNoLeidas: true }),
      unread: useNotificacionesNoLeidas(),
    }));

    await waitFor(() => expect(result.current.unread.data).toBe(3));
    await waitFor(() => expect(result.current.list.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.list.fetchNextPage();
    });

    expect(mockedApi.get.mock.calls.map(([, options]) => options.query)).toEqual([
      { solo_no_leidas: true, limite: NOTIFICACIONES_PAGE_SIZE, desplazamiento: 0 },
      { solo_no_leidas: true, limite: 1 },
      { solo_no_leidas: true, limite: NOTIFICACIONES_PAGE_SIZE, desplazamiento: 20 },
    ]);
    expect(client.getQueryCache().getAll().map((query) => query.queryKey)).toEqual([
      notificaciones.list({ soloNoLeidas: true }),
      notificaciones.unreadCount(),
    ]);
  });
});

describe("mutations invalidate the whole inbox when they settle", () => {
  it.each([
    mutationCase("POST /me/notificaciones/:id/leer", useMarcarNotificacionLeidaMutation, "n-1", [
      notificaciones.all,
    ]),
    mutationCase("POST /me/notificaciones/leer-todas", useMarcarTodasLeidasMutation, undefined, [
      notificaciones.all,
    ]),
  ])("$name", async ({ invalidated, expected }) => {
    expect(await invalidated()).toEqual(expected);
  });
});

describe("optimistic read", () => {
  type Pages = InfiniteData<BandejaDto, number>;
  const READ_AT = "2026-10-12T10:00:00Z";
  const allKey = notificaciones.list({ soloNoLeidas: false });
  const unreadKey = notificaciones.list({ soloNoLeidas: true });
  const n1 = notificacionFixture({ id: "n-1" });
  const n2 = notificacionFixture({ id: "n-2", leida_at: READ_AT });
  const n3 = notificacionFixture({ id: "n-3" });

  function seed(client: QueryClient) {
    const all: Pages = {
      pages: [
        bandejaFixture([n1, n2], { total: 3, no_leidas: 2, limite: 2 }),
        bandejaFixture([n3], { total: 3, no_leidas: 2, limite: 2, desplazamiento: 2 }),
      ],
      pageParams: [0, 2],
    };
    const unread: Pages = { pages: [bandejaFixture([n1, n3])], pageParams: [0] };
    client.setQueryData(allKey, all);
    client.setQueryData(unreadKey, unread);
    client.setQueryData(notificaciones.unreadCount(), 2);
    return { all, unread };
  }

  const pagesOf = (client: QueryClient, key: readonly unknown[]) => client.getQueryData<Pages>(key)!;
  const readIds = (data: Pages) =>
    data.pages.flatMap((page) => page.datos.filter((row) => row.leida_at !== null).map((row) => row.id));
  const unreadCounts = (data: Pages) => data.pages.map((page) => page.no_leidas);

  /** A POST that stays in flight until the test settles it. */
  function deferPost() {
    let settle!: { resolve: (value?: unknown) => void; reject: (error: unknown) => void };
    mockedApi.post.mockImplementationOnce(
      () => new Promise((resolve, reject) => (settle = { resolve, reject })),
    );
    return () => settle;
  }

  it("marks one row read in every cached list and decrements the unread counts", async () => {
    const settle = deferPost();
    const { result, client } = await renderWithClient(() => useMarcarNotificacionLeidaMutation());
    seed(client);

    await act(async () => {
      result.current.mutate("n-1");
    });

    await waitFor(() => expect(readIds(pagesOf(client, allKey))).toEqual(["n-1", "n-2"]));
    expect(readIds(pagesOf(client, unreadKey))).toEqual(["n-1"]);
    expect(unreadCounts(pagesOf(client, allKey))).toEqual([1, 1]);
    expect(unreadCounts(pagesOf(client, unreadKey))).toEqual([1]);
    expect(client.getQueryData(notificaciones.unreadCount())).toBe(1);

    await act(async () => settle().resolve());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("leaves the counts alone for a row already read", async () => {
    const { result, client } = await renderWithClient(() => useMarcarNotificacionLeidaMutation());
    const { all } = seed(client);
    const invalidate = jest.spyOn(client, "invalidateQueries").mockResolvedValue();

    await act(async () => {
      await result.current.mutateAsync("n-2");
    });

    expect(pagesOf(client, allKey)).toEqual(all);
    expect(client.getQueryData(notificaciones.unreadCount())).toBe(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificaciones.all });
  });

  it("rolls every list and the badge back when the request fails", async () => {
    const settle = deferPost();
    const { result, client } = await renderWithClient(() => useMarcarNotificacionLeidaMutation());
    const { all, unread } = seed(client);
    jest.spyOn(client, "invalidateQueries").mockResolvedValue();

    await act(async () => {
      result.current.mutate("n-1");
    });
    await waitFor(() => expect(client.getQueryData(notificaciones.unreadCount())).toBe(1));
    await act(async () => settle().reject(new Error("offline")));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(pagesOf(client, allKey)).toEqual(all);
    expect(pagesOf(client, unreadKey)).toEqual(unread);
    expect(client.getQueryData(notificaciones.unreadCount())).toBe(2);
  });

  it("marks everything read at once, and rolls back on failure", async () => {
    const settle = deferPost();
    const { result, client } = await renderWithClient(() => useMarcarTodasLeidasMutation());
    const { all } = seed(client);
    jest.spyOn(client, "invalidateQueries").mockResolvedValue();

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(readIds(pagesOf(client, allKey))).toEqual(["n-1", "n-2", "n-3"]));
    expect(unreadCounts(pagesOf(client, allKey))).toEqual([0, 0]);
    expect(client.getQueryData(notificaciones.unreadCount())).toBe(0);
    // The row read before keeps its own timestamp.
    expect(pagesOf(client, allKey).pages[0].datos[1].leida_at).toBe(READ_AT);

    await act(async () => settle().reject(new Error("offline")));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(pagesOf(client, allKey)).toEqual(all);
    expect(client.getQueryData(notificaciones.unreadCount())).toBe(2);
  });
});
