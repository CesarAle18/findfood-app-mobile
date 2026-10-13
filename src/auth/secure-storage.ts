/**
 * Supabase Auth storage backed by expo-secure-store (iOS Keychain / Android Keystore), so
 * the session is never stored in plaintext. Web (preview only) falls back to localStorage.
 *
 * A session JSON easily exceeds the ~2048 bytes some iOS versions accept per item, so each
 * value is split into chunks. For a key K (mapped to the SecureStore charset):
 * - `K__n` holds `<slot>:<count>`: the active slot (`a` or `b`) and its number of chunks.
 * - `K__<slot><index>` holds the chunks of that slot.
 * A write fills the inactive slot, then switches `K__n` to it (a single-item commit) and
 * deletes the previous slot. An interrupted or failed write therefore leaves the previous
 * value readable, never a mix of old and new chunks.
 *
 * Values are never logged.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Supabase `auth.storage` contract (async variant). */
export interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Max UTF-8 bytes per chunk, below the ~2048-byte per-item limit. */
export const CHUNK_MAX_BYTES = 1800;

// ~460 KB; a session is a few KB. Bounds the reads and deletes driven by stored counts.
const MAX_CHUNKS = 256;

type Slot = "a" | "b";

interface Manifest {
  slot: Slot;
  count: number;
}

const MANIFEST = /^([ab]):(\d{1,3})$/;

// SecureStore keys may only contain [A-Za-z0-9._-]. Every other character, `_` included,
// is written as `_<hex code point>_`. The mapping is injective, and a mapped key never
// contains `__` followed by a non-hex suffix, so the `__n` / `__<slot><index>` suffixes
// cannot collide across keys.
function toSecureStoreKey(key: string): string {
  return key.replace(
    /[^A-Za-z0-9.-]/gu,
    (char) => `_${(char.codePointAt(0) ?? 0).toString(16)}_`,
  );
}

function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}

/** Splits on code point boundaries so no chunk holds half a character. */
function splitUtf8(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  // for...of walks code points: surrogate pairs stay together.
  for (const char of value) {
    const size = utf8Length(char.codePointAt(0) ?? 0);
    if (bytes + size > maxBytes) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

function parseManifest(raw: string | null): Manifest | null {
  const match = raw === null ? null : MANIFEST.exec(raw);
  if (!match) return null;
  const count = Number(match[2]);
  return count <= MAX_CHUNKS ? { slot: match[1] as Slot, count } : null;
}

const otherSlot = (slot: Slot): Slot => (slot === "a" ? "b" : "a");
const manifestKey = (base: string) => `${base}__n`;
const chunkKey = (base: string, slot: Slot, index: number) => `${base}__${slot}${index}`;

/**
 * Deletes the chunks `[from, knownEnd)` of a slot, then any later chunk still present: the
 * leftovers of an interrupted write.
 */
async function deleteChunks(base: string, slot: Slot, from: number, knownEnd: number) {
  const known: Promise<void>[] = [];
  for (let index = from; index < knownEnd; index++) {
    known.push(SecureStore.deleteItemAsync(chunkKey(base, slot, index)));
  }
  await Promise.all(known);
  for (let index = Math.max(from, knownEnd); index < MAX_CHUNKS; index++) {
    const key = chunkKey(base, slot, index);
    if ((await SecureStore.getItemAsync(key)) === null) break;
    await SecureStore.deleteItemAsync(key);
  }
}

async function deleteEntry(base: string, manifest: Manifest | null) {
  await SecureStore.deleteItemAsync(manifestKey(base));
  const knownEnd = (slot: Slot) => (manifest?.slot === slot ? manifest.count : 0);
  await Promise.all([
    deleteChunks(base, "a", 0, knownEnd("a")),
    deleteChunks(base, "b", 0, knownEnd("b")),
  ]);
}

// Cleanup never turns a completed read or write into a failure: leftovers are swept by
// the next write to the same slot.
async function bestEffort(cleanup: Promise<void>) {
  try {
    await cleanup;
  } catch {
    // Ignored on purpose (see above).
  }
}

async function readEntry(base: string): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(manifestKey(base));
  if (raw === null) return null;
  const manifest = parseManifest(raw);
  if (!manifest) {
    await bestEffort(deleteEntry(base, null));
    return null;
  }
  let value = "";
  for (let index = 0; index < manifest.count; index++) {
    const chunk = await SecureStore.getItemAsync(chunkKey(base, manifest.slot, index));
    if (chunk === null) {
      await bestEffort(deleteEntry(base, manifest));
      return null;
    }
    value += chunk;
  }
  return value;
}

async function writeEntry(base: string, value: string) {
  const chunks = splitUtf8(value, CHUNK_MAX_BYTES);
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(`Secure storage values are limited to ${MAX_CHUNKS} chunks.`);
  }
  const previous = parseManifest(await SecureStore.getItemAsync(manifestKey(base)));
  const slot = previous ? otherSlot(previous.slot) : "a";

  // Sequential, so an interrupted write leaves a contiguous run that deleteChunks sweeps.
  for (const [index, chunk] of chunks.entries()) {
    await SecureStore.setItemAsync(chunkKey(base, slot, index), chunk);
  }
  await deleteChunks(base, slot, chunks.length, chunks.length);
  await SecureStore.setItemAsync(manifestKey(base), `${slot}:${chunks.length}`);
  await bestEffort(deleteChunks(base, otherSlot(slot), 0, previous?.count ?? 0));
}

/** Runs the operations on one key one after another; different keys run concurrently. */
function createKeyedQueue() {
  const tails = new Map<string, Promise<void>>();
  return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const result = (tails.get(key) ?? Promise.resolve()).then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    tails.set(key, tail);
    void tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
}

export function createChunkedSecureStorage(): AuthStorage {
  const enqueue = createKeyedQueue();
  return {
    getItem: (key) => {
      const base = toSecureStoreKey(key);
      return enqueue(base, () => readEntry(base));
    },
    setItem: (key, value) => {
      const base = toSecureStoreKey(key);
      return enqueue(base, () => writeEntry(base, value));
    },
    removeItem: (key) => {
      const base = toSecureStoreKey(key);
      return enqueue(base, async () => {
        const manifest = parseManifest(await SecureStore.getItemAsync(manifestKey(base)));
        await deleteEntry(base, manifest);
      });
    },
  };
}

type WebStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserLocalStorage(): WebStorage | undefined {
  return globalThis.localStorage;
}

/** localStorage-backed storage; a missing or inaccessible localStorage stores nothing. */
export function createWebStorage(
  resolve: () => WebStorage | null | undefined = browserLocalStorage,
): AuthStorage {
  const storage = (): WebStorage | null => {
    try {
      const candidate = resolve();
      // Server rendering and some runtimes expose no usable localStorage.
      return candidate && typeof candidate.getItem === "function" ? candidate : null;
    } catch {
      return null;
    }
  };
  return {
    getItem: async (key) => storage()?.getItem(key) ?? null,
    setItem: async (key, value) => {
      storage()?.setItem(key, value);
    },
    removeItem: async (key) => {
      storage()?.removeItem(key);
    },
  };
}

export const secureStorage: AuthStorage =
  Platform.OS === "web" ? createWebStorage() : createChunkedSecureStorage();
