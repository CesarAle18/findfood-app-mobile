/**
 * The current auth session, outside React.
 *
 * The HTTP client reads the token and reports rejected sessions here, and SessionProvider
 * feeds the session in and handles the reports, so neither imports the other. React reads
 * it with `useSyncExternalStore`. Every method works detached from the store object.
 */

export type SessionStatus = "loading" | "none" | "present";

export interface SessionSnapshot {
  /** `loading` until the stored session has been read at startup. */
  status: SessionStatus;
  accessToken: string | null;
  userId?: string;
  email?: string;
}

/** Called when the API rejected the session; must not throw or reject. */
export type UnauthorizedHandler = () => unknown;

export interface SessionStore {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  /** Ignored when nothing changed, so subscribers only hear real changes. */
  setSession(next: SessionSnapshot): void;
  getAccessToken(): string | null;
  /** Replaces the handler; the returned function removes it if it is still registered. */
  setUnauthorizedHandler(handler: UnauthorizedHandler): () => void;
  /** `ApiClientOptions.onUnauthorized`: runs the handler, never throws. */
  notifyUnauthorized(): void;
}

const INITIAL_SNAPSHOT: SessionSnapshot = { status: "loading", accessToken: null };

function sameSession(a: SessionSnapshot, b: SessionSnapshot): boolean {
  return (
    a.status === b.status &&
    a.accessToken === b.accessToken &&
    a.userId === b.userId &&
    a.email === b.email
  );
}

function ignore() {
  // The handler failure must not reach the request that reported the 401.
}

export function createSessionStore(
  initial: SessionSnapshot = INITIAL_SNAPSHOT,
): SessionStore {
  let snapshot: SessionSnapshot = { ...initial };
  const listeners = new Set<() => void>();
  let unauthorizedHandler: UnauthorizedHandler | null = null;

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setSession: (next) => {
      if (sameSession(snapshot, next)) return;
      snapshot = { ...next };
      for (const listener of [...listeners]) listener();
    },
    getAccessToken: () => snapshot.accessToken,
    setUnauthorizedHandler: (handler) => {
      unauthorizedHandler = handler;
      return () => {
        if (unauthorizedHandler === handler) unauthorizedHandler = null;
      };
    },
    notifyUnauthorized: () => {
      const handler = unauthorizedHandler;
      if (!handler) return;
      try {
        const result = handler();
        if (result instanceof Promise) result.catch(ignore);
      } catch {
        ignore();
      }
    },
  };
}

/** The app-wide session. */
export const sessionStore = createSessionStore();
