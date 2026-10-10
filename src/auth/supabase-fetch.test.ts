import { AuthClient, isAuthRetryableFetchError } from "@supabase/supabase-js";

import { classifyRefreshResult } from "./refresh";
import { createSupabaseFetch, SUPABASE_FETCH_TIMEOUT_MS } from "./supabase-fetch";

interface PendingRequest {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
  respond(response: Response): void;
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/** A fetch that never answers on its own; like fetch, it rejects once its signal aborts. */
function hungFetch() {
  const requests: PendingRequest[] = [];
  const fetchImpl = jest.fn(
    (input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(abortError());
        signal?.addEventListener("abort", () => reject(abortError()));
        requests.push({ input, init, respond: resolve });
      }),
  );
  return { fetchImpl, requests };
}

const okResponse = { status: 200, ok: true } as Response;

/** Settles to the rejection reason, so a pending rejection is never left unhandled. */
function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("Expected the request to fail");
    },
    (error: unknown) => error,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("createSupabaseFetch", () => {
  it("bounds every request by default", () => {
    expect(SUPABASE_FETCH_TIMEOUT_MS).toBe(10_000);
  });

  it("sends the request with its own signal and resolves the response", async () => {
    const { fetchImpl, requests } = hungFetch();
    const supabaseFetch = createSupabaseFetch(1_000, fetchImpl);

    const pending = supabaseFetch("http://supabase.test/auth/v1/token", {
      method: "POST",
      headers: { apikey: "anon-key" },
      body: "{}",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].input).toBe("http://supabase.test/auth/v1/token");
    expect(requests[0].init).toMatchObject({
      method: "POST",
      headers: { apikey: "anon-key" },
      body: "{}",
    });
    expect(requests[0].init?.signal?.aborted).toBe(false);
    requests[0].respond(okResponse);
    await expect(pending).resolves.toBe(okResponse);
  });

  it("aborts a request that does not answer in time", async () => {
    const { fetchImpl, requests } = hungFetch();
    const outcome = failure(createSupabaseFetch(1_000, fetchImpl)("http://supabase.test/x"));

    await jest.advanceTimersByTimeAsync(999);
    expect(requests[0].init?.signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(requests[0].init?.signal?.aborted).toBe(true);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "TimeoutError",
      message: "Supabase request timed out after 1000 ms",
    });
  });

  it("keeps the deadline while the response body is read", async () => {
    // Expo's fetch resolves on the headers and streams the body: the abort must still
    // reach a body that never finishes.
    const { fetchImpl, requests } = hungFetch();
    const pending = createSupabaseFetch(1_000, fetchImpl)("http://supabase.test/x");
    requests[0].respond(okResponse);
    await expect(pending).resolves.toBe(okResponse);

    await jest.advanceTimersByTimeAsync(1_000);

    expect(requests[0].init?.signal?.aborted).toBe(true);
  });

  it("forwards the caller's abort and rethrows its error untouched", async () => {
    const { fetchImpl, requests } = hungFetch();
    const caller = new AbortController();
    const outcome = failure(
      createSupabaseFetch(1_000, fetchImpl)("http://supabase.test/x", {
        signal: caller.signal,
      }),
    );

    caller.abort();

    expect(requests[0].init?.signal?.aborted).toBe(true);
    expect(requests[0].init?.signal).not.toBe(caller.signal);
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
  });

  it("aborts at once when the caller's signal is already aborted", async () => {
    const { fetchImpl, requests } = hungFetch();
    const caller = new AbortController();
    caller.abort();

    const outcome = failure(
      createSupabaseFetch(1_000, fetchImpl)("http://supabase.test/x", {
        signal: caller.signal,
      }),
    );

    expect(requests[0].init?.signal?.aborted).toBe(true);
    await expect(outcome).resolves.toMatchObject({ name: "AbortError" });
  });

  it("rethrows a network failure untouched", async () => {
    const networkError = new TypeError("Network request failed");
    const fetchImpl = jest.fn(async () => {
      throw networkError;
    });

    await expect(
      createSupabaseFetch(1_000, fetchImpl)("http://supabase.test/x"),
    ).rejects.toBe(networkError);
  });

  it("uses the global fetch by default, looked up per call", async () => {
    const realFetch = globalThis.fetch;
    const globalFetch = jest.fn(async () => okResponse);
    const supabaseFetch = createSupabaseFetch();
    globalThis.fetch = globalFetch as unknown as typeof fetch;
    try {
      await expect(supabaseFetch("http://supabase.test/x")).resolves.toBe(okResponse);
      expect(globalFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("with auth-js", () => {
  function memoryStorage() {
    const values = new Map<string, string>();
    return {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: async (key: string) => {
        values.delete(key);
      },
    };
  }

  it("turns a hung token refresh into a bounded, transient failure", async () => {
    const { fetchImpl } = hungFetch();
    const auth = new AuthClient({
      url: "http://supabase.test/auth/v1",
      headers: { apikey: "anon-key" },
      storage: memoryStorage(),
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      fetch: createSupabaseFetch(SUPABASE_FETCH_TIMEOUT_MS, fetchImpl),
    });

    const refresh = auth.refreshSession({ refresh_token: "refresh-token" });
    // auth-js retries retryable failures for up to 30 s; each attempt now ends at the
    // deadline instead of hanging.
    await jest.advanceTimersByTimeAsync(30_000 + 2 * SUPABASE_FETCH_TIMEOUT_MS);
    const result = await refresh;

    expect(isAuthRetryableFetchError(result.error)).toBe(true);
    // Transient: the HTTP client keeps the session instead of signing out.
    expect(() =>
      classifyRefreshResult({ data: { session: null }, error: result.error }),
    ).toThrow("Supabase request timed out");
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
  });
});
