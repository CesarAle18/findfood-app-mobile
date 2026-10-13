import { renderHook } from "@testing-library/react-native";
import { PermissionStatus, type PermissionResponse } from "expo";

import { type PermissionHook, toPermissionGate, usePermissionGate } from "./permissions";

const response = (
  status: PermissionStatus,
  canAskAgain: boolean,
): PermissionResponse => ({
  status,
  granted: status === PermissionStatus.GRANTED,
  canAskAgain,
  expires: "never",
});

describe("toPermissionGate", () => {
  it("is unknown until the status has loaded", () => {
    expect(toPermissionGate(null)).toBe("unknown");
    expect(toPermissionGate(undefined)).toBe("unknown");
  });

  it("is granted when the permission is granted", () => {
    expect(toPermissionGate(response(PermissionStatus.GRANTED, true))).toBe("granted");
    // A granted permission stays granted even if the OS would not ask again.
    expect(toPermissionGate(response(PermissionStatus.GRANTED, false))).toBe("granted");
  });

  it("is denied while the app can still ask (never asked, or denied once)", () => {
    expect(toPermissionGate(response(PermissionStatus.UNDETERMINED, true))).toBe("denied");
    expect(toPermissionGate(response(PermissionStatus.DENIED, true))).toBe("denied");
  });

  it("is blocked when the OS will not show the prompt again", () => {
    expect(toPermissionGate(response(PermissionStatus.DENIED, false))).toBe("blocked");
    expect(toPermissionGate(response(PermissionStatus.UNDETERMINED, false))).toBe("blocked");
  });
});

describe("usePermissionGate", () => {
  it("reports the hook's current gate and resolves a request to the new one", async () => {
    const requestPermission = jest.fn(async () => response(PermissionStatus.DENIED, false));
    const useFakePermissions: PermissionHook = () => [
      response(PermissionStatus.UNDETERMINED, true),
      requestPermission,
      jest.fn(),
    ];

    const { result } = await renderHook(() => usePermissionGate(useFakePermissions));

    expect(result.current.gate).toBe("denied");
    await expect(result.current.request()).resolves.toBe("blocked");
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it("is unknown while the hook has no status yet", async () => {
    const useLoading: PermissionHook = () => [null, jest.fn(), jest.fn()];

    const { result } = await renderHook(() => usePermissionGate(useLoading));

    expect(result.current.gate).toBe("unknown");
  });
});
