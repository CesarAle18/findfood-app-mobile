import { act, renderHook } from "@testing-library/react-native";

import * as auth from "@/auth/supabase";

import { LIVE_EVENT, type LivePosition } from "./live-route";
import { parsePosition, useGlide, useVolunteerLivePosition } from "./volunteer-live-position";

type Broadcast = (message: { payload: unknown }) => void;
type StatusCallback = (status: string, error?: Error) => void;

/** What the hook registered on the channel: the broadcast handler and the status callback. */
const mockHandlers: { broadcast?: Broadcast; status?: StatusCallback } = {};
interface ChannelMock {
  on: jest.Mock<ChannelMock, [string, object, Broadcast]>;
  subscribe: jest.Mock<ChannelMock, [StatusCallback]>;
}
const mockChannel: ChannelMock = {
  on: jest.fn((_type: string, _filter: object, handler: Broadcast) => {
    mockHandlers.broadcast = handler;
    return mockChannel;
  }),
  subscribe: jest.fn((callback: StatusCallback) => {
    mockHandlers.status = callback;
    return mockChannel;
  }),
};
// `__esModule` so that `import * as auth` is the module itself and `replaceProperty` reaches the hook.
jest.mock("@/auth/supabase", () => ({
  __esModule: true,
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(async () => "ok"),
  },
}));

const supabase = auth.supabase!;

const position = (at: string, lat = 4.65): LivePosition => ({
  lat,
  lng: -74.06,
  rumbo: 90,
  velocidad_kmh: 30,
  precision_m: 6,
  at,
});

const emit = (payload: unknown) => act(async () => mockHandlers.broadcast?.({ payload }));
const report = (status: string, error?: Error) =>
  act(async () => mockHandlers.status?.(status, error));

beforeEach(() => {
  jest.clearAllMocks();
  delete mockHandlers.broadcast;
  delete mockHandlers.status;
});

describe("parsePosition", () => {
  it("keeps the volunteer app's payload as it comes", () => {
    const sent = position("2026-09-23T21:30:00.000Z");
    expect(parsePosition(sent)).toEqual(sent);
  });

  it("rejects what is not a point and nulls the optional fields it cannot read", () => {
    expect(parsePosition(null)).toBeNull();
    expect(parsePosition({ lat: "4.6", lng: -74 })).toBeNull();
    expect(parsePosition({ lat: 95, lng: -74 })).toBeNull();
    expect(parsePosition({ lat: 4.6, lng: -74, rumbo: "N", at: "2026-09-23T21:30:00.000Z" })).toEqual({
      lat: 4.6,
      lng: -74,
      rumbo: null,
      velocidad_kmh: null,
      precision_m: null,
      at: "2026-09-23T21:30:00.000Z",
    });
  });
});

describe("useVolunteerLivePosition", () => {
  it("listens to the route's private channel and shows each position", async () => {
    const { result } = await renderHook(() => useVolunteerLivePosition("ruta-1"));

    expect(supabase.channel).toHaveBeenCalledWith("ruta:ruta-1", { config: { private: true } });
    expect(mockChannel.on).toHaveBeenCalledWith(
      "broadcast",
      { event: LIVE_EVENT },
      expect.any(Function),
    );
    expect(result.current).toEqual({ status: "conectando", position: null });

    await report("SUBSCRIBED");
    await emit(position("2026-09-23T21:30:00.000Z"));

    expect(result.current).toEqual({
      status: "conectado",
      position: position("2026-09-23T21:30:00.000Z"),
    });
  });

  it("ignores payloads it cannot read and positions older than the one shown", async () => {
    const { result } = await renderHook(() => useVolunteerLivePosition("ruta-1"));
    await emit(position("2026-09-23T21:30:00.000Z"));

    await emit({ lat: "x" });
    await emit(position("2026-09-23T21:29:00.000Z", 4.7));

    expect(result.current.position).toEqual(position("2026-09-23T21:30:00.000Z"));

    await emit(position("2026-09-23T21:31:00.000Z", 4.66));
    expect(result.current.position?.lat).toBe(4.66);
  });

  it("tells a denied channel (sin-permiso) from any other failure", async () => {
    const { result } = await renderHook(() => useVolunteerLivePosition("ruta-1"));

    await report("CHANNEL_ERROR", new Error("Unauthorized: You do not have permissions"));
    expect(result.current.status).toBe("sin-permiso");

    await report("CHANNEL_ERROR", new Error("socket closed"));
    expect(result.current.status).toBe("error");

    await report("TIMED_OUT");
    expect(result.current.status).toBe("error");
  });

  it("leaves the channel on unmount and when the route changes", async () => {
    const { result, rerender, unmount } = await renderHook(
      ({ rutaId }: { rutaId: string | null }) => useVolunteerLivePosition(rutaId),
      { initialProps: { rutaId: "ruta-1" as string | null } },
    );
    await emit(position("2026-09-23T21:30:00.000Z"));

    await rerender({ rutaId: "ruta-2" });
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(supabase.channel).toHaveBeenLastCalledWith("ruta:ruta-2", { config: { private: true } });
    // A position of the previous route is never shown on the new one.
    expect(result.current).toEqual({ status: "conectando", position: null });

    await unmount();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(2);
    expect(supabase.removeChannel).toHaveBeenLastCalledWith(mockChannel);
  });

  it("opens no channel without a route in the live window", async () => {
    const { result } = await renderHook(() => useVolunteerLivePosition(null));

    expect(supabase.channel).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: null, position: null });
  });

  it("stays idle without a Supabase client (local profile)", async () => {
    const client = jest.replaceProperty(auth, "supabase", null);
    try {
      const { result } = await renderHook(() => useVolunteerLivePosition("ruta-1"));

      expect(supabase.channel).not.toHaveBeenCalled();
      expect(result.current).toEqual({ status: null, position: null });
    } finally {
      client.restore();
    }
  });
});

describe("useGlide", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("slides from the shown point to the new one instead of jumping", async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(
      ({ target }: { target: { lat: number; lng: number } | null }) => useGlide(target, 1000),
      { initialProps: { target: { lat: 4.6, lng: -74.0 } as { lat: number; lng: number } | null } },
    );
    expect(result.current).toEqual({ lat: 4.6, lng: -74.0 });

    await rerender({ target: { lat: 4.7, lng: -74.1 } });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current!.lat).toBeGreaterThan(4.6);
    expect(result.current!.lat).toBeLessThan(4.7);

    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(result.current).toEqual({ lat: 4.7, lng: -74.1 });
  });

  it("jumps straight to a target that comes back after a null", async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(
      ({ target }: { target: { lat: number; lng: number } | null }) => useGlide(target, 1000),
      { initialProps: { target: { lat: 4.6, lng: -74.0 } as { lat: number; lng: number } | null } },
    );
    await rerender({ target: null });
    expect(result.current).toBeNull();

    await rerender({ target: { lat: 4.9, lng: -74.3 } });
    expect(result.current).toEqual({ lat: 4.9, lng: -74.3 });
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current).toEqual({ lat: 4.9, lng: -74.3 });
  });

  it("shows nothing without a target, and stops animating on unmount", async () => {
    jest.useFakeTimers();
    const request = jest.spyOn(globalThis, "requestAnimationFrame");
    const cancel = jest.spyOn(globalThis, "cancelAnimationFrame");
    const { result, rerender, unmount } = await renderHook(
      ({ target }: { target: { lat: number; lng: number } | null }) => useGlide(target, 1000),
      { initialProps: { target: null as { lat: number; lng: number } | null } },
    );
    expect(result.current).toBeNull();

    await rerender({ target: { lat: 4.7, lng: -74.1 } });
    expect(result.current).toEqual({ lat: 4.7, lng: -74.1 });
    await rerender({ target: { lat: 4.8, lng: -74.2 } });
    await unmount();

    // The pending frame of the last glide is cancelled, so nothing updates after unmount.
    const lastFrame = request.mock.results.at(-1)?.value;
    expect(cancel).toHaveBeenLastCalledWith(lastFrame);
    request.mockRestore();
    cancel.mockRestore();
  });
});
