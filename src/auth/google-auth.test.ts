import type * as GoogleSigninModule from "@react-native-google-signin/google-signin";
import { AuthApiError, isAuthError } from "@supabase/supabase-js";
import { Platform } from "react-native";

import { messageFor } from "@/api/problem-messages";
import type { Env } from "@/config/env";

import type * as GoogleAuthModule from "./google-auth";

// The native module is replaced by the library's own Jest double (jest.setup.ts): status
// codes and response helpers are the real ones; the API calls are replaced here.
const mockGoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
};

jest.mock("@react-native-google-signin/google-signin", () => ({
  ...jest.requireActual<typeof GoogleSigninModule>("@react-native-google-signin/google-signin"),
  GoogleSignin: mockGoogleSignin,
}));

const { statusCodes } = jest.requireActual<typeof GoogleSigninModule>(
  "@react-native-google-signin/google-signin",
);

const mockAuth = { signInWithIdToken: jest.fn() };
let mockClient: { auth: typeof mockAuth } | null = { auth: mockAuth };
const mockTrackSignIn = jest.fn(<T,>(request: Promise<T>) => request);

jest.mock("./supabase", () => ({
  get supabase() {
    return mockClient;
  },
  trackSignIn: <T,>(request: Promise<T>) => mockTrackSignIn(request),
}));

const GOOGLE_ENV: Env = {
  appEnv: "real",
  apiUrl: "http://api.test",
  supabaseUrl: "http://supabase.test",
  supabaseAnonKey: "anon-key",
  googleWebClientId: "web-client.apps.googleusercontent.com",
  googleIosClientId: "ios-client.apps.googleusercontent.com",
};
let mockEnv: Env = GOOGLE_ENV;

jest.mock("@/config/env", () => ({
  get env() {
    return mockEnv;
  },
}));

/** A fresh copy of the module: it configures Google Sign-In once per app run. */
function loadGoogleAuth(): typeof GoogleAuthModule {
  let loaded: typeof GoogleAuthModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("./google-auth") as typeof GoogleAuthModule;
  });
  if (!loaded) throw new Error("./google-auth did not load");
  return loaded;
}

const nativeError = (code: string) => Object.assign(new Error(`Native error ${code}`), { code });

const success = (idToken: string | null) => ({
  type: "success",
  data: { idToken, serverAuthCode: null, scopes: [], user: { id: "g-1", email: "ana@gmail.com" } },
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

beforeEach(() => {
  mockEnv = GOOGLE_ENV;
  mockClient = { auth: mockAuth };
  jest.replaceProperty(Platform, "OS", "android");
  mockGoogleSignin.configure.mockReset();
  mockGoogleSignin.hasPlayServices.mockReset().mockResolvedValue(true);
  mockGoogleSignin.signIn.mockReset().mockResolvedValue(success("google-id-token"));
  mockGoogleSignin.signOut.mockReset().mockResolvedValue(null);
  mockAuth.signInWithIdToken.mockReset().mockResolvedValue({ data: {}, error: null });
  mockTrackSignIn.mockClear();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("isGoogleSignInAvailable", () => {
  it("is available with Supabase and the web client id", () => {
    expect(loadGoogleAuth().isGoogleSignInAvailable()).toBe(true);
  });

  it("is not available without Supabase (local profile)", () => {
    mockClient = null;

    expect(loadGoogleAuth().isGoogleSignInAvailable()).toBe(false);
  });

  it("is not available without the web client id", () => {
    mockEnv = { ...GOOGLE_ENV, googleWebClientId: undefined };

    expect(loadGoogleAuth().isGoogleSignInAvailable()).toBe(false);
  });

  it("needs the iOS client id on iOS", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    const { isGoogleSignInAvailable } = loadGoogleAuth();
    expect(isGoogleSignInAvailable()).toBe(true);

    mockEnv = { ...GOOGLE_ENV, googleIosClientId: undefined };
    expect(isGoogleSignInAvailable()).toBe(false);
  });

  it("is not available on the web preview", () => {
    jest.replaceProperty(Platform, "OS", "web");

    expect(loadGoogleAuth().isGoogleSignInAvailable()).toBe(false);
  });
});

describe("signInWithGoogle", () => {
  it("exchanges Google's ID token for a Supabase session", async () => {
    const { signInWithGoogle } = loadGoogleAuth();

    await expect(signInWithGoogle()).resolves.toEqual({ cancelled: false });

    expect(mockGoogleSignin.hasPlayServices).toHaveBeenCalledWith({
      showPlayServicesUpdateDialog: true,
    });
    expect(mockGoogleSignin.signIn).toHaveBeenCalledTimes(1);
    expect(mockAuth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "google-id-token",
    });
    // A sign-out still settling must not remove the new session (see trackSignIn).
    expect(mockTrackSignIn).toHaveBeenCalledWith(mockAuth.signInWithIdToken.mock.results[0].value);
  });

  it("configures Google Sign-In once, with both client ids", async () => {
    const { signInWithGoogle } = loadGoogleAuth();

    await signInWithGoogle();
    await signInWithGoogle();

    expect(mockGoogleSignin.configure).toHaveBeenCalledTimes(1);
    expect(mockGoogleSignin.configure).toHaveBeenCalledWith({
      webClientId: "web-client.apps.googleusercontent.com",
      iosClientId: "ios-client.apps.googleusercontent.com",
    });
    expect(mockGoogleSignin.configure.mock.invocationCallOrder[0]).toBeLessThan(
      mockGoogleSignin.signIn.mock.invocationCallOrder[0],
    );
  });

  it("reports a cancelled account picker without an error", async () => {
    mockGoogleSignin.signIn.mockResolvedValue({ type: "cancelled", data: null });
    const { signInWithGoogle } = loadGoogleAuth();

    await expect(signInWithGoogle()).resolves.toEqual({ cancelled: true });

    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ["cancelled", statusCodes.SIGN_IN_CANCELLED],
    ["already in progress", statusCodes.IN_PROGRESS],
  ])("treats a sign-in %s as cancelled", async (_label, code) => {
    mockGoogleSignin.signIn.mockRejectedValue(nativeError(code));
    const { signInWithGoogle } = loadGoogleAuth();

    await expect(signInWithGoogle()).resolves.toEqual({ cancelled: true });

    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it.each([
    ["rejects", () => Promise.reject(nativeError(statusCodes.PLAY_SERVICES_NOT_AVAILABLE))],
    ["answers false", () => Promise.resolve(false)],
  ])("explains missing Google Play services when the check %s", async (_label, check) => {
    mockGoogleSignin.hasPlayServices.mockImplementation(check);
    const { signInWithGoogle, GOOGLE_PLAY_SERVICES_CODE } = loadGoogleAuth();

    const error = await caught(signInWithGoogle());

    expect(isAuthError(error) && error.code).toBe(GOOGLE_PLAY_SERVICES_CODE);
    expect(messageFor(error)).toMatch(/servicios de Google Play/);
    expect(mockGoogleSignin.signIn).not.toHaveBeenCalled();
  });

  it("fails with a typed error when Google returns no ID token", async () => {
    mockGoogleSignin.signIn.mockResolvedValue(success(null));
    const { signInWithGoogle, GOOGLE_ID_TOKEN_MISSING_CODE } = loadGoogleAuth();

    const error = await caught(signInWithGoogle());

    expect(isAuthError(error) && error.code).toBe(GOOGLE_ID_TOKEN_MISSING_CODE);
    expect(messageFor(error)).toMatch(/^Google no envió/);
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it("reports any other native failure as a generic Google error", async () => {
    // e.g. DEVELOPER_ERROR on Android: the build's SHA-1 is not registered in Google Cloud.
    mockGoogleSignin.signIn.mockRejectedValue(nativeError("10"));
    const { signInWithGoogle, GOOGLE_SIGN_IN_FAILED_CODE } = loadGoogleAuth();

    const error = await caught(signInWithGoogle());

    expect(isAuthError(error) && error.code).toBe(GOOGLE_SIGN_IN_FAILED_CODE);
    expect(messageFor(error)).toBe("No pudimos iniciar sesión con Google. Inténtalo de nuevo.");
  });

  it("throws Supabase's error and forgets the Google account so another can be chosen", async () => {
    const supabaseError = new AuthApiError("Provider is not enabled", 400, "provider_disabled");
    mockAuth.signInWithIdToken.mockResolvedValue({ data: {}, error: supabaseError });
    const { signInWithGoogle } = loadGoogleAuth();

    await expect(signInWithGoogle()).rejects.toBe(supabaseError);

    expect(messageFor(supabaseError)).toMatch(/^El acceso con Google no está habilitado/);
    expect(mockGoogleSignin.signOut).toHaveBeenCalledTimes(1);
  });

  it("refuses to start when Google sign-in is not available", async () => {
    mockEnv = { ...GOOGLE_ENV, googleWebClientId: undefined };
    const { signInWithGoogle, GOOGLE_UNAVAILABLE_CODE } = loadGoogleAuth();

    const error = await caught(signInWithGoogle());

    expect(isAuthError(error) && error.code).toBe(GOOGLE_UNAVAILABLE_CODE);
    expect(mockGoogleSignin.configure).not.toHaveBeenCalled();
    expect(mockGoogleSignin.signIn).not.toHaveBeenCalled();
  });
});

describe("signOutFromGoogle", () => {
  it("signs out of Google so the next sign-in shows the account picker", async () => {
    const { signOutFromGoogle } = loadGoogleAuth();

    await signOutFromGoogle();

    // A cold start may sign out before any sign-in configured the module.
    expect(mockGoogleSignin.configure).toHaveBeenCalledTimes(1);
    expect(mockGoogleSignin.signOut).toHaveBeenCalledTimes(1);
  });

  it("never rejects", async () => {
    mockGoogleSignin.signOut.mockRejectedValue(nativeError("SIGN_OUT_FAILED"));
    const { signOutFromGoogle } = loadGoogleAuth();

    await expect(signOutFromGoogle()).resolves.toBeUndefined();
  });

  it("does nothing when Google sign-in is not available", async () => {
    mockClient = null;
    const { signOutFromGoogle } = loadGoogleAuth();

    await signOutFromGoogle();

    expect(mockGoogleSignin.signOut).not.toHaveBeenCalled();
  });
});
