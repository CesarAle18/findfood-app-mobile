/**
 * Access-token refresh for the HTTP client (`ApiClientOptions.refreshAccessToken`).
 *
 * The client signs the user out when the refresh resolves null and keeps the session when
 * it rejects, so only failures that prove the session is gone may resolve null.
 */
import {
  isAuthApiError,
  isAuthRefreshDiscardedError,
  isAuthSessionMissingError,
  type AuthError,
} from "@supabase/supabase-js";

/** The shape shared by `auth.refreshSession()` and `auth.getSession()` results. */
export interface RefreshResult {
  data: { session: { access_token: string } | null };
  error: AuthError | null;
}

/** The part of `SupabaseClient["auth"]` the refresher needs. */
export interface RefreshableAuth {
  refreshSession(): Promise<RefreshResult>;
  getSession(): Promise<RefreshResult>;
}

// 4xx answers that do not judge the refresh token: retrying later can succeed.
const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

/**
 * True when the Auth server rejected the refresh token itself (revoked, reused, expired
 * session, deleted user...) or there is no session at all. Retryable fetch errors (network,
 * aborts and gateway 5xx, see `isAuthRetryableFetchError`), other 5xx, unparseable answers
 * and discarded refreshes prove nothing about the session.
 */
function isDefinitiveAuthFailure(error: AuthError): boolean {
  if (isAuthSessionMissingError(error)) return true;
  if (!isAuthApiError(error)) return false;
  const { status } = error;
  return status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status);
}

/**
 * The new access token, null when the session is definitively invalid, or a throw (the
 * Auth error itself) when the failure is transient and the session must be kept.
 */
export function classifyRefreshResult({ data, error }: RefreshResult): string | null {
  if (!error) return data.session?.access_token || null;
  if (isDefinitiveAuthFailure(error)) return null;
  throw error;
}

export function createAccessTokenRefresher(
  auth: RefreshableAuth,
): () => Promise<string | null> {
  return async () => {
    const result = await auth.refreshSession();
    if (isAuthRefreshDiscardedError(result.error)) {
      // A concurrent sign-out or sign-in replaced the stored session while the refresh was
      // in flight: whatever is stored now is the answer.
      return classifyRefreshResult(await auth.getSession());
    }
    return classifyRefreshResult(result);
  };
}
