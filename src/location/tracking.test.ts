import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { ApiError } from "@/api/errors";
import { sessionStore } from "@/auth/session-store";
import { supabase } from "@/auth/supabase";

import {
  handleLocationTask,
  restoreAccessToken,
  startLocationTracking,
  stopLocationTracking,
  trackingStatusStore,
  VOLUNTEER_LOCATION_TASK,
  type LocationTaskDeps,
} from "./tracking";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

jest.mock("@/config/env", () => ({ env: { appEnv: "real", apiUrl: "http://api.test" } }));

jest.mock("@/auth/supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
  signOutLocally: jest.fn(),
}));

const mockedLocation = jest.mocked(Location);
const mockedTaskManager = jest.mocked(TaskManager);
const getSession = jest.mocked(supabase!.auth.getSession);

const granted = { status: "granted", granted: true, canAskAgain: true, expires: "never" };
const denied = { status: "denied", granted: false, canAskAgain: true, expires: "never" };
const blocked = { status: "denied", granted: false, canAskAgain: false, expires: "never" };

function location(timestamp: number, latitude: number, longitude: number) {
  return {
    timestamp,
    coords: {
      latitude,
      longitude,
      altitude: 2600,
      accuracy: 20,
      altitudeAccuracy: null,
      heading: null,
      speed: 5,
    },
  } as Location.LocationObject;
}

function deps(overrides: Partial<LocationTaskDeps> = {}): LocationTaskDeps {
  return {
    ensureToken: jest.fn(async () => "token"),
    send: jest.fn(async () => ({ registrada: true })),
    stop: jest.fn(async () => undefined),
    memory: { last: null },
    ...overrides,
  };
}

function problem(status: number, type: string) {
  return new ApiError({ status, type, title: type });
}

// Recorded when the module loaded, before any test cleared the mocks.
const definedTasks = mockedTaskManager.defineTask.mock.calls.map(([name]) => name);

it("defines the background task at module load", () => {
  expect(definedTasks).toEqual([VOLUNTEER_LOCATION_TASK]);
});

describe("handleLocationTask", () => {
  it("sends only lat and lng of the newest location", async () => {
    const d = deps();
    const outcome = await handleLocationTask(
      { data: { locations: [location(2_000, 4.7, -74.1), location(1_000, 4.6, -74.0)] } },
      d,
    );

    expect(outcome).toBe("sent");
    expect(d.send).toHaveBeenCalledWith({ lat: 4.7, lng: -74.1 });
    expect(Object.keys(jest.mocked(d.send).mock.calls[0][0])).toEqual(["lat", "lng"]);
    expect(d.memory.last).toEqual({ at: 2_000, lat: 4.7, lng: -74.1 });
  });

  it("throttles a nearby sample within the minute", async () => {
    const d = deps();
    await handleLocationTask({ data: { locations: [location(0, 4.7, -74.1)] } }, d);
    const outcome = await handleLocationTask(
      { data: { locations: [location(10_000, 4.7001, -74.1)] } },
      d,
    );

    expect(outcome).toBe("throttled");
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it("skips errors and empty batches", async () => {
    const d = deps();
    expect(await handleLocationTask({ error: { message: "boom" } }, d)).toBe("skipped");
    expect(await handleLocationTask({ data: { locations: [] } }, d)).toBe("skipped");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("stops when there is no session", async () => {
    const d = deps({ ensureToken: jest.fn(async () => null) });
    const outcome = await handleLocationTask({ data: { locations: [location(0, 4, -74)] } }, d);

    expect(outcome).toBe("stopped");
    expect(d.send).not.toHaveBeenCalled();
    expect(d.stop).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "no-autenticado"],
    [403, "sin-perfil-voluntario"],
  ])("stops on %i %s", async (status, type) => {
    const d = deps({ send: jest.fn(async () => Promise.reject(problem(status, type))) });
    const outcome = await handleLocationTask({ data: { locations: [location(0, 4, -74)] } }, d);

    expect(outcome).toBe("stopped");
    expect(d.stop).toHaveBeenCalledTimes(1);
    expect(d.memory.last).toBeNull();
  });

  it("keeps tracking after a transient failure and retries the next sample", async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(problem(500, "error-interno"))
      .mockResolvedValueOnce({ registrada: true });
    const d = deps({ send });

    expect(await handleLocationTask({ data: { locations: [location(0, 4, -74)] } }, d)).toBe(
      "failed",
    );
    expect(await handleLocationTask({ data: { locations: [location(5, 4, -74)] } }, d)).toBe(
      "sent",
    );
    expect(d.stop).not.toHaveBeenCalled();
  });
});

describe("restoreAccessToken", () => {
  afterEach(() => sessionStore.setSession({ status: "none", accessToken: null }));

  it("uses the token already in the session store", async () => {
    sessionStore.setSession({ status: "present", accessToken: "live" });
    expect(await restoreAccessToken()).toBe("live");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("restores the stored Supabase session into the session store (headless launch)", async () => {
    getSession.mockResolvedValueOnce({
      data: { session: { access_token: "stored", user: { id: "u1", email: "a@b.co" } } },
      error: null,
    } as never);

    expect(await restoreAccessToken()).toBe("stored");
    expect(sessionStore.getSnapshot()).toEqual({
      status: "present",
      accessToken: "stored",
      userId: "u1",
      email: "a@b.co",
    });
  });

  it("returns null without a stored session", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null }, error: null } as never);
    expect(await restoreAccessToken()).toBeNull();
  });
});

describe("start and stop", () => {
  beforeEach(async () => {
    await stopLocationTracking({ endSession: true });
    jest.clearAllMocks();
    mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(granted as never);
    mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(denied as never);
    mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue(granted as never);
  });

  it("explains background use before asking, then starts the background task", async () => {
    const disclose = jest.fn(async () => true);

    expect(await startLocationTracking({ allowBackground: true, disclose })).toBe("background");

    expect(disclose).toHaveBeenCalledTimes(1);
    expect(disclose.mock.invocationCallOrder[0]).toBeLessThan(
      mockedLocation.requestBackgroundPermissionsAsync.mock.invocationCallOrder[0],
    );
    expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
      VOLUNTEER_LOCATION_TASK,
      expect.objectContaining({
        timeInterval: 60_000,
        distanceInterval: 100,
        foregroundService: expect.objectContaining({
          notificationTitle: "FindFood está usando tu ubicación",
        }),
      }),
    );
    expect(trackingStatusStore.get()).toBe("background");
  });

  it("falls back to foreground when the volunteer says 'Ahora no', and asks once per session", async () => {
    const disclose = jest.fn(async () => false);

    expect(await startLocationTracking({ allowBackground: true, disclose })).toBe("foreground");
    expect(mockedLocation.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedLocation.watchPositionAsync).toHaveBeenCalledTimes(1);

    await stopLocationTracking();
    expect(await startLocationTracking({ allowBackground: true, disclose })).toBe("foreground");
    expect(disclose).toHaveBeenCalledTimes(1);
  });

  it("skips the disclosure when background location is already granted", async () => {
    mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(granted as never);
    const disclose = jest.fn(async () => true);

    expect(await startLocationTracking({ allowBackground: true, disclose })).toBe("background");
    expect(disclose).not.toHaveBeenCalled();
  });

  it.each([
    [denied, "denied"],
    [blocked, "blocked"],
  ])("reports a refused foreground permission", async (permission, mode) => {
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue(permission as never);

    expect(await startLocationTracking({ allowBackground: true })).toBe(mode);
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(mockedLocation.watchPositionAsync).not.toHaveBeenCalled();
    expect(trackingStatusStore.get()).toBe(mode);
  });

  it("does not start twice", async () => {
    mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

    expect(await startLocationTracking({ allowBackground: true })).toBe("background");
    expect(mockedLocation.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });

  it("stops the background task and the foreground watch", async () => {
    const remove = jest.fn();
    mockedLocation.watchPositionAsync.mockResolvedValueOnce({ remove });
    await startLocationTracking({ allowBackground: false });
    mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

    await stopLocationTracking();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(VOLUNTEER_LOCATION_TASK);
    expect(trackingStatusStore.get()).toBe("off");
  });

  it("gives up on a start still waiting for the disclosure when a stop arrives", async () => {
    let answer: ((value: boolean) => void) | null = null;
    const disclose = () =>
      new Promise<boolean>((resolve) => {
        answer = resolve;
      });

    const start = startLocationTracking({ allowBackground: true, disclose });
    while (!answer) await new Promise<void>((resolve) => setImmediate(resolve));
    const stop = stopLocationTracking();
    (answer as (value: boolean) => void)(true);

    expect(await start).toBe("cancelled");
    await stop;
    expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    expect(mockedLocation.watchPositionAsync).not.toHaveBeenCalled();
  });
});
