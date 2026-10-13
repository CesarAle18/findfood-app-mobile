/**
 * Remote push: how notifications show while the app is open, the Android channel the API
 * sends to (`"default"`), and registering this device's Expo push token with the API
 * (`POST /me/dispositivos`). Registration never throws: a simulator, a missing EAS project
 * id, a denied permission or a network failure only skip it, with a typed reason.
 */
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { toPermissionGate, type PermissionGate } from "@/platform/permissions";
import { registrarDispositivo, type PlataformaDispositivo } from "@/services/perfil";

/** The channel the API names in every push (`channelId: "default"`). */
export const PUSH_CHANNEL_ID = "default";

/** Foreground pushes show as a banner and in the list, with sound; the badge is left alone. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Android 13+ shows no permission prompt until a channel exists, so this runs first. */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "General",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

// --- Decisions (pure) --------------------------------------------------------------------

export type PushSkipReason =
  | "not-a-device"
  | "unsupported-platform"
  | "missing-project-id"
  | "permission-denied"
  | "permission-blocked"
  | "token-unavailable"
  | "register-failed";

export type PushRegistrationResult =
  | { status: "registered"; token: string }
  | { status: "unchanged"; token: string }
  | { status: "skipped"; reason: PushSkipReason };

export interface PushEnvironment {
  isDevice: boolean;
  os: string;
  projectId: string | null | undefined;
}

export type PushPlan =
  | { action: "skip"; reason: PushSkipReason }
  | { action: "proceed"; projectId: string; plataforma: PlataformaDispositivo };

const PLATFORMS: Record<string, PlataformaDispositivo | undefined> = {
  android: "ANDROID",
  ios: "IOS",
};

/** Whether this runtime can hold an Expo push token at all. */
export function pushRegistrationPlan({ isDevice, os, projectId }: PushEnvironment): PushPlan {
  const plataforma = PLATFORMS[os];
  if (!plataforma) return { action: "skip", reason: "unsupported-platform" };
  if (!isDevice) return { action: "skip", reason: "not-a-device" };
  if (!projectId) return { action: "skip", reason: "missing-project-id" };
  return { action: "proceed", projectId, plataforma };
}

/**
 * What to do with the current permission: ask only while the OS still shows the prompt
 * and this session has not asked yet, so a "no" is never followed by another prompt.
 */
export function permissionStep(
  gate: PermissionGate,
  askedThisSession: boolean,
): "granted" | "request" | "denied" | "blocked" {
  if (gate === "granted" || gate === "blocked") return gate;
  return askedThisSession ? "denied" : "request";
}

// --- Registration ------------------------------------------------------------------------

/** Per sign-in memo: cleared by `resetPushSession` when the signed-in effects unmount. */
let registeredToken: string | null = null;
let askedThisSession = false;
let inFlight: Promise<PushRegistrationResult> | null = null;
/** Bumped on reset, so an attempt still running at sign-out does not refill the memo. */
let generation = 0;

export function resetPushSession(): void {
  generation += 1;
  registeredToken = null;
  askedThisSession = false;
  inFlight = null;
}

function projectIdFromConfig(): string | undefined {
  const eas = Constants.expoConfig?.extra?.eas as { projectId?: unknown } | undefined;
  return typeof eas?.projectId === "string" ? eas.projectId : undefined;
}

async function grantedPermission(): Promise<PushSkipReason | null> {
  let step = permissionStep(
    toPermissionGate(await Notifications.getPermissionsAsync()),
    askedThisSession,
  );
  if (step === "request") {
    askedThisSession = true;
    step = permissionStep(toPermissionGate(await Notifications.requestPermissionsAsync()), true);
  }
  if (step === "granted") return null;
  return step === "blocked" ? "permission-blocked" : "permission-denied";
}

async function register(): Promise<PushRegistrationResult> {
  const session = generation;
  const plan = pushRegistrationPlan({
    isDevice: Device.isDevice,
    os: Platform.OS,
    projectId: projectIdFromConfig(),
  });
  if (plan.action === "skip") {
    if (plan.reason === "missing-project-id" && __DEV__) {
      console.warn(
        "[push] Sin extra.eas.projectId: define EAS_PROJECT_ID (eas init) para registrar notificaciones push.",
      );
    }
    return { status: "skipped", reason: plan.reason };
  }

  try {
    await ensureAndroidChannel();
    const denied = await grantedPermission();
    if (denied) return { status: "skipped", reason: denied };
  } catch {
    return { status: "skipped", reason: "permission-denied" };
  }

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId: plan.projectId })).data;
  } catch {
    // Offline or the push service is unreachable: the next sign-in or rotation retries.
    return { status: "skipped", reason: "token-unavailable" };
  }
  if (token === registeredToken) return { status: "unchanged", token };

  try {
    await registrarDispositivo({
      token_push: token,
      plataforma: plan.plataforma,
      modelo: Device.modelName ?? undefined,
      version_app: Constants.expoConfig?.version,
    });
  } catch {
    return { status: "skipped", reason: "register-failed" };
  }
  if (session === generation) registeredToken = token;
  return { status: "registered", token };
}

/**
 * Registers this device for the signed-in user. Concurrent calls share one attempt, and a
 * token already registered this session is not sent again.
 */
export function registerForPush(): Promise<PushRegistrationResult> {
  inFlight ??= register().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Registers while mounted (the signed-in effects) for accounts that receive pushes, and
 * again when the OS rotates the token. Unmounting (sign-out) forgets the session memo.
 */
export function usePushRegistration(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    void registerForPush();
    // The listener reports the native (FCM/APNs) token; the Expo token derives from it.
    const subscription = Notifications.addPushTokenListener(() => {
      void registerForPush();
    });
    return () => {
      subscription.remove();
      resetPushSession();
    };
  }, [enabled]);
}
