import { useCallback, useRef, useState } from "react";

// Through the alias, like the screens: test and render-check fakes replace it by this name.
import { useSessionActions } from "@/state/session";

/**
 * The sign-out of a screen: `signOut` starts it (requests made while it runs are ignored)
 * and `signingOut` stays true until it finishes, for a busy, disabled button. The guards
 * leave the screen once the session ends: nothing here navigates.
 */
export function useSignOut(): { signOut: () => void; signingOut: boolean } {
  const { cerrarSesion } = useSessionActions();
  const [signingOut, setSigningOut] = useState(false);
  // State only changes on the next render: two calls before it must not both start.
  const running = useRef(false);
  const signOut = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setSigningOut(true);
    // cerrarSesion never rejects.
    void cerrarSesion().finally(() => {
      running.current = false;
      setSigningOut(false);
    });
  }, [cerrarSesion]);
  return { signOut, signingOut };
}
