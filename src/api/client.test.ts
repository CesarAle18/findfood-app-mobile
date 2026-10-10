import { createApiClient, type ApiClientOptions } from "./client";
import { ApiError } from "./errors";

const BASE_URL = "http://api.test";

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  signal: AbortSignal | undefined;
}

interface FakeReply {
  status: number;
  /** Objects are sent as JSON, strings as-is. */
  body?: unknown;
  contentType?: string;
}

type Handler = (call: FetchCall) => FakeReply | Promise<FakeReply>;

/** Minimal Response: the client only reads `status`, the content type and the text. */
function toResponse({ status, body, contentType }: FakeReply): Response {
  const text =
    body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  const type =
    contentType ?? (typeof body === "string" ? "text/plain" : "application/json");
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-type" ? type : null),
    },
    text: async () => text,
  } as unknown as Response;
}

function fakeFetch(handler: Handler) {
  const calls: FetchCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: FetchCall = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: init?.body as string | undefined,
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    return toResponse(await handler(call));
  };
  return { fetchImpl: fetchImpl as typeof fetch, calls };
}

function abortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

/** Never answers; rejects like fetch does once its signal aborts. */
function hang(call: FetchCall): Promise<FakeReply> {
  return new Promise((_resolve, reject) => {
    call.signal?.addEventListener("abort", () => reject(abortError()));
  });
}

const ok = (body?: unknown): FakeReply => ({ status: 200, body });

const unauthorized: FakeReply = {
  status: 401,
  contentType: "application/problem+json",
  body: { type: "token-invalido", title: "Invalid token", status: 401 },
};

/** Lets pending promise chains (token lookup, fetch, refresh) run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function createSession(initial: string | null = "old-token") {
  const session = {
    token: initial,
    getAccessToken: jest.fn((): string | null => session.token),
    refreshAccessToken: jest.fn(async (): Promise<string | null> => {
      session.token = "new-token";
      return session.token;
    }),
    onUnauthorized: jest.fn(),
  };
  return session;
}

function setup(handler: Handler, overrides: Partial<ApiClientOptions> = {}) {
  const { fetchImpl, calls } = fakeFetch(handler);
  const session = createSession();
  const client = createApiClient({
    baseUrl: BASE_URL,
    getAccessToken: session.getAccessToken,
    refreshAccessToken: session.refreshAccessToken,
    onUnauthorized: session.onUnauthorized,
    fetchImpl,
    ...overrides,
  });
  return { client, calls, session };
}

afterEach(() => {
  jest.useRealTimers();
});

describe("requests", () => {
  it("prefixes /v1 and builds the query string by hand", async () => {
    const { client, calls } = setup(() => ok({ datos: [] }));

    await client.get("/donaciones", {
      query: {
        incluir: ["unidades_medida", "tipos_alimento"],
        estado: "PUBLICADA",
        limite: 20,
        activo: false,
        q: "pan & leche/ñ",
        vacio: null,
        ausente: undefined,
        ninguno: [],
      },
    });

    expect(calls[0].url).toBe(
      "http://api.test/v1/donaciones?incluir=unidades_medida,tipos_alimento" +
        "&estado=PUBLICADA&limite=20&activo=false&q=pan%20%26%20leche%2F%C3%B1",
    );
  });

  it("omits the query string when every value is empty", async () => {
    const { client, calls } = setup(() => ok({}));

    await client.get("/me", { query: { a: null, b: undefined } });

    expect(calls[0].url).toBe("http://api.test/v1/me");
  });

  it("sends Accept and the bearer token without a Content-Type on GET", async () => {
    const { client, calls } = setup(() => ok({ id: "u-1" }));

    await expect(client.get("/me")).resolves.toEqual({ id: "u-1" });
    expect(calls[0]).toMatchObject({ method: "GET", body: undefined });
    expect(calls[0].headers).toEqual({
      Accept: "application/json, application/problem+json",
      Authorization: "Bearer old-token",
    });
  });

  it("serializes a JSON body and merges custom headers", async () => {
    const { client, calls } = setup(() => ({ status: 201, body: { id: "d-1" } }));

    const created = await client.post("/donaciones", {
      body: { nombre: "Pan", cantidad: 2 },
      headers: { "X-Request-Id": "req-1" },
    });

    expect(created).toEqual({ id: "d-1" });
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toBe('{"nombre":"Pan","cantidad":2}');
    expect(calls[0].headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Request-Id": "req-1",
      Authorization: "Bearer old-token",
    });
  });

  it.each([
    ["put", "PUT"],
    ["patch", "PATCH"],
    ["delete", "DELETE"],
  ] as const)("%s sends %s", async (helper, method) => {
    const { client, calls } = setup(() => ({ status: 204 }));

    await client[helper]("/donaciones/d-1");

    expect(calls[0].method).toBe(method);
  });

  it("omits Authorization when there is no token", async () => {
    const { client, calls, session } = setup(() => ok({}));
    session.token = null;

    await client.get("/catalogos");

    expect(calls[0].headers.Authorization).toBeUndefined();
  });

  it("skips the token lookup for public requests", async () => {
    const { client, calls, session } = setup(() => ok({}));

    await client.get("/catalogos", { auth: false });

    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(session.getAccessToken).not.toHaveBeenCalled();
  });
});

describe("responses", () => {
  it("resolves 204 to undefined", async () => {
    const { client } = setup(() => ({ status: 204 }));

    await expect(client.delete("/donaciones/d-1")).resolves.toBeUndefined();
  });

  it("resolves an empty 200 body to undefined", async () => {
    const { client } = setup(() => ok());

    await expect(client.post("/notificaciones/leer")).resolves.toBeUndefined();
  });

  it("resolves a non-JSON 2xx body as its raw text", async () => {
    const { client } = setup(() => ({ status: 200, body: "OK", contentType: "text/plain" }));

    await expect(client.get("/salud")).resolves.toBe("OK");
  });

  it("rejects malformed JSON as an ApiError", async () => {
    const { client } = setup(() => ({
      status: 200,
      body: "{not json",
      contentType: "application/json",
    }));

    await expect(client.get("/me")).rejects.toMatchObject({
      type: "respuesta-invalida",
      status: 200,
    });
  });

  it("rejects a problem+json response with its fields", async () => {
    const { client } = setup(() => ({
      status: 400,
      contentType: "application/problem+json; charset=utf-8",
      body: {
        type: "validacion",
        title: "Validation failed",
        status: 400,
        errores: ["items[0].cantidad must not be less than 0.01"],
      },
    }));

    const error = await client.post("/donaciones", { body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      type: "validacion",
      status: 400,
      fields: { "items.0.cantidad": ["must not be less than 0.01"] },
    });
  });

  it("rejects a non-JSON error body with the generic slug", async () => {
    const { client } = setup(() => ({
      status: 502,
      body: "<html>Bad Gateway</html>",
      contentType: "text/html",
    }));

    await expect(client.get("/me")).rejects.toMatchObject({
      type: "error-interno",
      status: 502,
    });
  });
});

describe("timeouts and cancellation", () => {
  it("rejects with tiempo-agotado after the default 15 s", async () => {
    jest.useFakeTimers();
    const { client } = setup(hang);
    let settled = false;
    const request = client.get("/me");
    const markSettled = () => {
      settled = true;
    };
    request.then(markSettled, markSettled);

    await jest.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    await expect(request).rejects.toMatchObject({ type: "tiempo-agotado", status: 0 });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("honors the client and per-request timeouts", async () => {
    jest.useFakeTimers();
    const { client } = setup(hang, { timeoutMs: 1_000 });

    const byClient = client.get("/a");
    const byRequest = client.get("/b", { timeoutMs: 100 });
    const assertions = Promise.all([
      expect(byClient).rejects.toMatchObject({ type: "tiempo-agotado" }),
      expect(byRequest).rejects.toMatchObject({ type: "tiempo-agotado" }),
    ]);
    await jest.advanceTimersByTimeAsync(100);
    await expect(byRequest).rejects.toBeInstanceOf(ApiError);
    await jest.advanceTimersByTimeAsync(900);

    await assertions;
  });

  it("clears the timer once the response is read", async () => {
    jest.useFakeTimers();
    const { client } = setup(() => ok({}));

    await client.get("/me");

    expect(jest.getTimerCount()).toBe(0);
  });

  it("rethrows the caller's abort untouched and detaches its listener", async () => {
    let fetchError: unknown;
    const { client } = setup((call) =>
      hang(call).catch((error: unknown) => {
        fetchError = error;
        throw error;
      }),
    );
    const controller = new AbortController();
    const detach = jest.spyOn(controller.signal, "removeEventListener");

    const request = client.get("/me", { signal: controller.signal });
    await flush();
    controller.abort();

    const error = await request.catch((e: unknown) => e);
    expect(error).toBe(fetchError);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(detach).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("does not call fetch when the caller signal is already aborted", async () => {
    const { client, calls } = setup(() => ok({}));
    const controller = new AbortController();
    controller.abort();

    await expect(client.get("/me", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(calls).toHaveLength(0);
  });

  it("wraps network failures as sin-conexion", async () => {
    const failure = new TypeError("Network request failed");
    const { client } = setup(() => {
      throw failure;
    });

    const error = await client.get("/me").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ type: "sin-conexion", status: 0, cause: failure });
  });
});

describe("401 handling", () => {
  const rejectsOldToken: Handler = (call) =>
    call.headers.Authorization === "Bearer old-token" ? unauthorized : ok({ ok: true });

  it("refreshes once and retries the same request with the new token", async () => {
    const { client, calls, session } = setup(rejectsOldToken);

    const result = await client.post("/donaciones", {
      body: { nombre: "Pan" },
      query: { borrador: true },
    });

    expect(result).toEqual({ ok: true });
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.onUnauthorized).not.toHaveBeenCalled();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      url: calls[0].url,
      method: "POST",
      body: '{"nombre":"Pan"}',
    });
    expect(calls[1].headers.Authorization).toBe("Bearer new-token");
  });

  it("calls onUnauthorized when the refresh yields no token", async () => {
    const { client, calls, session } = setup(rejectsOldToken);
    session.refreshAccessToken.mockResolvedValue(null);

    await expect(client.get("/me")).rejects.toMatchObject({
      type: "token-invalido",
      status: 401,
    });
    expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(1);
  });

  it("keeps the session when the refresh fails transiently", async () => {
    const { client, calls, session } = setup(rejectsOldToken);
    const failure = new TypeError("Network request failed");
    session.refreshAccessToken.mockRejectedValueOnce(failure);

    const error = await client.get("/me").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ type: "sin-conexion", status: 0, cause: failure });
    expect(session.onUnauthorized).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    // The failure is not cached: the next 401 refreshes again.
    await expect(client.get("/me")).resolves.toEqual({ ok: true });
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it("treats a synchronous throw from the refresh as transient", async () => {
    const { client, session } = setup(rejectsOldToken);
    session.refreshAccessToken.mockImplementationOnce(() => {
      throw new Error("not ready");
    });

    await expect(client.get("/me")).rejects.toMatchObject({ type: "sin-conexion" });
    expect(session.onUnauthorized).not.toHaveBeenCalled();
  });

  it("rethrows an ApiError from the refresh as-is", async () => {
    const { client, session } = setup(rejectsOldToken);
    const timeout = ApiError.timeout();
    session.refreshAccessToken.mockRejectedValueOnce(timeout);

    await expect(client.get("/me")).rejects.toBe(timeout);
    expect(session.onUnauthorized).not.toHaveBeenCalled();
  });

  it("fails every waiter of a shared refresh that fails transiently", async () => {
    const { client, session } = setup(rejectsOldToken);
    let fail = () => {};
    session.refreshAccessToken.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new TypeError("Network request failed"));
        }),
    );

    const requests = Promise.allSettled([client.get("/a"), client.get("/b")]);
    await flush();
    fail();
    const results = await requests;

    const offline = {
      status: "rejected",
      reason: expect.objectContaining({ type: "sin-conexion" }),
    };
    expect(results).toEqual([offline, offline]);
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.onUnauthorized).not.toHaveBeenCalled();
  });

  it("gives up after one retry and calls onUnauthorized once", async () => {
    const { client, calls, session } = setup(() => unauthorized);

    await expect(client.get("/me")).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(2);
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("shares a single refresh between concurrent 401s", async () => {
    const { client, calls, session } = setup(rejectsOldToken);
    let release = () => {};
    session.refreshAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            session.token = "new-token";
            resolve("new-token");
          };
        }),
    );

    const requests = Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);
    await flush();
    release();

    await expect(requests).resolves.toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(6);
  });

  it("notifies onUnauthorized once when a shared refresh fails", async () => {
    const { client, session } = setup(rejectsOldToken);
    let release = () => {};
    session.refreshAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null);
        }),
    );

    const requests = Promise.allSettled([client.get("/a"), client.get("/b")]);
    await flush();
    release();
    const results = await requests;

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("retries with a token another request already rotated", async () => {
    const { client, calls, session } = setup((call) => {
      if (call.headers.Authorization !== "Bearer old-token") return ok({ ok: true });
      session.token = "new-token";
      return unauthorized;
    });

    await expect(client.get("/me")).resolves.toEqual({ ok: true });
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(calls[1].headers.Authorization).toBe("Bearer new-token");
  });

  it("does not refresh public requests", async () => {
    const { client, calls, session } = setup(() => unauthorized);

    await expect(client.get("/catalogos", { auth: false })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(1);
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
    expect(session.onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("onUnauthorized deduplication", () => {
  it("notifies once when concurrent retries all get 401 again", async () => {
    const { client, calls, session } = setup(() => unauthorized);
    let release = () => {};
    session.refreshAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            session.token = "new-token";
            resolve("new-token");
          };
        }),
    );

    const requests = Promise.allSettled([client.get("/a"), client.get("/b"), client.get("/c")]);
    await flush();
    release();
    const results = await requests;

    expect(results.map((result) => result.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(calls).toHaveLength(6);
    expect(calls.slice(3).map((call) => call.headers.Authorization)).toEqual([
      "Bearer new-token",
      "Bearer new-token",
      "Bearer new-token",
    ]);
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not notify again for a token that was already rejected", async () => {
    const { client, session } = setup(() => unauthorized);
    session.refreshAccessToken.mockResolvedValue(null);

    await expect(client.get("/a")).rejects.toMatchObject({ status: 401 });
    await expect(client.get("/b")).rejects.toMatchObject({ status: 401 });

    expect(session.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not notify again when a retried token is rejected again later", async () => {
    const { client, session } = setup(() => unauthorized);
    session.refreshAccessToken.mockImplementation(async () => {
      session.token = "new-token";
      return "new-token";
    });

    await expect(client.get("/a")).rejects.toMatchObject({ status: 401 });
    await expect(client.get("/b")).rejects.toMatchObject({ status: 401 });

    expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("notifies again when a different token is rejected", async () => {
    const { client, session } = setup(() => unauthorized);
    session.refreshAccessToken.mockResolvedValue(null);

    await expect(client.get("/a")).rejects.toMatchObject({ status: 401 });
    session.token = "other-token";
    await expect(client.get("/b")).rejects.toMatchObject({ status: 401 });

    expect(session.onUnauthorized).toHaveBeenCalledTimes(2);
  });
});

describe("waiting for a shared refresh", () => {
  const rejectsOldToken: Handler = (call) =>
    call.headers.Authorization === "Bearer old-token" ? unauthorized : ok({ ok: true });

  /** Makes the refresh hang until the returned function settles it. */
  function pendingRefresh(session: ReturnType<typeof createSession>) {
    let settle: (token: string | null) => void = () => {};
    session.refreshAccessToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = (token) => {
            session.token = token;
            resolve(token);
          };
        }),
    );
    return (token: string | null) => settle(token);
  }

  it("times out with the request's budget without cancelling the refresh for others", async () => {
    jest.useFakeTimers();
    const { client, session } = setup(rejectsOldToken);
    const settle = pendingRefresh(session);

    const short = client.get("/a", { timeoutMs: 100 });
    const long = client.get("/b", { timeoutMs: 5_000 });
    const shortRejects = expect(short).rejects.toMatchObject({
      type: "tiempo-agotado",
      status: 0,
    });
    await jest.advanceTimersByTimeAsync(100);
    await shortRejects;

    settle("new-token");
    await expect(long).resolves.toEqual({ ok: true });
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.onUnauthorized).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("uses the client timeout for the wait by default", async () => {
    jest.useFakeTimers();
    const { client, session } = setup(rejectsOldToken, { timeoutMs: 1_000 });
    pendingRefresh(session);
    let settled = false;
    const request = client.get("/me");
    const markSettled = () => {
      settled = true;
    };
    request.then(markSettled, markSettled);

    await jest.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    await expect(request).rejects.toMatchObject({ type: "tiempo-agotado" });
  });

  it("rethrows the caller's abort while waiting and detaches its listeners", async () => {
    const { client, session } = setup(rejectsOldToken);
    const settle = pendingRefresh(session);
    const controller = new AbortController();
    const attach = jest.spyOn(controller.signal, "addEventListener");
    const detach = jest.spyOn(controller.signal, "removeEventListener");

    const aborted = client.get("/a", { signal: controller.signal });
    const other = client.get("/b");
    await flush();
    controller.abort();

    const error = await aborted.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: "AbortError" });
    expect(detach).toHaveBeenCalledTimes(attach.mock.calls.length);

    settle("new-token");
    await expect(other).resolves.toEqual({ ok: true });
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(session.onUnauthorized).not.toHaveBeenCalled();
  });

  it("does not wait when the caller signal is already aborted", async () => {
    const { client, session } = setup((call) => {
      controller.abort();
      return rejectsOldToken(call);
    });
    const controller = new AbortController();

    await expect(client.get("/me", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("does not start a refresh when the caller aborts while the token is read", async () => {
    const { client, session } = setup(rejectsOldToken);
    const controller = new AbortController();
    let reads = 0;
    session.getAccessToken.mockImplementation(() => {
      reads += 1;
      // The second read is the rotation check after the 401.
      if (reads === 2) controller.abort();
      return session.token;
    });

    await expect(client.get("/me", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(session.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("rejects at once when the caller aborts before the wait listens", async () => {
    const { client, session } = setup(rejectsOldToken);
    const controller = new AbortController();
    let settle: (token: string | null) => void = () => {};
    session.refreshAccessToken.mockImplementation(() => {
      // Fires the abort event before the waiter attaches its listener.
      controller.abort();
      return new Promise((resolve) => {
        settle = resolve;
      });
    });
    let settled = false;
    const markSettled = () => {
      settled = true;
    };
    const request = client.get("/me", { signal: controller.signal });
    request.then(markSettled, markSettled);

    await flush();
    await flush();

    expect(settled).toBe(true);
    const error = await request.catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: "AbortError" });
    settle(null);
    await flush();
    expect(session.onUnauthorized).not.toHaveBeenCalled();
  });
});

describe("shared refresh deadline", () => {
  const rejectsOldToken: Handler = (call) =>
    call.headers.Authorization === "Bearer old-token" ? unauthorized : ok({ ok: true });

  it("frees the single-flight slot after twice the client timeout", async () => {
    jest.useFakeTimers();
    const { client, session } = setup(rejectsOldToken, { timeoutMs: 1_000 });
    session.refreshAccessToken.mockImplementationOnce(() => new Promise(() => {}));
    let settled = false;
    const markSettled = () => {
      settled = true;
    };
    // Waits longer than the deadline, so only the deadline can end it.
    const first = client.get("/a", { timeoutMs: 10_000 });
    first.then(markSettled, markSettled);

    await jest.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await expect(first).rejects.toMatchObject({ type: "tiempo-agotado", status: 0 });

    // A later 401 starts a fresh refresh instead of joining the hung one.
    await expect(client.get("/b")).resolves.toEqual({ ok: true });
    expect(session.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(session.onUnauthorized).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("honors refreshTimeoutMs", async () => {
    jest.useFakeTimers();
    const { client, session } = setup(rejectsOldToken, {
      timeoutMs: 1_000,
      refreshTimeoutMs: 300,
    });
    session.refreshAccessToken.mockImplementationOnce(() => new Promise(() => {}));

    const request = client.get("/a");
    const rejects = expect(request).rejects.toMatchObject({ type: "tiempo-agotado" });
    await jest.advanceTimersByTimeAsync(300);

    await rejects;
  });

  it("keeps sharing the fresh refresh when the abandoned one settles late", async () => {
    jest.useFakeTimers();
    const { client, session } = setup(rejectsOldToken, { timeoutMs: 1_000 });
    let settleHung: (token: string | null) => void = () => {};
    let settleFresh: (token: string | null) => void = () => {};
    session.refreshAccessToken
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleHung = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            settleFresh = (token) => {
              session.token = token;
              resolve(token);
            };
          }),
      );

    const first = client.get("/a", { timeoutMs: 10_000 });
    const firstRejects = expect(first).rejects.toMatchObject({ type: "tiempo-agotado" });
    await jest.advanceTimersByTimeAsync(2_000);
    await firstRejects;

    const second = client.get("/b", { timeoutMs: 10_000 });
    await jest.advanceTimersByTimeAsync(0);
    settleHung("stale-token");
    await jest.advanceTimersByTimeAsync(0);
    const third = client.get("/c", { timeoutMs: 10_000 });
    await jest.advanceTimersByTimeAsync(0);

    expect(session.refreshAccessToken).toHaveBeenCalledTimes(2);
    settleFresh("new-token");
    await expect(Promise.all([second, third])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
