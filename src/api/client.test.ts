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

  it("treats a failing refresh as no token", async () => {
    const { client, session } = setup(rejectsOldToken);
    session.refreshAccessToken.mockRejectedValue(new Error("refresh failed"));

    await expect(client.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(session.onUnauthorized).toHaveBeenCalledTimes(1);
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
