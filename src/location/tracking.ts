/**
 * Shares the volunteer's position with `POST /voluntario/ubicacion` while they are available
 * or on a route.
 *
 * Background updates go through a TaskManager task, defined at module scope: the OS can
 * launch the app headless (no React tree) just to deliver locations, so the root layout
 * imports this module for its side effect. When background location is not granted, a
 * foreground-only `watchPositionAsync` feeds the same handler.
 *
 * Headless session: the task reads the token from the session store; when it is empty (a
 * headless launch, where SessionProvider never ran) it restores the stored Supabase session
 * with `getSession()` and feeds the session store the same snapshot SessionProvider would.
 * With no session at all, the updates are stopped.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Alert, Platform } from "react-native";

import { isApiError } from "@/api/errors";
import type { Coordenada } from "@/api/types";
import { sessionStore } from "@/auth/session-store";
import { supabase } from "@/auth/supabase";
import { env } from "@/config/env";
import { registrarUbicacion } from "@/services/perfil";

import { SEND_THROTTLE, shouldSend, type LocationSample } from "./throttle";

export const VOLUNTEER_LOCATION_TASK = "findfood-volunteer-location";

/** How tracking ended up running (or why it is not). */
export type TrackingMode = "background" | "foreground" | "denied" | "blocked";
/** `cancelled`: a stop arrived while the start was still asking for permissions. */
export type TrackingResult = TrackingMode | "cancelled";
export type TrackingStatus = TrackingMode | "off";

// --- Task handler --------------------------------------------------------------------------

export interface LocationTaskEvent {
  data?: { locations?: readonly Location.LocationObject[] } | null;
  error?: { message: string } | null;
}

export interface LocationTaskDeps {
  /** The access token, restored if needed; null when there is no session. */
  ensureToken: () => Promise<string | null>;
  send: (position: Coordenada) => Promise<unknown>;
  stop: () => Promise<void>;
  /** The last sample sent; updated only after a successful send. */
  memory: { last: LocationSample | null };
}

export type TaskOutcome = "sent" | "throttled" | "skipped" | "stopped" | "failed";

function newest(locations: readonly Location.LocationObject[]): Location.LocationObject | null {
  let best: Location.LocationObject | null = null;
  for (const location of locations) {
    if (!best || location.timestamp > best.timestamp) best = location;
  }
  return best;
}

/** The session is gone or the account cannot share its position: stop asking the OS. */
function endsTracking(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return error.status === 401 || (error.status === 403 && error.type === "sin-perfil-voluntario");
}

/** The task body. Never throws: an exception would only reach the native task runner. */
export async function handleLocationTask(
  event: LocationTaskEvent,
  deps: LocationTaskDeps,
): Promise<TaskOutcome> {
  try {
    if (event.error) return "skipped";
    const location = newest(event.data?.locations ?? []);
    if (!location) return "skipped";
    const sample: LocationSample = {
      at: location.timestamp,
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    };
    if (!shouldSend(deps.memory.last, sample, SEND_THROTTLE)) return "throttled";
    if (!(await deps.ensureToken())) {
      await deps.stop();
      return "stopped";
    }
    // Only these two fields: the API rejects any other.
    await deps.send({ lat: sample.lat, lng: sample.lng });
    deps.memory.last = sample;
    return "sent";
  } catch (error) {
    if (endsTracking(error)) {
      await deps.stop().catch(() => undefined);
      return "stopped";
    }
    // Network or server failure: the next sample tries again.
    return "failed";
  }
}

/** See the module comment. Never rejects. */
export async function restoreAccessToken(): Promise<string | null> {
  const current = sessionStore.getAccessToken();
  if (current) return current;
  try {
    if (!supabase) {
      // The local profile's dev session lives in memory only.
      if (env.appEnv !== "local" || !env.devToken) return null;
      sessionStore.setSession({ status: "present", accessToken: env.devToken });
      return env.devToken;
    }
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return null;
    sessionStore.setSession({
      status: "present",
      accessToken: session.access_token,
      userId: session.user.id,
      email: session.user.email,
    });
    return session.access_token;
  } catch {
    return null;
  }
}

const memory: LocationTaskDeps["memory"] = { last: null };

const taskDeps: LocationTaskDeps = {
  ensureToken: restoreAccessToken,
  send: (position) => registrarUbicacion(position),
  stop: () => stopLocationTracking(),
  memory,
};

if (!TaskManager.isTaskDefined(VOLUNTEER_LOCATION_TASK)) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
    VOLUNTEER_LOCATION_TASK,
    async ({ data, error }) => {
      await handleLocationTask({ data, error }, taskDeps);
    },
  );
}

// --- Status (for the screens) -------------------------------------------------------------

let status: TrackingStatus = "off";
const listeners = new Set<() => void>();

function setStatus(next: TrackingStatus) {
  if (next === status) return;
  status = next;
  for (const listener of [...listeners]) listener();
}

export const trackingStatusStore = {
  get: (): TrackingStatus => status,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

// --- Prominent disclosure -----------------------------------------------------------------

/**
 * The volunteer's answer for this session (cleared on sign-out): asked once, so toggling
 * availability does not show it again.
 */
let disclosureAnswer: boolean | undefined;

/** Google Play requires this explanation before the background permission prompt. */
export function askBackgroundDisclosure(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Ubicación en segundo plano",
      "FindFood comparte tu ubicación con el equipo de coordinación mientras estás disponible o en una ruta, incluso cuando la app está cerrada o no la estás usando. Así podemos ofrecerte recogidas cercanas y seguir las entregas. Dejamos de compartirla cuando te marcas como no disponible sin una ruta en curso o cierras sesión.",
      [
        { text: "Ahora no", style: "cancel", onPress: () => resolve(false) },
        { text: "Continuar", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

async function backgroundConsent(disclose: () => Promise<boolean>): Promise<boolean> {
  disclosureAnswer ??= await disclose();
  return disclosureAnswer;
}

// --- Start / stop ---------------------------------------------------------------------------

const TASK_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 60_000,
  distanceInterval: 100,
  deferredUpdatesInterval: 60_000,
  pausesUpdatesAutomatically: true,
  activityType: Location.ActivityType.AutomotiveNavigation,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: "FindFood está usando tu ubicación",
    notificationBody: "Compartimos tu ubicación mientras estás disponible o en ruta.",
    killServiceOnDestroy: false,
  },
};

const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 60_000,
  distanceInterval: 100,
};

let watch: Location.LocationSubscription | null = null;
/** Moves on with every stop: a start still waiting on a prompt gives up. */
let epoch = 0;
/** Starts and stops run one after another, in call order. */
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const run = queue.then(operation, operation);
  queue = run.catch(() => undefined);
  return run;
}

async function backgroundStarted(): Promise<boolean> {
  try {
    return (
      (await TaskManager.isTaskRegisteredAsync(VOLUNTEER_LOCATION_TASK)) &&
      (await Location.hasStartedLocationUpdatesAsync(VOLUNTEER_LOCATION_TASK))
    );
  } catch {
    return false;
  }
}

async function startBackground(
  disclose: () => Promise<boolean>,
  current: () => boolean,
): Promise<boolean> {
  let permission = await Location.getBackgroundPermissionsAsync();
  if (!permission.granted) {
    if (!permission.canAskAgain || !(await backgroundConsent(disclose)) || !current()) {
      return false;
    }
    permission = await Location.requestBackgroundPermissionsAsync();
    if (!permission.granted || !current()) return false;
  }
  try {
    await Location.startLocationUpdatesAsync(VOLUNTEER_LOCATION_TASK, TASK_OPTIONS);
    return true;
  } catch {
    // E.g. the foreground service is not available: foreground only.
    return false;
  }
}

export interface StartOptions {
  /** Whether to ask for background location (false keeps it foreground only). */
  allowBackground: boolean;
  /** Shown before the background prompt; resolves to the volunteer's answer. */
  disclose?: () => Promise<boolean>;
}

/** Idempotent; never rejects. */
export function startLocationTracking({
  allowBackground,
  disclose = askBackgroundDisclosure,
}: StartOptions): Promise<TrackingResult> {
  const startedAt = epoch;
  const current = () => epoch === startedAt;
  return enqueue(async (): Promise<TrackingResult> => {
    try {
      if (!current()) return "cancelled";
      if (await backgroundStarted()) return report("background");
      if (watch) return report("foreground");
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (!current()) return "cancelled";
      if (!foreground.granted) return report(foreground.canAskAgain ? "denied" : "blocked");
      const background = allowBackground && Platform.OS !== "web";
      if (background && (await startBackground(disclose, current))) {
        return report("background");
      }
      if (!current()) return "cancelled";
      watch = await Location.watchPositionAsync(WATCH_OPTIONS, (location) => {
        void handleLocationTask({ data: { locations: [location] } }, taskDeps);
      });
      return report("foreground");
    } catch {
      return report("denied");
    }
  });
}

function report(mode: TrackingMode): TrackingMode {
  setStatus(mode);
  return mode;
}

/**
 * Stops whichever mode is running and forgets the last sample sent. `endSession` also
 * forgets the disclosure answer (sign-out). Never rejects.
 */
export function stopLocationTracking({ endSession = false }: { endSession?: boolean } = {}) {
  epoch += 1;
  if (endSession) disclosureAnswer = undefined;
  return enqueue(async () => {
    watch?.remove();
    watch = null;
    memory.last = null;
    setStatus("off");
    try {
      if (await backgroundStarted()) {
        await Location.stopLocationUpdatesAsync(VOLUNTEER_LOCATION_TASK);
      }
    } catch {
      // Nothing else to stop.
    }
  });
}
