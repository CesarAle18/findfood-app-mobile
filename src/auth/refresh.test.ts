import {
  AuthApiError,
  AuthInvalidTokenResponseError,
  AuthRefreshDiscardedError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  type AuthError,
} from "@supabase/supabase-js";

import {
  classifyRefreshResult,
  createAccessTokenRefresher,
  type RefreshResult,
} from "./refresh";

const refreshed = (accessToken: string): RefreshResult => ({
  data: { session: { access_token: accessToken } },
  error: null,
});

const failed = (error: AuthError): RefreshResult => ({
  data: { session: null },
  error,
});

describe("classifyRefreshResult", () => {
  it("returns the new access token on success", () => {
    expect(classifyRefreshResult(refreshed("new-token"))).toBe("new-token");
  });

  it("returns null when the refresh succeeds without a session", () => {
    expect(classifyRefreshResult({ data: { session: null }, error: null })).toBeNull();
  });

  it("returns null when there is no session to refresh", () => {
    expect(classifyRefreshResult(failed(new AuthSessionMissingError()))).toBeNull();
  });

  it.each([
    [400, "refresh_token_not_found"],
    [400, "refresh_token_already_used"],
    [403, "session_expired"],
    [403, "session_not_found"],
    [404, "user_not_found"],
    // Older Auth servers answer `invalid_grant` without an error code.
    [400, undefined],
  ])("returns null when the server rejects the refresh token (%i %s)", (status, code) => {
    const error = new AuthApiError("Invalid Refresh Token", status, code);

    expect(classifyRefreshResult(failed(error))).toBeNull();
  });

  it.each([
    ["a network failure", new AuthRetryableFetchError("Network request failed", 0)],
    ["a gateway error", new AuthRetryableFetchError("Bad Gateway", 502)],
    ["a 5xx API error", new AuthApiError("Internal error", 505, undefined)],
    ["rate limiting", new AuthApiError("Too many requests", 429, "over_request_rate_limit")],
    ["a request timeout", new AuthApiError("Request timeout", 408, undefined)],
    ["an unparseable response", new AuthUnknownError("Unexpected token <", new SyntaxError())],
    ["a malformed token response", new AuthInvalidTokenResponseError()],
    ["a refresh discarded by a concurrent change", new AuthRefreshDiscardedError()],
  ])("throws the error on %s so the session is kept", (_label, error) => {
    expect(() => classifyRefreshResult(failed(error))).toThrow(error);
  });
});

describe("createAccessTokenRefresher", () => {
  function fakeAuth(refresh: RefreshResult, stored: RefreshResult = refreshed("stored")) {
    return {
      refreshSession: jest.fn(async () => refresh),
      getSession: jest.fn(async () => stored),
    };
  }

  it("resolves the refreshed access token", async () => {
    const auth = fakeAuth(refreshed("new-token"));

    await expect(createAccessTokenRefresher(auth)()).resolves.toBe("new-token");
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("resolves null when the session is definitively gone", async () => {
    const auth = fakeAuth(failed(new AuthApiError("Invalid", 400, "refresh_token_not_found")));

    await expect(createAccessTokenRefresher(auth)()).resolves.toBeNull();
  });

  it("rejects on transient failures", async () => {
    const error = new AuthRetryableFetchError("Network request failed", 0);

    await expect(createAccessTokenRefresher(fakeAuth(failed(error)))()).rejects.toBe(error);
  });

  it("uses the stored session when a concurrent change discarded the refresh", async () => {
    const auth = fakeAuth(failed(new AuthRefreshDiscardedError()), refreshed("signed-in"));

    await expect(createAccessTokenRefresher(auth)()).resolves.toBe("signed-in");
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it("resolves null when the discarded refresh came from a sign-out", async () => {
    const auth = fakeAuth(failed(new AuthRefreshDiscardedError()), {
      data: { session: null },
      error: null,
    });

    await expect(createAccessTokenRefresher(auth)()).resolves.toBeNull();
  });
});
