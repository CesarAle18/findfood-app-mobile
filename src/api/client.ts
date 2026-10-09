/**
 * HTTP client for findfood-api (every route under `/v1`).
 *
 * Framework-free on purpose: the session (token source, refresh, sign-out) is injected,
 * so the client is tested with a fake `fetch` and wired to the app session elsewhere.
 */
import { ApiError, isApiError, parseProblem } from "./errors";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number)[];

export interface ApiRequestOptions {
  /** null, undefined and empty arrays are skipped; arrays are sent as CSV (`a,b`). */
  query?: Record<string, QueryValue>;
  /** Serialized as JSON. */
  body?: unknown;
  /**
   * Caller cancellation (e.g. React Query); its abort error is rethrown untouched, also
   * while the request waits for a token refresh.
   */
  signal?: AbortSignal;
  /**
   * Per attempt (each fetch, and the wait for a token refresh after a 401); defaults to
   * the client's `timeoutMs`.
   */
  timeoutMs?: number;
  /** Send the bearer token and refresh it on 401. Default true. */
  auth?: boolean;
  headers?: Record<string, string>;
}

export interface ApiClientOptions {
  /** API origin without trailing slash and without `/v1` (`env.apiUrl`). */
  baseUrl: string;
  getAccessToken: () => string | null | Promise<string | null>;
  /**
   * Called after a 401; concurrent 401s share one call.
   * - Resolve the new access token to retry the request once with it.
   * - Resolve null only when the session is definitively invalid (revoked or expired
   *   refresh token, no session): the 401 is surfaced and `onUnauthorized` runs.
   * - Reject on transient failures (offline, timeouts, 5xx): the waiting requests fail
   *   with that error (an ApiError as-is, anything else as `sin-conexion`) and the
   *   session is kept, so a flaky network never signs the user out.
   */
  refreshAccessToken: () => Promise<string | null>;
  /**
   * The session is no longer valid: the refresh resolved null, or the retry with the new
   * token got another 401. Called at most once per rejected access token, however many
   * requests were rejected with it.
   */
  onUnauthorized: () => void;
  /** Default DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type RequestFn = <T = unknown>(path: string, options?: ApiRequestOptions) => Promise<T>;

export interface ApiClient {
  /** `path` starts with `/` and excludes `/v1`. Resolves undefined for empty bodies. */
  request<T = unknown>(
    path: string,
    options?: ApiRequestOptions & { method?: HttpMethod },
  ): Promise<T>;
  get: RequestFn;
  post: RequestFn;
  put: RequestFn;
  patch: RequestFn;
  delete: RequestFn;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

const ACCEPT = "application/json, application/problem+json";

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

interface RawResponse {
  status: number;
  contentType: string;
  text: string;
}

function isList(value: QueryValue): value is readonly (string | number)[] {
  return Array.isArray(value);
}

// Built by hand: URL and URLSearchParams are only partially implemented in React Native.
function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    if (isList(value) && value.length === 0) continue;
    const encoded = isList(value)
      ? value.map((item) => encodeURIComponent(String(item))).join(",")
      : encodeURIComponent(String(value));
    pairs.push(`${encodeURIComponent(key)}=${encoded}`);
  }
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

function abortError(signal: AbortSignal): unknown {
  // `reason` is missing from some AbortSignal polyfills.
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/**
 * One fetch attempt, body included. The caller's signal and the timeout are combined
 * by hand into one controller: AbortSignal.any/timeout are not verified on Hermes.
 */
async function execute(
  fetchImpl: FetchFn,
  url: string,
  init: RequestInit,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<RawResponse> {
  if (callerSignal?.aborted) throw abortError(callerSignal);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  callerSignal?.addEventListener("abort", forwardAbort);

  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    return { status: response.status, contentType, text };
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    if (timedOut) throw ApiError.timeout();
    throw ApiError.network(error);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

/**
 * Waits for a promise shared with other requests, bounded by this request's timeout and
 * signal. Giving up only detaches this waiter: the shared promise keeps running for the
 * others.
 */
function waitShared<T>(
  shared: Promise<T>,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      detach();
      reject(ApiError.timeout());
    }, timeoutMs);
    const onAbort = () => {
      detach();
      reject(abortError(callerSignal as AbortSignal));
    };
    function detach() {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onAbort);
    }
    callerSignal?.addEventListener("abort", onAbort);

    shared.then(
      (value) => {
        detach();
        resolve(value);
      },
      (error: unknown) => {
        detach();
        reject(error);
      },
    );
  });
}

function readResult<T>({ status, contentType, text }: RawResponse): T {
  const isJson = contentType.toLowerCase().includes("json");

  if (status < 200 || status >= 300) {
    let body: unknown = text === "" ? null : text;
    if (text !== "" && isJson) {
      try {
        body = JSON.parse(text);
      } catch {
        // Keep the raw text: parseProblem falls back to the generic problem.
      }
    }
    throw parseProblem(status, body);
  }

  if (status === 204 || text === "") return undefined as T;
  // A 2xx body that is not JSON (text/plain, text/html...) resolves as its raw text. No
  // findfood-api route answers that way, so a caller expecting JSON gets a string here
  // instead of an error; only a body declared as JSON is parsed and validated.
  if (!isJson) return text as T;
  try {
    return JSON.parse(text) as T;
  } catch (cause) {
    throw new ApiError({
      type: "respuesta-invalida",
      status,
      title: "Invalid JSON response",
      cause,
    });
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, getAccessToken, refreshAccessToken, onUnauthorized } = options;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Looked up per call so a fetch installed after the client is created still applies.
  const fetchImpl: FetchFn =
    options.fetchImpl ?? ((url: string, init: RequestInit) => fetch(url, init));

  // Single flight: concurrent 401s wait for the same refresh. It settles with a token, null
  // (session invalid) or a rejection (transient failure); none of them is cached.
  let refreshing: Promise<string | null> | null = null;
  // The last access token reported through onUnauthorized (undefined: none yet), so the
  // requests rejected with the same token notify once.
  let rejectedToken: string | null | undefined;

  function refreshSession(): Promise<string | null> {
    if (!refreshing) {
      // Built with `new Promise` so a synchronous throw becomes a rejection too.
      refreshing = new Promise<string | null>((resolve) => resolve(refreshAccessToken()))
        .then((token) => token || null)
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  /**
   * The token to retry with after `rejected` got a 401, or null when the session is
   * invalid. Throws the caller's abort error, ApiError.timeout() when the wait exceeds the
   * request timeout, and an ApiError for transient refresh failures.
   */
  async function renewToken(
    rejected: string | null,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<string | null> {
    if (signal?.aborted) throw abortError(signal);
    // Another request may have rotated the token while this one was in flight.
    const current = await getAccessToken();
    if (current && current !== rejected) return current;
    try {
      return await waitShared(refreshSession(), signal, timeoutMs);
    } catch (error) {
      if (signal?.aborted) throw abortError(signal);
      if (isApiError(error)) throw error;
      throw ApiError.network(error);
    }
  }

  function notifyUnauthorized(token: string | null) {
    if (token === rejectedToken) return;
    rejectedToken = token;
    onUnauthorized();
  }

  async function request<T = unknown>(
    path: string,
    {
      method = "GET",
      query,
      body,
      signal,
      timeoutMs = defaultTimeoutMs,
      auth = true,
      headers,
    }: ApiRequestOptions & { method?: HttpMethod } = {},
  ): Promise<T> {
    const url = `${baseUrl}/v1${path}${buildQuery(query)}`;
    const payload = body === undefined ? undefined : JSON.stringify(body);

    const send = (token: string | null) => {
      const requestHeaders: Record<string, string> = { Accept: ACCEPT };
      if (payload !== undefined) requestHeaders["Content-Type"] = "application/json";
      Object.assign(requestHeaders, headers);
      if (token) requestHeaders.Authorization = `Bearer ${token}`;
      return execute(
        fetchImpl,
        url,
        { method, headers: requestHeaders, body: payload },
        signal,
        timeoutMs,
      );
    };

    const token = auth ? await getAccessToken() : null;
    let response = await send(token);

    if (auth && response.status === 401) {
      const next = await renewToken(token, signal, timeoutMs);
      if (next === null) {
        // The session cannot be refreshed: surface the original 401.
        notifyUnauthorized(token);
      } else {
        // Retried once only; a second 401 means the session is gone.
        response = await send(next);
        if (response.status === 401) notifyUnauthorized(next);
      }
    }

    return readResult<T>(response);
  }

  const withMethod =
    (method: HttpMethod): RequestFn =>
    <T = unknown>(path: string, requestOptions?: ApiRequestOptions) =>
      request<T>(path, { ...requestOptions, method });

  return {
    request,
    get: withMethod("GET"),
    post: withMethod("POST"),
    put: withMethod("PUT"),
    patch: withMethod("PATCH"),
    delete: withMethod("DELETE"),
  };
}
