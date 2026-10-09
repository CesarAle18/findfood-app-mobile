import * as SecureStore from "expo-secure-store";

import {
  CHUNK_MAX_BYTES,
  createChunkedSecureStorage,
  createWebStorage,
  secureStorage,
  type AuthStorage,
} from "./secure-storage";

// In-memory SecureStore with the same key rule as expo-secure-store and the ~2048-byte
// value limit some iOS versions enforce, so an unchunked session would fail here too.
const mockStore = new Map<string, string>();
const MOCK_VALUE_LIMIT_BYTES = 2048;

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => {
    mockAssertKey(key);
    return mockStore.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockAssertKey(key);
    mockAssertValue(value);
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockAssertKey(key);
    mockStore.delete(key);
  }),
}));

function mockAssertKey(key: string) {
  if (!/^[\w.-]+$/.test(key)) throw new Error(`Invalid key provided to SecureStore: ${key}`);
}

function mockAssertValue(value: string) {
  if (typeof value !== "string") throw new Error("Invalid value provided to SecureStore.");
  if (utf8Bytes(value) > MOCK_VALUE_LIMIT_BYTES) throw new Error("Value too large");
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

const setItemAsync = jest.mocked(SecureStore.setItemAsync);

const KEY = "sb-project-auth-token";

/** A session-shaped JSON string of roughly `bytes` bytes, ASCII only. */
function asciiSession(bytes: number): string {
  const base = JSON.stringify({ access_token: "", refresh_token: "r".repeat(40) });
  return JSON.stringify({
    access_token: "a".repeat(bytes - base.length),
    refresh_token: "r".repeat(40),
  });
}

/** ~5 KB with 2-, 3- and 4-byte characters (and surrogate pairs) all over the value. */
function multiByteSession(): string {
  const user = { nombre: "José Peña", ciudad: "Bogotá", nota: "ñandú 漢字 😀🍞" };
  const users = Array.from({ length: 60 }, (_unused, index) => ({ ...user, index }));
  return JSON.stringify({ access_token: "a".repeat(200), users });
}

function storedValues(): string[] {
  return [...mockStore.values()];
}

let storage: AuthStorage;

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  storage = createChunkedSecureStorage();
});

describe("chunked SecureStore storage", () => {
  it("round-trips a ~5 KB ASCII session through chunks under the byte limit", async () => {
    const value = asciiSession(5_000);

    await storage.setItem(KEY, value);

    await expect(storage.getItem(KEY)).resolves.toBe(value);
    const chunks = storedValues().filter((stored) => utf8Bytes(stored) > 100);
    expect(chunks).toHaveLength(Math.ceil(5_000 / CHUNK_MAX_BYTES));
    for (const stored of storedValues()) {
      expect(utf8Bytes(stored)).toBeLessThanOrEqual(CHUNK_MAX_BYTES);
    }
  });

  it("splits multi-byte text on code point boundaries and restores it intact", async () => {
    const value = multiByteSession();
    expect(utf8Bytes(value)).toBeGreaterThan(2 * CHUNK_MAX_BYTES);

    await storage.setItem(KEY, value);

    await expect(storage.getItem(KEY)).resolves.toBe(value);
    for (const stored of storedValues()) {
      expect(utf8Bytes(stored)).toBeLessThanOrEqual(CHUNK_MAX_BYTES);
      // No chunk may start or end in the middle of a surrogate pair.
      expect(stored).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  it("stores a small value as a single chunk plus its count", async () => {
    await storage.setItem(KEY, "José");

    expect(mockStore.size).toBe(2);
    await expect(storage.getItem(KEY)).resolves.toBe("José");
  });

  it("round-trips an empty value", async () => {
    await storage.setItem(KEY, "");

    await expect(storage.getItem(KEY)).resolves.toBe("");
  });

  it("removes stale chunks when a shorter value overwrites a longer one", async () => {
    await storage.setItem(KEY, asciiSession(5_000));

    await storage.setItem(KEY, "short");

    expect(mockStore.size).toBe(2);
    await expect(storage.getItem(KEY)).resolves.toBe("short");
  });

  it("grows from a short value to a long one", async () => {
    const value = multiByteSession();
    await storage.setItem(KEY, "short");

    await storage.setItem(KEY, value);

    await expect(storage.getItem(KEY)).resolves.toBe(value);
    expect(mockStore.size).toBe(1 + Math.ceil(utf8Bytes(value) / CHUNK_MAX_BYTES));
  });

  it("removeItem deletes the count and every chunk", async () => {
    await storage.setItem(KEY, asciiSession(5_000));

    await storage.removeItem(KEY);

    expect(mockStore.size).toBe(0);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
  });

  it("resolves null for a key that was never stored", async () => {
    await expect(storage.getItem(KEY)).resolves.toBeNull();
    await expect(storage.removeItem(KEY)).resolves.toBeUndefined();
  });

  it("returns null and cleans up when a chunk is missing", async () => {
    await storage.setItem(KEY, asciiSession(5_000));
    const isFullChunk = (key: string) => mockStore.get(key)?.length === CHUNK_MAX_BYTES;
    const chunkKey = [...mockStore.keys()].find(isFullChunk);
    expect(chunkKey).toBeDefined();
    mockStore.delete(chunkKey as string);

    await expect(storage.getItem(KEY)).resolves.toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it("returns null and cleans up when the chunk count is unreadable", async () => {
    await storage.setItem(KEY, "value");
    const countKey = [...mockStore.keys()].find((key) => mockStore.get(key) !== "value");
    mockStore.set(countKey as string, "garbage");

    await expect(storage.getItem(KEY)).resolves.toBeNull();
    expect(mockStore.size).toBe(0);
  });

  it("keeps the previous value when a write fails midway", async () => {
    const previous = asciiSession(5_000);
    await storage.setItem(KEY, previous);
    setItemAsync
      .mockImplementationOnce(async (key: string, value: string) => {
        mockStore.set(key, value);
      })
      .mockRejectedValueOnce(new Error("keychain unavailable"));

    await expect(storage.setItem(KEY, multiByteSession())).rejects.toThrow(
      "keychain unavailable",
    );

    await expect(storage.getItem(KEY)).resolves.toBe(previous);
  });

  it("serializes concurrent writes to the same key", async () => {
    await Promise.all([
      storage.setItem(KEY, asciiSession(5_000)),
      storage.setItem(KEY, multiByteSession()),
      storage.setItem(KEY, "last"),
    ]);

    await expect(storage.getItem(KEY)).resolves.toBe("last");
    expect(mockStore.size).toBe(2);
  });

  it("answers a read issued during a write with the written value", async () => {
    await storage.setItem(KEY, "old");
    let release = () => {};
    setItemAsync.mockImplementationOnce(async (key: string, value: string) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      mockStore.set(key, value);
    });

    const write = storage.setItem(KEY, "new");
    const read = storage.getItem(KEY);
    await new Promise<void>((resolve) => setImmediate(resolve));
    release();
    await write;

    await expect(read).resolves.toBe("new");
  });

  it("maps keys to the SecureStore charset without collisions", async () => {
    const keys = ["sb:project/auth token", "sb:project_auth token", "sb/project:auth token"];

    for (const [index, key] of keys.entries()) await storage.setItem(key, `value-${index}`);

    for (const stored of mockStore.keys()) expect(stored).toMatch(/^[\w.-]+$/);
    for (const [index, key] of keys.entries()) {
      await expect(storage.getItem(key)).resolves.toBe(`value-${index}`);
    }
  });

  it("never logs stored values", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => {});
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await storage.setItem(KEY, asciiSession(5_000));
      mockStore.delete([...mockStore.keys()][0]);
      await storage.getItem(KEY);

      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("is the adapter exported for native platforms", async () => {
    await secureStorage.setItem(KEY, "native");

    expect(setItemAsync).toHaveBeenCalled();
    await expect(secureStorage.getItem(KEY)).resolves.toBe("native");
    await secureStorage.removeItem(KEY);
    expect(mockStore.size).toBe(0);
  });
});

describe("web storage", () => {
  function fakeLocalStorage() {
    const items = new Map<string, string>();
    return {
      items,
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => {
        items.set(key, value);
      },
      removeItem: (key: string) => {
        items.delete(key);
      },
    };
  }

  it("uses localStorage as-is", async () => {
    const local = fakeLocalStorage();
    const web = createWebStorage(() => local);

    await web.setItem("sb:key", "José");
    expect(local.items.get("sb:key")).toBe("José");
    await expect(web.getItem("sb:key")).resolves.toBe("José");
    await web.removeItem("sb:key");
    await expect(web.getItem("sb:key")).resolves.toBeNull();
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  it("degrades to an empty store when localStorage is missing or throws", async () => {
    for (const resolve of [
      () => undefined,
      () => {
        throw new Error("SecurityError");
      },
    ]) {
      const web = createWebStorage(resolve);

      await expect(web.setItem("key", "value")).resolves.toBeUndefined();
      await expect(web.getItem("key")).resolves.toBeNull();
      await expect(web.removeItem("key")).resolves.toBeUndefined();
    }
  });
});
