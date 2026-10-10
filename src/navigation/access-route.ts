/**
 * Which screens exist for each access state, and where the gate (`index`) sends the user.
 * Pure, so the root layout guards, the gate and their tests share one source of truth.
 */
import type { Access, AccessPhase, MobileRole } from "@/auth/access";

/**
 * Top-level routes guarded by each group of the root Stack: a route file or a segment
 * directory (`donante/`, `voluntario/`). Every route except the gate belongs to exactly one
 * group (checked by the tests against `src/app`).
 */
export const ROUTE_GROUPS = {
  auth: ["login", "registro", "recuperar-contrasena"],
  verifyEmail: ["verificar-correo"],
  noAccess: ["sin-acceso"],
  /** The donor segment: its tabs and donation screens. */
  donor: ["donante"],
  /** The volunteer segment: its tabs and route screens. */
  volunteer: ["voluntario"],
  /** Screens of any mobile role. */
  app: ["cuenta"],
} as const satisfies Record<string, readonly string[]>;

export type RouteGroup = keyof typeof ROUTE_GROUPS;

export type RouteGuards = Record<RouteGroup, boolean>;

/**
 * The `Stack.Protected` guard of each group. Every group is closed while loading, and a role
 * segment only opens for an account that has the role, whichever view is active.
 */
export function guardsFor({ phase, canDonor, canVolunteer }: Access): RouteGuards {
  const app = phase === "app";
  return {
    auth: phase === "auth",
    // Also open while signed out: sign-up continues there before any session exists.
    verifyEmail: phase === "auth" || phase === "verify-email",
    noAccess: phase === "no-mobile-role" || phase === "account-blocked",
    donor: app && canDonor,
    volunteer: app && canVolunteer,
    app,
  };
}

/** Where the gate redirects; each target is open in the access that leads to it. */
export type AccessRoute = "/login" | "/verificar-correo" | "/sin-acceso" | "/donante" | "/voluntario";

/**
 * The screen for the phase and the active role, or null when the gate renders the phase
 * itself (loading, startup error and the account steps that have no screen yet).
 */
export function routeForAccess(
  phase: AccessPhase,
  activeRole: MobileRole | null,
): AccessRoute | null {
  switch (phase) {
    case "auth":
      return "/login";
    case "verify-email":
      return "/verificar-correo";
    case "no-mobile-role":
    case "account-blocked":
      return "/sin-acceso";
    case "app":
      if (activeRole === "DONANTE") return "/donante";
      if (activeRole === "VOLUNTARIO") return "/voluntario";
      // Unreachable (the app phase implies a mobile role); staying put avoids a loop.
      return null;
    case "loading":
    case "error":
    case "recovering":
    case "change-password":
    case "complete-profile":
      return null;
  }
}
