/**
 * HTTP client for findfood-api (every route under `/v1`).
 *
 * Framework-free on purpose: the session (token source, refresh, sign-out) is injected,
 * so the client is tested with a fake `fetch` and wired to the app session elsewhere.
 */
import { ApiError, parseProblem } from "./errors";

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
  /** Caller cancellation (e.g. React Query); its abort error is rethrown untouched. */
  signal?: AbortSignal;
  /** Per attempt; defaults to the client's `timeoutMs`. */
  timeoutMs?: number;
  /** Send the bearer token and refresh it on 401. Default true. */
  auth?: boolean;
  headers?: Record<string, string>;
}

export interface ApiClientOptions {
  /** API origin without trailing slash and without `/v1` (`env.apiUrl`). */
  baseUrl: string;
  getAccessToken: () => string | null | Promise<string | null>;
  /** Resolves the new access token, or null when the session cannot be refreshed. */
  refreshAccessToken: () => Promise<string | null>;
  /** The session is no longer valid: the refresh failed or the retry got another 401. */
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

  // Single flight: concurrent 401s wait for the same refresh, and a failed refresh
  // signs out once.
  let refreshing: Promise<string | null> | null = null;

  function refreshSession(): Promise<string | null> {
    if (!refreshing) {
      refreshing = (async () => {
        let token: string | null = null;
        try {
          token = await refreshAccessToken();
        } catch {
          token = null;
        }
        if (!token) onUnauthorized();
        return token;
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
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
      // Another request may have rotated the token while this one was in flight.
      const current = await getAccessToken();
      const next = current && current !== token ? current : await refreshSession();
      // Without a token the refresh failed (onUnauthorized already ran): surface the 401.
      if (next) {
        // Retried once only; a second 401 means the session is gone.
        response = await send(next);
        if (response.status === 401) onUnauthorized();
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
