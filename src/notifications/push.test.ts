import * as Notifications from "expo-notifications";

import { registrarDispositivo } from "@/services/perfil";

import {
  permissionStep,
  pushRegistrationPlan,
  registerForPush,
  resetPushSession,
} from "./push";

const mockDevice = { isDevice: true, modelName: "iPhone 15" as string | null };
const mockConfig = {
  expoConfig: { version: "1.2.0", extra: { eas: { projectId: "proj-1" as string | undefined } } },
};

jest.mock("expo-device", () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
  get modelName() {
    return mockDevice.modelName;
  },
}));

// Only `expoConfig` changes: expo-asset still reads the rest of the real constants.
jest.mock("expo-constants", () => {
  const actual = jest.requireActual<typeof import("expo-constants")>("expo-constants");
  return {
    ...actual,
    __esModule: true,
    default: Object.create(actual.default, {
      expoConfig: { get: () => mockConfig.expoConfig },
    }),
  };
});

jest.mock("@/services/perfil", () => ({
  registrarDispositivo: jest.fn(async () => ({ id: "device-1" })),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const register = registrarDispositivo as jest.Mock;

const permission = (granted: boolean, canAskAgain = true) =>
  ({
    status: granted ? "granted" : "undetermined",
    granted,
    canAskAgain,
    expires: "never",
  }) as Notifications.NotificationPermissionsStatus;

beforeEach(() => {
  resetPushSession();
  mockDevice.isDevice = true;
  mockConfig.expoConfig.extra.eas.projectId = "proj-1";
  register.mockClear();
  mocked.getPermissionsAsync.mockClear().mockResolvedValue(permission(true));
  mocked.requestPermissionsAsync.mockClear().mockResolvedValue(permission(true));
  mocked.getExpoPushTokenAsync
    .mockClear()
    .mockResolvedValue({ type: "expo", data: "ExponentPushToken[test]" });
});

describe("pushRegistrationPlan", () => {
  it("proceeds on a physical Android or iOS device with a project id", () => {
    expect(pushRegistrationPlan({ isDevice: true, os: "android", projectId: "p" })).toEqual({
      action: "proceed",
      projectId: "p",
      plataforma: "ANDROID",
    });
    expect(pushRegistrationPlan({ isDevice: true, os: "ios", projectId: "p" })).toMatchObject({
      plataforma: "IOS",
    });
  });

  it("skips the web, simulators and builds without an EAS project id", () => {
    expect(pushRegistrationPlan({ isDevice: true, os: "web", projectId: "p" })).toEqual({
      action: "skip",
      reason: "unsupported-platform",
    });
    expect(pushRegistrationPlan({ isDevice: false, os: "ios", projectId: "p" })).toEqual({
      action: "skip",
      reason: "not-a-device",
    });
    expect(pushRegistrationPlan({ isDevice: true, os: "ios", projectId: undefined })).toEqual({
      action: "skip",
      reason: "missing-project-id",
    });
  });
});

describe("permissionStep", () => {
  it("asks at most once per session and never when the OS will not show the prompt", () => {
    expect(permissionStep("granted", false)).toBe("granted");
    expect(permissionStep("denied", false)).toBe("request");
    expect(permissionStep("unknown", false)).toBe("request");
    expect(permissionStep("denied", true)).toBe("denied");
    expect(permissionStep("blocked", false)).toBe("blocked");
  });
});

describe("registerForPush", () => {
  it("registers the Expo token with the platform, model and app version", async () => {
    await expect(registerForPush()).resolves.toEqual({
      status: "registered",
      token: "ExponentPushToken[test]",
    });
    expect(mocked.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(register).toHaveBeenCalledWith({
      token_push: "ExponentPushToken[test]",
      plataforma: "IOS",
      modelo: "iPhone 15",
      version_app: "1.2.0",
    });
  });

  it("does not send the same token twice in one session, and again after a reset", async () => {
    await registerForPush();
    await expect(registerForPush()).resolves.toMatchObject({ status: "unchanged" });
    expect(register).toHaveBeenCalledTimes(1);

    resetPushSession();
    await registerForPush();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("re-registers when the token rotates", async () => {
    await registerForPush();
    mocked.getExpoPushTokenAsync.mockResolvedValue({ type: "expo", data: "ExponentPushToken[new]" });

    await registerForPush();

    expect(register).toHaveBeenLastCalledWith(
      expect.objectContaining({ token_push: "ExponentPushToken[new]" }),
    );
  });

  it("skips without a project id, warning in development", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mockConfig.expoConfig.extra.eas.projectId = undefined;

    await expect(registerForPush()).resolves.toEqual({
      status: "skipped",
      reason: "missing-project-id",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EAS_PROJECT_ID"));
    expect(mocked.getExpoPushTokenAsync).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("skips on a simulator", async () => {
    mockDevice.isDevice = false;
    await expect(registerForPush()).resolves.toEqual({ status: "skipped", reason: "not-a-device" });
    expect(mocked.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks for permission once per session after a refusal", async () => {
    mocked.getPermissionsAsync.mockResolvedValue(permission(false));
    mocked.requestPermissionsAsync.mockResolvedValue(permission(false));

    await expect(registerForPush()).resolves.toEqual({
      status: "skipped",
      reason: "permission-denied",
    });
    await registerForPush();

    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
  });

  it("never prompts when the permission is blocked", async () => {
    mocked.getPermissionsAsync.mockResolvedValue(permission(false, false));

    await expect(registerForPush()).resolves.toEqual({
      status: "skipped",
      reason: "permission-blocked",
    });
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("survives a token request that fails offline", async () => {
    mocked.getExpoPushTokenAsync.mockRejectedValue(new Error("offline"));

    await expect(registerForPush()).resolves.toEqual({
      status: "skipped",
      reason: "token-unavailable",
    });
    expect(register).not.toHaveBeenCalled();
  });

  it("shares one attempt between concurrent calls", async () => {
    await Promise.all([registerForPush(), registerForPush()]);
    expect(mocked.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  });
});
