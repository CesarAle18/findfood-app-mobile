import { createSessionStore, sessionStore } from "./session-store";

describe("session store", () => {
  it("starts loading without a token", () => {
    const store = createSessionStore();

    expect(store.getSnapshot()).toEqual({ status: "loading", accessToken: null });
    expect(store.getAccessToken()).toBeNull();
  });

  it("exports an app-wide instance", () => {
    expect(sessionStore.getSnapshot().status).toBe("loading");
  });

  it("publishes a new snapshot to its subscribers", () => {
    const store = createSessionStore();
    const listener = jest.fn();
    store.subscribe(listener);

    store.setSession({
      status: "present",
      accessToken: "token-1",
      userId: "u-1",
      email: "ana@example.com",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({
      status: "present",
      accessToken: "token-1",
      userId: "u-1",
      email: "ana@example.com",
    });
    expect(store.getAccessToken()).toBe("token-1");
  });

  it("keeps the snapshot and stays quiet when nothing changed", () => {
    const store = createSessionStore();
    store.setSession({ status: "present", accessToken: "token-1", userId: "u-1" });
    const snapshot = store.getSnapshot();
    const listener = jest.fn();
    store.subscribe(listener);

    store.setSession({ status: "present", accessToken: "token-1", userId: "u-1" });

    expect(store.getSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies when only the token rotates", () => {
    const store = createSessionStore();
    store.setSession({ status: "present", accessToken: "token-1" });
    const listener = jest.fn();
    store.subscribe(listener);

    store.setSession({ status: "present", accessToken: "token-2" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getAccessToken()).toBe("token-2");
  });

  it("stops notifying after unsubscribe", () => {
    const store = createSessionStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.setSession({ status: "none", accessToken: null });

    expect(listener).not.toHaveBeenCalled();
  });

  it("works with detached methods", () => {
    const store = createSessionStore();
    const { getAccessToken, setSession, notifyUnauthorized } = store;
    const handler = jest.fn();
    store.setUnauthorizedHandler(handler);

    setSession({ status: "present", accessToken: "token-1" });
    notifyUnauthorized();

    expect(getAccessToken()).toBe("token-1");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("unauthorized handler", () => {
  it("does nothing without a handler", () => {
    const store = createSessionStore();

    expect(() => store.notifyUnauthorized()).not.toThrow();
  });

  it("calls the registered handler on every notification", () => {
    const store = createSessionStore();
    const handler = jest.fn();
    store.setUnauthorizedHandler(handler);

    store.notifyUnauthorized();
    store.notifyUnauthorized();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("replaces the previous handler", () => {
    const store = createSessionStore();
    const first = jest.fn();
    const second = jest.fn();
    store.setUnauthorizedHandler(first);
    store.setUnauthorizedHandler(second);

    store.notifyUnauthorized();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("only removes its own registration", () => {
    const store = createSessionStore();
    const first = jest.fn();
    const second = jest.fn();
    const removeFirst = store.setUnauthorizedHandler(first);
    const removeSecond = store.setUnauthorizedHandler(second);

    removeFirst();
    store.notifyUnauthorized();
    expect(second).toHaveBeenCalledTimes(1);

    removeSecond();
    store.notifyUnauthorized();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("never lets a failing handler reach the caller", async () => {
    const store = createSessionStore();
    store.setUnauthorizedHandler(() => {
      throw new Error("sync failure");
    });
    expect(() => store.notifyUnauthorized()).not.toThrow();

    const rejected = jest.fn(() => Promise.reject(new Error("async failure")));
    store.setUnauthorizedHandler(rejected);
    expect(() => store.notifyUnauthorized()).not.toThrow();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(rejected).toHaveBeenCalledTimes(1);
  });
});
