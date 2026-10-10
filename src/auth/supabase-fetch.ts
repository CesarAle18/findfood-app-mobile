/**
 * `fetch` for the Supabase client (`global.fetch`): every request is aborted once
 * SUPABASE_FETCH_TIMEOUT_MS have passed.
 *
 * auth-js runs one token refresh at a time and later refreshes join the one in flight, so
 * a refresh whose request never settles would hold back every later refresh, even after
 * the HTTP client's own refresh deadline gave up waiting for it. With a deadline the
 * request rejects, auth-js reports an AuthRetryableFetchError (transient: the session is
 * kept, see `classifyRefreshResult`) and its retries stay within its own 30 s window.
 */

/** Per request, response body included. */
export const SUPABASE_FETCH_TIMEOUT_MS = 10_000;

function timeoutError(timeoutMs: number, cause: unknown): Error {
  const error = new Error(`Supabase request timed out after ${timeoutMs} ms`);
  error.name = "TimeoutError";
  // Assigned directly: the `cause` constructor option is not verified on Hermes.
  error.cause = cause;
  return error;
}

/**
 * Wraps `fetchImpl` (the global fetch, looked up per call, by default). The caller's
 * signal and the deadline are combined by hand into one controller: AbortSignal.any and
 * AbortSignal.timeout are not verified on Hermes.
 */
export function createSupabaseFetch(
  timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
  return async (input, init) => {
    const callerSignal = init?.signal ?? undefined;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    let timedOut = false;

    // Not cleared when the response arrives: Expo's fetch resolves on the headers and
    // streams the body, so the deadline must also cover the body read. Aborting a request
    // that already finished does nothing.
    const timer = setTimeout(() => {
      timedOut = true;
      callerSignal?.removeEventListener("abort", forwardAbort);
      controller.abort();
    }, timeoutMs);

    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener("abort", forwardAbort);

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", forwardAbort);
      if (timedOut && !callerSignal?.aborted) throw timeoutError(timeoutMs, error);
      throw error;
    }
  };
}
