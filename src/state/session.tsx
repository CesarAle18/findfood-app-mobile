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
import type { MeDto } from "@/api/types";
import {
  resolveAccess,
  resolveActiveRole,
  type Access,
  type MobileRole,
} from "@/auth/access";
import { sessionStore, type SessionSnapshot, type SessionStatus } from "@/auth/session-store";
import { supabase } from "@/auth/supabase";
import { env } from "@/config/env";
import { queryKeys } from "@/services/query-keys";

const ACTIVE_ROLE_KEY = "findfood.activeRole";
/** Written by the push registration; unregistered on sign-out. */
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
  setRecovering: (recovering: boolean) => void;
}

const AccessContext = createContext<AccessState | null>(null);
const SessionActionsContext = createContext<SessionActions | null>(null);

function meQuery(enabled: boolean) {
  return queryOptions({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => api.get<MeDto>("/me", { signal }),
    enabled,
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
  const deviceId = await readItem(DEVICE_ID_KEY);
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
  if (env.appEnv === "real" && supabase) {
    try {
      // Removes the stored session even when the server call fails; emits SIGNED_OUT.
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // The store is cleared below either way.
    }
  }
  // The local profile's dev session only lives in memory: it stays signed out until the
  // app restarts.
  sessionStore.setSession(SIGNED_OUT);
}

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const sessionStatus = useSessionStatus();
  const [recovering, setRecovering] = useState(false);
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
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") {
        setRecovering(false);
        queryClient.clear();
      }
      sessionStore.setSession(toSnapshot(session));
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
          await Promise.all([deleteItem(DEVICE_ID_KEY), deleteItem(ACTIVE_ROLE_KEY)]);
          setStoredRole(null);
          setRecovering(false);
        } finally {
          signingOut.current = null;
        }
      })();
      return signingOut.current;
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

export function useSession(): { status: SessionStatus; email?: string } {
  useRequired(SessionActionsContext, "useSession");
  const status = useSessionStatus();
  const email = useSyncExternalStore(sessionStore.subscribe, selectEmail, selectEmail);
  return { status, email };
}

export function useMe() {
  useRequired(SessionActionsContext, "useMe");
  const status = useSessionStatus();
  return useQuery(meQuery(status === "present"));
}

export function useAccess(): AccessState {
  return useRequired(AccessContext, "useAccess");
}

export function useSessionActions(): SessionActions {
  return useRequired(SessionActionsContext, "useSessionActions");
}
