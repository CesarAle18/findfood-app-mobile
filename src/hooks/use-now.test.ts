import { act, renderHook } from "@testing-library/react-native";

import { useNow } from "./use-now";

/** 10:15:30 — half a minute before the next boundary. */
const NOW = Date.parse("2026-11-19T15:15:30Z");

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useNow", () => {
  it("starts at the current time and ticks on the next minute boundary", async () => {
    const { result } = await renderHook(() => useNow());
    expect(result.current).toBe(NOW);

    await act(() => jest.advanceTimersByTimeAsync(29_999));
    expect(result.current).toBe(NOW);

    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(result.current).toBe(NOW + 30_000);

    await act(() => jest.advanceTimersByTimeAsync(60_000));
    expect(result.current).toBe(NOW + 90_000);
  });

  it("reads the clock on each tick, not the number of ticks", async () => {
    const { result } = await renderHook(() => useNow());

    // A suspended JS thread fires the timer late; the tick reads the real time.
    jest.setSystemTime(NOW + 5 * 60_000);
    await act(() => jest.advanceTimersByTimeAsync(30_000));

    expect(result.current).toBe(NOW + 5 * 60_000 + 30_000);
  });

  it("leaves no timer behind once unmounted", async () => {
    const { unmount } = await renderHook(() => useNow());
    await act(() => unmount());

    // A live clock would have scheduled its next minute by now.
    await act(() => jest.advanceTimersByTimeAsync(2 * 60_000));
    expect(jest.getTimerCount()).toBe(0);
  });
});
