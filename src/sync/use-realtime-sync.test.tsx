import { focusManager, QueryObserver, type QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { sessionStore } from "@/auth/session-store";
import { queryKeys } from "@/services/query-keys";
import { createQueryWrapper, createTestQueryClient } from "@/test-utils/query";
import { plugRealtime, type FakeChannel, type RealtimeFake } from "@/test-utils/realtime";

import { getRealtimeStatus, setRealtimeStatus } from "./status";
import { SYNC_EVENT, SYNC_FLUSH_MS, useRealtimeSync } from "./use-realtime-sync";

// No Realtime unless a test plugs in a fake client: the `local` profile has none.
jest.mock("@/auth/supabase", () => ({ __esModule: true, supabase: null }));

const { asignaciones, catalogos, donaciones, me, notificaciones, perfil, rutas } = queryKeys;

const USER = "6f1d2c3b-4a5e-4f60-9b7c-8d9e0f1a2b3c";
const OTHER_USER = "7a2e3d4c-5b6f-4a71-8c9d-0e1f2a3b4c5d";
const DON = "0b7c6f2e-3d4a-4e5f-9a1b-2c3d4e5f6a7b";
const RUTA = "1c8d7a3f-4e5b-4f60-8b2c-3d4e5f6a7b8c";

let realtime: RealtimeFake | null = null;

function signIn(userId: string | undefined) {
  sessionStore.setSession(
    userId
      ? { status: "present", accessToken: "token", userId }
      : { status: "none", accessToken: null },
  );
}

async function renderSync({ enabled = true, client = createTestQueryClient() } = {}) {
  const invalidate = jest.spyOn(client, "invalidateQueries");
  const view = await renderHook((props: { enabled: boolean }) => useRealtimeSync(props.enabled), {
    initialProps: { enabled },
    wrapper: createQueryWrapper(client),
  });
  return { ...view, client, invalidate };
}

/** The channels the hook joined. */
const joined = () => realtime!.channels;
const lastChannel = (): FakeChannel => joined()[joined().length - 1];

const report = (status: string, channel = lastChannel()) =>
  act(async () => channel.report(status));
const send = (payload: unknown, channel = lastChannel()) =>
  act(async () => channel.broadcast(SYNC_EVENT, payload));
const elapse = (ms: number) => act(async () => jest.advanceTimersByTime(ms));
const setForeground = (focused: boolean) => act(async () => focusManager.setFocused(focused));

/** The catch-up: every query but the catalog, without cancelling refetches in flight. */
function expectCatchUp(invalidate: jest.SpyInstance, client: QueryClient) {
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledWith(
    { predicate: expect.any(Function) },
    { cancelRefetch: false },
  );
  expect(client.getQueryState(donaciones.lists())?.isInvalidated).toBe(true);
  expect(client.getQueryState(me)?.isInvalidated).toBe(true);
  expect(client.getQueryState(catalogos.all)?.isInvalidated).toBe(false);
}

/** A client holding the catalog and two other queries, none on screen. */
function cachedClient() {
  const client = createTestQueryClient();
  client.setQueryData(catalogos.all, "catalog");
  client.setQueryData(donaciones.lists(), "list");
  client.setQueryData(me, "me");
  return client;
}

beforeEach(() => {
  jest.useFakeTimers();
  setRealtimeStatus("idle");
  focusManager.setFocused(undefined);
  signIn(USER);
  realtime = plugRealtime();
});

afterEach(() => {
  realtime?.restore();
  realtime = null;
  jest.useRealTimers();
});

describe("useRealtimeSync · joining", () => {
  it("joins the user's private channel and listens to its sync events", async () => {
    await renderSync();

    expect(realtime!.fake.channel).toHaveBeenCalledTimes(1);
    expect(realtime!.fake.channel).toHaveBeenCalledWith(`usuario:${USER}`, {
      config: { private: true },
    });
    expect(lastChannel().on).toHaveBeenCalledWith(
      "broadcast",
      { event: "sync" },
      expect.any(Function),
    );
    expect(lastChannel().subscribe).toHaveBeenCalledTimes(1);
    expect(getRealtimeStatus()).toBe("connecting");
  });

  it.each([
    ["disabled", () => renderSync({ enabled: false })],
    [
      "signed out",
      () => {
        signIn(undefined);
        return renderSync();
      },
    ],
    [
      "in the background",
      () => {
        focusManager.setFocused(false);
        return renderSync();
      },
    ],
  ])("does not join while %s", async (_case, render) => {
    await render();

    expect(realtime!.fake.channel).not.toHaveBeenCalled();
    expect(getRealtimeStatus()).toBe("idle");
  });

  it("does nothing without a Supabase client (local profile)", async () => {
    realtime!.restore();
    realtime = null;
    const { invalidate } = await renderSync();

    await elapse(SYNC_FLUSH_MS);
    expect(getRealtimeStatus()).toBe("idle");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("is connected once joined, without a catch-up on the first join", async () => {
    const { invalidate } = await renderSync({ client: cachedClient() });

    await report("SUBSCRIBED");

    expect(getRealtimeStatus()).toBe("connected");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])("is not connected after %s", async (status) => {
    await renderSync();
    await report("SUBSCRIBED");

    await report(status);

    expect(getRealtimeStatus()).toBe("error");
  });
});

describe("useRealtimeSync · background and catch-up", () => {
  it("leaves in the background and catches up once when it joins again", async () => {
    const client = cachedClient();
    const { invalidate } = await renderSync({ client });
    const first = lastChannel();
    await report("SUBSCRIBED");

    await setForeground(false);
    expect(realtime!.fake.removeChannel).toHaveBeenCalledWith(first);
    expect(getRealtimeStatus()).toBe("idle");

    await setForeground(true);
    expect(joined()).toHaveLength(2);
    expect(lastChannel().topic).toBe(`usuario:${USER}`);
    expect(getRealtimeStatus()).toBe("connecting");
    expect(invalidate).not.toHaveBeenCalled();

    await report("SUBSCRIBED");
    expect(getRealtimeStatus()).toBe("connected");
    expectCatchUp(invalidate, client);
  });

  it("catches up once after Realtime rejoins on its own (a reconnect)", async () => {
    const client = cachedClient();
    const { invalidate } = await renderSync({ client });
    await report("SUBSCRIBED");
    await report("CHANNEL_ERROR");

    await report("SUBSCRIBED");

    expect(getRealtimeStatus()).toBe("connected");
    expectCatchUp(invalidate, client);
  });

  it("joins again only once the previous channel is gone", async () => {
    let removed: (status: string) => void = () => {};
    realtime!.fake.removeChannel.mockImplementationOnce(
      () => new Promise<string>((resolve) => (removed = resolve)),
    );
    await renderSync();

    await setForeground(false);
    await setForeground(true);
    // Realtime would hand back the channel that is still leaving, which never joins again.
    expect(joined()).toHaveLength(1);
    expect(getRealtimeStatus()).toBe("connecting");

    await act(async () => removed("ok"));
    expect(joined()).toHaveLength(2);
    expect(lastChannel().subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useRealtimeSync · events", () => {
  it("invalidates a burst of events once, each target once", async () => {
    const { invalidate } = await renderSync();
    await report("SUBSCRIBED");

    await send({ v: 1, entidad: "cuenta" });
    await elapse(100);
    await send({ v: 1, entidad: "cuenta" });
    await send({ v: 1, entidad: "ruta", id: RUTA });
    await elapse(100);
    await send({ v: 1, entidad: "notificacion", tipo: "ASIGNACION_OFRECIDA" });
    await send({ v: 1, entidad: "cuenta" });
    await elapse(SYNC_FLUSH_MS - 201);
    expect(invalidate).not.toHaveBeenCalled();

    await elapse(1);
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: me }, { cancelRefetch: false }],
      [{ queryKey: perfil.all }, { cancelRefetch: false }],
      [{ queryKey: rutas.lists() }, { cancelRefetch: false }],
      [{ queryKey: rutas.detail(RUTA), exact: true }, { cancelRefetch: false }],
      [{ queryKey: asignaciones.ofertas() }, { cancelRefetch: false }],
      [{ queryKey: donaciones.lists() }, { cancelRefetch: false }],
      [{ queryKey: notificaciones.all }, { cancelRefetch: false }],
    ]);

    // The next event starts a new window.
    invalidate.mockClear();
    await send({ v: 1, entidad: "cuenta" });
    await elapse(SYNC_FLUSH_MS);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("refetches the queries on screen and only marks the others stale", async () => {
    const client = createTestQueryClient();
    client.setQueryData(donaciones.detail(DON), "cached");
    client.setQueryData(donaciones.lists(), "cached");
    const queryFn = jest.fn(async () => "fresh");
    const onScreen = new QueryObserver(client, {
      queryKey: donaciones.detail(DON),
      queryFn,
      staleTime: Infinity,
    });
    const unsubscribe = onScreen.subscribe(() => undefined);
    await renderSync({ client });
    await report("SUBSCRIBED");

    await send({ v: 1, entidad: "donacion", id: DON });
    await elapse(SYNC_FLUSH_MS);

    await waitFor(() => expect(client.getQueryData(donaciones.detail(DON))).toBe("fresh"));
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(donaciones.lists())).toMatchObject({
      isInvalidated: true,
      data: "cached",
    });
    unsubscribe();
  });

  it("ignores malformed events", async () => {
    const { invalidate } = await renderSync();
    await report("SUBSCRIBED");

    for (const payload of [
      null,
      "donacion",
      { v: 2, entidad: "donacion" },
      { v: 1, entidad: "usuario" },
      { v: 1, entidad: "donacion", id: "not-a-uuid" },
    ]) {
      await send(payload);
    }
    await elapse(SYNC_FLUSH_MS);

    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("useRealtimeSync · leaving", () => {
  it.each([
    ["unmounted (sign-out)", async (view: Awaited<ReturnType<typeof renderSync>>) => view.unmount()],
    ["disabled", async (view: Awaited<ReturnType<typeof renderSync>>) => view.rerender({ enabled: false })],
  ])("leaves and does no more work once %s", async (_case, leave) => {
    const view = await renderSync({ client: cachedClient() });
    const channel = lastChannel();
    await report("SUBSCRIBED");
    await send({ v: 1, entidad: "cuenta" });

    await leave(view);

    expect(realtime!.fake.removeChannel).toHaveBeenCalledWith(channel);
    expect(getRealtimeStatus()).toBe("idle");
    // The pending flush is dropped, and late messages of the old channel are ignored.
    await report("SUBSCRIBED", channel);
    await send({ v: 1, entidad: "cuenta" }, channel);
    await elapse(SYNC_FLUSH_MS * 2);
    expect(view.invalidate).not.toHaveBeenCalled();
    expect(getRealtimeStatus()).toBe("idle");
    expect(joined()).toHaveLength(1);
  });

  it("moves to the new user's channel when the user changes", async () => {
    const { invalidate } = await renderSync();
    const first = lastChannel();
    await report("SUBSCRIBED");
    await send({ v: 1, entidad: "cuenta" });

    await act(async () => signIn(OTHER_USER));

    expect(realtime!.fake.removeChannel).toHaveBeenCalledWith(first);
    expect(lastChannel().topic).toBe(`usuario:${OTHER_USER}`);
    await elapse(SYNC_FLUSH_MS);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
