/**
 * Session, account and access state for the whole app.
 *
 * Split so each screen subscribes to what it uses:
 * - `useSession()`: status and email, read from the session store.
 * - `useMe()`: the `GET /me` query (TanStack only re-renders for the fields read).
 * - `useAccess()`: phase, role flags and the active role (one context).
 * - `useSessionActions()`: stable functions (one context that never changes).
 *
 * Requires a QueryClientProvider above it.
 */
import type { Session } from "@supabase/supabase-js";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Context,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";

import { api } from "@/api";
import { startupQueryOptions } from "@/api/query-client";
import type { MeDto } from "@/api/types";
import {
  resolveAccess,
  resolveActiveRole,
  type Access,
  type MobileRole,
} from "@/auth/access";
import { sessionStore, type SessionSnapshot, type SessionStatus } from "@/auth/session-store";
import { signOutLocally, supabase } from "@/auth/supabase";
import { env } from "@/config/env";
import { queryKeys } from "@/services/query-keys";

const ACTIVE_ROLE_KEY = "findfood.activeRole";
/**
 * Set while a password reset link's session exists without the new password: it survives a
 * restart, so a cold start with that session opens the reset screen, never the app.
 */
const RECOVERING_KEY = "findfood.recovering";
/** Written by the push registration (see deviceIdStorage); unregistered on sign-out. */
const DEVICE_ID_KEY = "findfood.deviceId";
const DEVICE_UNREGISTER_TIMEOUT_MS = 3_000;

const SIGNED_OUT: SessionSnapshot = { status: "none", accessToken: null };

export interface AccessState extends Access {
  activeRole: MobileRole | null;
  /** Persists the user's choice; roles the account lacks are ignored by `activeRole`. */
  setActiveRole: (role: MobileRole) => void;
}

export interface SessionActions {
  /** Signs out on this device. Never rejects; concurrent calls share one run. */
  cerrarSesion: () => Promise<void>;
  /**
   * Marks or ends a password recovery, in state at once and in storage when the promise
   * resolves (it never rejects).
   */
  setRecovering: (recovering: boolean) => Promise<void>;
}

function storeRecovering(recovering: boolean): Promise<void> {
  return recovering ? writeItem(RECOVERING_KEY, "1") : deleteItem(RECOVERING_KEY);
}

const AccessContext = createContext<AccessState | null>(null);
const SessionActionsContext = createContext<SessionActions | null>(null);

function meQuery(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api.get<MeDto>("/me", { signal }),
    enabled,
    // The access gate waits on /me: offline it fails with `sin-conexion` (phase `error`)
    // and is fetched again on reconnect, instead of staying paused in `loading`.
    ...startupQueryOptions,
  });
}

const selectStatus = () => sessionStore.getSnapshot().status;
const selectEmail = () => sessionStore.getSnapshot().email;

function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(sessionStore.subscribe, selectStatus, selectStatus);
}

// Small device-local values. SecureStore has no web implementation: the web preview keeps
// nothing. Failures are ignored; these are preferences, never the session itself.
async function readItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // See above.
  }
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // See above.
  }
}

/**
 * Id of this install's push registration (`POST /me/dispositivos`), kept so sign-out can
 * unregister it. Written by `@/services/perfil`. `read` and `clear` never reject; `save`
 * does, because a lost id would leave the device registered after sign-out and the caller
 * has to roll the registration back.
 */
export const deviceIdStorage = {
  read: (): Promise<string | null> => readItem(DEVICE_ID_KEY),
  save: async (id: string): Promise<void> => {
    if (Platform.OS === "web") return;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  },
  clear: (): Promise<void> => deleteItem(DEVICE_ID_KEY),
};

function toSnapshot(session: Session | null): SessionSnapshot {
  if (!session) return SIGNED_OUT;
  return {
    status: "present",
    accessToken: session.access_token,
    userId: session.user.id,
    email: session.user.email,
  };
}

/** Best effort and bounded: signing out never waits on the network for long. */
async function unregisterDevice(): Promise<void> {
  const deviceId = await deviceIdStorage.read();
  if (!deviceId || !sessionStore.getAccessToken()) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_UNREGISTER_TIMEOUT_MS);
  try {
    await api.delete(`/me/dispositivos/${encodeURIComponent(deviceId)}`, {
      signal: controller.signal,
      timeoutMs: DEVICE_UNREGISTER_TIMEOUT_MS,
    });
  } catch {
    // Ignored on purpose (see above).
  } finally {
    clearTimeout(timer);
  }
}

async function endSession(): Promise<void> {
  // Never rejects, and removes the stored session even when Supabase's sign-out fails.
  if (env.appEnv === "real") await signOutLocally();
  // The local profile's dev session only lives in memory: it stays signed out until the
  // app restarts.
  sessionStore.setSession(SIGNED_OUT);
}

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const sessionStatus = useSessionStatus();
  // Undefined until the stored flag is read (the access phase stays `loading` meanwhile).
  const [recovering, setRecoveringState] = useState<boolean | undefined>(undefined);
  // User intent only (undefined: not read yet, null: no choice); see resolveActiveRole.
  const [storedRole, setStoredRole] = useState<string | null | undefined>(undefined);
  const signingOut = useRef<Promise<void> | null>(null);

  const {
    data: me,
    status: meStatus,
    error: meError,
  } = useQuery(meQuery(sessionStatus === "present"));

  useEffect(() => {
    if (env.appEnv === "local") {
      if (sessionStore.getSnapshot().status === "loading") {
        sessionStore.setSession(
          env.devToken ? { status: "present", accessToken: env.devToken } : SIGNED_OUT,
        );
      }
      return;
    }
    const client = supabase;
    if (!client) {
      sessionStore.setSession(SIGNED_OUT);
      return;
    }

    let active = true;
    let heardEvent = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      heardEvent = true;
      if (event === "PASSWORD_RECOVERY") {
        setRecoveringState(true);
        void storeRecovering(true);
      }
      if (event === "SIGNED_OUT") {
        setRecoveringState(false);
        void storeRecovering(false);
        queryClient.clear();
      }
      sessionStore.setSession(toSnapshot(session));
      // A verified email code or a new password changes `pendientes` (the database clears
      // CONFIRMAR_CORREO / CAMBIAR_PASSWORD) without changing the session's status: fetch
      // the account again, so no screen has to remember it.
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      }
    });
    // An auth event is newer than the stored session read at startup.
    client.auth.getSession().then(
      ({ data }) => {
        if (active && !heardEvent) sessionStore.setSession(toSnapshot(data.session));
      },
      () => {
        if (active && !heardEvent) sessionStore.setSession(SIGNED_OUT);
      },
    );
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  // Read once the session is known: a stored flag only counts with the session it belongs
  // to. Without one (signed out, or the exchange never finished) it is forgotten.
  useEffect(() => {
    if (sessionStatus === "loading") return;
    let active = true;
    const signedIn = sessionStatus === "present";
    void readItem(RECOVERING_KEY).then((value) => {
      const stored = value === "1";
      if (stored && !signedIn) void storeRecovering(false);
      // A change made meanwhile (a recovery link, a sign-out) wins over the stored flag.
      if (active) setRecoveringState((current) => current ?? (stored && signedIn));
    });
    return () => {
      active = false;
    };
  }, [sessionStatus]);

  useEffect(() => {
    let active = true;
    void readItem(ACTIVE_ROLE_KEY).then((value) => {
      // A choice made while reading wins over the stored one.
      if (active) setStoredRole((current) => (current === undefined ? value : current));
    });
    return () => {
      active = false;
    };
  }, []);

  const setActiveRole = useCallback((role: MobileRole) => {
    setStoredRole(role);
    void writeItem(ACTIVE_ROLE_KEY, role);
  }, []);

  const actions = useMemo<SessionActions>(() => {
    function cerrarSesion(): Promise<void> {
      signingOut.current ??= (async () => {
        try {
          await unregisterDevice();
          await endSession();
          queryClient.clear();
          await Promise.all([
            deviceIdStorage.clear(),
            deleteItem(ACTIVE_ROLE_KEY),
            storeRecovering(false),
          ]);
          setStoredRole(null);
          setRecoveringState(false);
        } finally {
          signingOut.current = null;
        }
      })();
      return signingOut.current;
    }
    function setRecovering(value: boolean): Promise<void> {
      setRecoveringState(value);
      return storeRecovering(value);
    }
    return { cerrarSesion, setRecovering };
  }, [queryClient]);

  const { cerrarSesion } = actions;
  useEffect(
    () =>
      sessionStore.setUnauthorizedHandler(() => {
        void cerrarSesion();
      }),
    [cerrarSesion],
  );

  const { phase, canDonor, canVolunteer } = resolveAccess({
    sessionStatus,
    recovering,
    me,
    meStatus,
    meError,
  });
  const activeRole = me ? resolveActiveRole(me.roles, storedRole) : null;
  // Holds the app back until the stored role is known, so the gate never opens one role's
  // screens and then switches to the other.
  const gatedPhase = phase === "app" && storedRole === undefined ? "loading" : phase;

  const access = useMemo<AccessState>(
    () => ({ phase: gatedPhase, canDonor, canVolunteer, activeRole, setActiveRole }),
    [gatedPhase, canDonor, canVolunteer, activeRole, setActiveRole],
  );

  return (
    <SessionActionsContext value={actions}>
      <AccessContext value={access}>{children}</AccessContext>
    </SessionActionsContext>
  );
}

function useRequired<T>(context: Context<T | null>, hook: string): T {
  const value = use(context);
  if (!value) throw new Error(`${hook} requires SessionProvider`);
  return value;
}

/**
 * For hooks that read the session store or the /me query instead of a context: that data
 * is only kept up to date by a mounted SessionProvider (it feeds the store and handles
 * 401s), so they still fail fast outside it. Checked through the actions context because
 * its value never changes: reading it adds no re-renders.
 */
function useAssertSessionProvider(hook: string): void {
  useRequired(SessionActionsContext, hook);
}

export function useSession(): { status: SessionStatus; email?: string } {
  useAssertSessionProvider("useSession");
  const status = useSessionStatus();
  const email = useSyncExternalStore(sessionStore.subscribe, selectEmail, selectEmail);
  return { status, email };
}

export function useMe() {
  useAssertSessionProvider("useMe");
  const status = useSessionStatus();
  return useQuery(meQuery(status === "present"));
}

export function useAccess(): AccessState {
  return useRequired(AccessContext, "useAccess");
}

export function useSessionActions(): SessionActions {
  return useRequired(SessionActionsContext, "useSessionActions");
}
