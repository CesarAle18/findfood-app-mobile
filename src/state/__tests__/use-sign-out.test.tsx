import { act, renderHook } from "@testing-library/react-native";

import { useSignOut } from "@/state/use-sign-out";

const mockCerrarSesion = jest.fn<Promise<void>, []>();

jest.mock("@/state/session", () => ({
  useSessionActions: () => ({ cerrarSesion: mockCerrarSesion, setRecovering: async () => {} }),
}));

/** Makes the next `cerrarSesion` wait until the returned function is called. */
function holdSignOut(): () => void {
  let finish: () => void = () => {};
  mockCerrarSesion.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  return () => finish();
}

beforeEach(() => {
  mockCerrarSesion.mockReset().mockResolvedValue(undefined);
});

describe("useSignOut", () => {
  it("reports the sign-out as running until it finishes", async () => {
    const finish = holdSignOut();
    const { result } = await renderHook(() => useSignOut());
    expect(result.current.signingOut).toBe(false);

    await act(async () => result.current.signOut());
    expect(result.current.signingOut).toBe(true);

    await act(async () => finish());
    expect(result.current.signingOut).toBe(false);
  });

  it("ignores another request while one is running", async () => {
    const finish = holdSignOut();
    const { result } = await renderHook(() => useSignOut());

    // Twice before a re-render, e.g. a confirmation pressed twice.
    await act(async () => {
      result.current.signOut();
      result.current.signOut();
    });
    await act(async () => result.current.signOut());
    expect(mockCerrarSesion).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    await act(async () => result.current.signOut());
    expect(mockCerrarSesion).toHaveBeenCalledTimes(2);
  });
});
