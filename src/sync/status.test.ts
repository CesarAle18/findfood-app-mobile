import { act, renderHook } from "@testing-library/react-native";
import { createElement, type ReactElement } from "react";

import {
  getRealtimeStatus,
  isRealtimeConnected,
  setRealtimeStatus,
  subscribeRealtimeStatus,
  useRealtimeConnected,
} from "./status";

beforeEach(() => {
  setRealtimeStatus("idle");
});

describe("realtime status", () => {
  it("starts idle and reports connected only once joined", () => {
    expect(getRealtimeStatus()).toBe("idle");
    expect(isRealtimeConnected()).toBe(false);

    setRealtimeStatus("connecting");
    expect(isRealtimeConnected()).toBe(false);
    setRealtimeStatus("connected");
    expect(getRealtimeStatus()).toBe("connected");
    expect(isRealtimeConnected()).toBe(true);
    setRealtimeStatus("error");
    expect(isRealtimeConnected()).toBe(false);
  });

  it("notifies subscribers of real changes only, until they unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeRealtimeStatus(listener);

    setRealtimeStatus("connecting");
    setRealtimeStatus("connecting");
    setRealtimeStatus("connected");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setRealtimeStatus("idle");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("useRealtimeConnected", () => {
  it("follows the store", async () => {
    const { result } = await renderHook(() => useRealtimeConnected());
    expect(result.current).toBe(false);

    await act(async () => setRealtimeStatus("connected"));
    expect(result.current).toBe(true);

    await act(async () => setRealtimeStatus("error"));
    expect(result.current).toBe(false);
  });

  it("is never connected when rendered on the server", () => {
    // As `scripts/check-render.cjs` renders screens (the project has no react-dom types).
    const { renderToStaticMarkup } = jest.requireActual<{
      renderToStaticMarkup: (element: ReactElement) => string;
    }>("react-dom/server");
    setRealtimeStatus("connected");
    function Probe() {
      return String(useRealtimeConnected());
    }

    expect(renderToStaticMarkup(createElement(Probe))).toBe("false");
  });
});
