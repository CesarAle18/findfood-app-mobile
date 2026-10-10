import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type * as TanStackQuery from "@tanstack/react-query";
import type * as ExpoNetwork from "expo-network";
import type * as ReactNative from "react-native";

import { ApiError } from "./errors";
import type * as QueryClientModule from "./query-client";
import { createQueryClient, shouldRetryQuery } from "./query-client";

jest.mock("expo-network", () => ({
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
}));

type NetworkState = Pick<ExpoNetwork.NetworkState, "isConnected" | "isInternetReachable">;

describe("query retries", () => {
  const clients: QueryClient[] = [];
  /** Cleared after each test: cached entries hold a 5-minute gc timer. */
  function newClient(): QueryClient {
    const client = createQueryClient();
    clients.push(client);
    return client;
  }

  afterEach(() => {
    for (const client of clients.splice(0)) client.clear();
  });

  it.each([400, 401, 403, 404, 409, 422, 429])("never retries a %i ApiError", (status) => {
    const error = new ApiError({ type: "x", status, title: "x" });

    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it.each([
    ["a 500", new ApiError({ type: "error-interno", status: 500, title: "x" })],
    ["a 503", new ApiError({ type: "error-interno", status: 503, title: "x" })],
    ["no connection", ApiError.network(new TypeError("Network request failed"))],
    ["a timeout", ApiError.timeout()],
    ["a non-API error", new Error("boom")],
  ])("retries %s at most twice", (_label, error) => {
    expect(shouldRetryQuery(0, error)).toBe(true);
    expect(shouldRetryQuery(1, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(false);
  });

  it("configures the client defaults", () => {
    const client = createQueryClient();
    const { queries, mutations } = client.getDefaultOptions();

    expect(queries?.retry).toBe(shouldRetryQuery);
    expect(queries?.staleTime).toBe(30_000);
    expect(mutations?.retry).toBe(false);
  });

  it("stops a query after two retries", async () => {
    const client = newClient();
    const queryFn = jest.fn(async () => {
      throw ApiError.timeout();
    });

    await expect(
      client.fetchQuery({ queryKey: ["retries"], queryFn, retryDelay: 0 }),
    ).rejects.toMatchObject({ type: "tiempo-agotado" });
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it("does not retry a mutation", async () => {
    const client = newClient();
    const mutationFn = jest.fn(async () => {
      throw ApiError.timeout();
    });
    const observer = new MutationObserver(client, { mutationFn });

    await expect(observer.mutate()).rejects.toMatchObject({
      type: "tiempo-agotado",
    });
    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});

interface LoadedManagers {
  setupQueryManagers: typeof QueryClientModule.setupQueryManagers;
  focusManager: typeof TanStackQuery.focusManager;
  onlineManager: typeof TanStackQuery.onlineManager;
  addAppStateListener: jest.SpyInstance;
  removeAppStateListener: jest.Mock;
  emitAppState: (state: ReactNative.AppStateStatus) => void;
  addNetworkListener: jest.MockedFunction<typeof ExpoNetwork.addNetworkStateListener>;
  removeNetworkListener: jest.Mock;
  emitNetwork: (state: NetworkState) => void;
}

/**
 * Loads query-client in a fresh module registry (fresh managers and setup flag) on the
 * given platform, with AppState and expo-network listeners captured.
 *
 * Uses resetModules, not isolateModules: react-native exposes AppState and Platform
 * through lazy getters that resolve from the main registry once an isolated block ends,
 * so `setupQueryManagers()` must see the same registry as the spies.
 */
function loadManagers(
  os: "ios" | "android" | "web",
  initialNetwork: Promise<NetworkState> = new Promise(() => {}),
): LoadedManagers {
  jest.resetModules();
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { AppState, Platform } = require("react-native") as typeof ReactNative;
  const Network = require("expo-network") as jest.Mocked<typeof ExpoNetwork>;
  const tanstack = require("@tanstack/react-query") as typeof TanStackQuery;
  const module = require("./query-client") as typeof QueryClientModule;
  /* eslint-enable @typescript-eslint/no-require-imports */

  jest.replaceProperty(Platform, "OS", os);
  let appStateListener: (state: ReactNative.AppStateStatus) => void = () => {};
  const removeAppStateListener = jest.fn();
  const addAppStateListener = jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: removeAppStateListener } as unknown as ReactNative.NativeEventSubscription;
    });

  let networkListener: (state: NetworkState) => void = () => {};
  const removeNetworkListener = jest.fn();
  Network.addNetworkStateListener.mockImplementation((listener) => {
    networkListener = listener as (state: NetworkState) => void;
    return { remove: removeNetworkListener };
  });
  Network.getNetworkStateAsync.mockImplementation(
    () => initialNetwork as Promise<ExpoNetwork.NetworkState>,
  );

  return {
    setupQueryManagers: module.setupQueryManagers,
    focusManager: tanstack.focusManager,
    onlineManager: tanstack.onlineManager,
    addAppStateListener,
    removeAppStateListener,
    emitAppState: (state) => appStateListener(state),
    addNetworkListener: Network.addNetworkStateListener,
    removeNetworkListener,
    emitNetwork: (state) => networkListener(state),
  };
}

describe("setupQueryManagers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("drives the focus manager from AppState", () => {
    const managers = loadManagers("ios");
    managers.setupQueryManagers();

    expect(managers.addAppStateListener).toHaveBeenCalledWith("change", expect.any(Function));
    managers.emitAppState("background");
    expect(managers.focusManager.isFocused()).toBe(false);
    managers.emitAppState("active");
    expect(managers.focusManager.isFocused()).toBe(true);
    managers.emitAppState("inactive");
    expect(managers.focusManager.isFocused()).toBe(false);
  });

  it("drives the online manager from expo-network", () => {
    const managers = loadManagers("android");
    managers.setupQueryManagers();

    expect(managers.addNetworkListener).toHaveBeenCalledTimes(1);
    managers.emitNetwork({ isConnected: false, isInternetReachable: false });
    expect(managers.onlineManager.isOnline()).toBe(false);
    managers.emitNetwork({ isConnected: true, isInternetReachable: true });
    expect(managers.onlineManager.isOnline()).toBe(true);
    managers.emitNetwork({ isConnected: true, isInternetReachable: false });
    expect(managers.onlineManager.isOnline()).toBe(false);
    // Reachability not determined yet: trust the connection.
    managers.emitNetwork({ isConnected: true, isInternetReachable: undefined });
    expect(managers.onlineManager.isOnline()).toBe(true);
    managers.emitNetwork({ isConnected: undefined, isInternetReachable: undefined });
    expect(managers.onlineManager.isOnline()).toBe(false);
  });

  it("seeds the online state from the current network state", async () => {
    const managers = loadManagers(
      "ios",
      Promise.resolve({ isConnected: false, isInternetReachable: false }),
    );
    managers.setupQueryManagers();
    await Promise.resolve();
    await Promise.resolve();

    expect(managers.onlineManager.isOnline()).toBe(false);
  });

  it("lets a network event win over a late initial state", async () => {
    let resolveInitial: (state: NetworkState) => void = () => {};
    const managers = loadManagers(
      "ios",
      new Promise((resolve) => {
        resolveInitial = resolve;
      }),
    );
    managers.setupQueryManagers();

    managers.emitNetwork({ isConnected: true, isInternetReachable: true });
    resolveInitial({ isConnected: false, isInternetReachable: false });
    await Promise.resolve();
    await Promise.resolve();

    expect(managers.onlineManager.isOnline()).toBe(true);
  });

  it("ignores a failing initial network read", async () => {
    const managers = loadManagers("ios", Promise.reject(new Error("unavailable")));
    managers.setupQueryManagers();
    await Promise.resolve();
    await Promise.resolve();

    expect(managers.onlineManager.isOnline()).toBe(true);
  });

  it("registers each listener only once", () => {
    const managers = loadManagers("ios");

    managers.setupQueryManagers();
    managers.setupQueryManagers();

    expect(managers.addAppStateListener).toHaveBeenCalledTimes(1);
    expect(managers.addNetworkListener).toHaveBeenCalledTimes(1);
    expect(managers.removeAppStateListener).not.toHaveBeenCalled();
    expect(managers.removeNetworkListener).not.toHaveBeenCalled();
  });

  it("keeps the browser focus handling on web", () => {
    const managers = loadManagers("web");
    managers.setupQueryManagers();

    expect(managers.addAppStateListener).not.toHaveBeenCalled();
    expect(managers.addNetworkListener).toHaveBeenCalledTimes(1);
  });
});
