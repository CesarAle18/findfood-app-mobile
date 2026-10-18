import { act, render, renderHook, screen } from "@testing-library/react-native";

import { Countdown, formatRemaining, useCountdown } from "../countdown";

const NOW = Date.parse("2026-10-13T20:00:00Z");
const inSeconds = (seconds: number) => new Date(NOW + seconds * 1_000).toISOString();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("formatRemaining", () => {
  it.each([
    [0, "00:00"],
    [-5_000, "00:00"],
    [400, "00:01"],
    [65_000, "01:05"],
    [59 * 60_000 + 59_000, "59:59"],
    [3_600_000, "1:00:00"],
    [2 * 3_600_000 + 5 * 60_000 + 9_000, "2:05:09"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe("useCountdown", () => {
  it("counts down from the deadline and fires onExpire once", async () => {
    const onExpire = jest.fn();
    const { result } = await renderHook(() => useCountdown(inSeconds(3), onExpire));

    expect(result.current).toEqual({ remainingMs: 3_000, expired: false });

    await act(() => jest.advanceTimersByTimeAsync(1_000));
    expect(result.current.remainingMs).toBe(2_000);

    await act(() => jest.advanceTimersByTimeAsync(2_000));
    expect(result.current).toEqual({ remainingMs: 0, expired: true });
    expect(onExpire).toHaveBeenCalledTimes(1);

    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("follows the clock, not the number of ticks", async () => {
    const { result } = await renderHook(() => useCountdown(inSeconds(60)));

    // A suspended JS thread skips ticks; the next tick reads the real time.
    jest.setSystemTime(NOW + 30_500);
    await act(() => jest.advanceTimersByTimeAsync(1_000));

    expect(result.current.remainingMs).toBe(28_500);
  });

  it("is expired at once for a past deadline", async () => {
    const onExpire = jest.fn();
    const { result } = await renderHook(() => useCountdown(inSeconds(-10), onExpire));

    expect(result.current.expired).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("expires at once when the deadline moves into the past after mount", async () => {
    const onExpire = jest.fn();
    const { result, rerender } = await renderHook(
      ({ expiresAt }: { expiresAt: string }) => useCountdown(expiresAt, onExpire),
      { initialProps: { expiresAt: inSeconds(60) } },
    );

    // The clock moves without a tick, then the deadline changes to one already past.
    jest.setSystemTime(NOW + 10_500);
    await rerender({ expiresAt: inSeconds(5) });

    expect(result.current).toEqual({ remainingMs: 0, expired: true });
    expect(onExpire).toHaveBeenCalledTimes(1);
    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("counts from the current time when the deadline moves forward after mount", async () => {
    const { result, rerender } = await renderHook(
      ({ expiresAt }: { expiresAt: string }) => useCountdown(expiresAt),
      { initialProps: { expiresAt: inSeconds(60) } },
    );

    jest.setSystemTime(NOW + 10_500);
    await rerender({ expiresAt: inSeconds(120) });

    expect(result.current).toEqual({ remainingMs: 109_500, expired: false });
  });

  it("does nothing without a deadline", async () => {
    const onExpire = jest.fn();
    const { result } = await renderHook(() => useCountdown(null, onExpire));

    expect(result.current).toEqual({ remainingMs: 0, expired: false });
    expect(onExpire).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(result.current).toEqual({ remainingMs: 0, expired: false });
    expect(onExpire).not.toHaveBeenCalled();
  });
});

describe("Countdown", () => {
  it("shows the time left and announces it in minutes", async () => {
    await render(<Countdown expiresAt={inSeconds(185)} />);

    expect(screen.getByText("Vence en 03:05")).toBeOnTheScreen();
    expect(screen.getByLabelText("Vence en 3 minutos")).toBeOnTheScreen();

    await act(() => jest.advanceTimersByTimeAsync(130_000));
    expect(screen.getByText("Vence en 00:55")).toBeOnTheScreen();
    expect(screen.getByLabelText("Vence en menos de un minuto")).toBeOnTheScreen();
  });

  it("says when it expired", async () => {
    const onExpire = jest.fn();
    await render(<Countdown expiresAt={inSeconds(1)} onExpire={onExpire} />);

    await act(() => jest.advanceTimersByTimeAsync(1_000));

    expect(screen.getByText("Vencida")).toBeOnTheScreen();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});
