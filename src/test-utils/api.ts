/**
 * A fake `api` client for service tests:
 *
 *   jest.mock("@/api", () => ({
 *     api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
 *   }));
 */
export type ApiMethod = "get" | "post" | "put" | "patch" | "delete";

export type ApiMock = Record<ApiMethod, jest.Mock>;

export interface SentRequest {
  method: ApiMethod;
  path: string;
  options?: unknown;
}

const METHODS: readonly ApiMethod[] = ["get", "post", "put", "patch", "delete"];

/** Every method resolves undefined until a test sets its own answer. */
export function createApiMock(): ApiMock {
  return Object.fromEntries(
    METHODS.map((method) => [method, jest.fn(async () => undefined)]),
  ) as ApiMock;
}

/** Forgets the recorded calls and the answers set by a previous test. */
export function resetApiMock(mock: ApiMock): void {
  for (const method of METHODS) mock[method].mockReset().mockResolvedValue(undefined);
}

/** The requests sent through the mock, grouped by method. */
export function sentRequests(mock: ApiMock): SentRequest[] {
  return METHODS.flatMap((method) =>
    mock[method].mock.calls.map(([path, options]: [string, unknown?]) =>
      options === undefined ? { method, path } : { method, path, options },
    ),
  );
}
