/**
 * Which screens exist for each access phase, and where the gate (`index`) sends the user.
 * Pure, so the root layout guards, the gate and their tests share one source of truth.
 *
 * Routes are flat for now; F1-09 moves the app routes into the `/donante` and `/voluntario`
 * segments.
 */
import type { AccessPhase, MobileRole } from "@/auth/access";

/**
 * Route files guarded by each group of the root Stack. Every route except the gate belongs
 * to exactly one group (checked by the tests against `src/app`).
 */
export const ROUTE_GROUPS = {
  auth: ["login", "registro", "recuperar-contrasena"],
  verifyEmail: ["verificar-correo"],
  noAccess: ["sin-acceso"],
  app: [
    "calificar-donante",
    "calificar-voluntario",
    "cuenta",
    "detalle-donacion",
    "entrega-donante",
    "entrega-voluntario",
    "espera-voluntario",
    "explore",
    "inicio",
    "inicio-donante",
    "mis-donaciones",
    "notificaciones",
    "nueva-donacion",
    "oferta",
    "pantallas",
    "perfil-donante",
    "perfil-voluntario",
    "registrar-recogida",
    "registro-voluntario",
    "revisar-donacion",
    "ruta-activa",
    "seguimiento",
    "voluntario-asignado",
  ],
} as const satisfies Record<string, readonly string[]>;

export type RouteGroup = keyof typeof ROUTE_GROUPS;

export type RouteGuards = Record<RouteGroup, boolean>;

/** The `Stack.Protected` guard of each group. Every group is closed while loading. */
export function guardsFor(phase: AccessPhase): RouteGuards {
  return {
    auth: phase === "auth",
    // Also open while signed out: sign-up continues there before any session exists.
    verifyEmail: phase === "auth" || phase === "verify-email",
    noAccess: phase === "no-mobile-role" || phase === "account-blocked",
    app: phase === "app",
  };
}

/** Where the gate redirects; each target is open in the phase that leads to it. */
export type AccessRoute =
  | "/login"
  | "/verificar-correo"
  | "/sin-acceso"
  | "/inicio-donante"
  | "/inicio";

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
      if (activeRole === "DONANTE") return "/inicio-donante";
      if (activeRole === "VOLUNTARIO") return "/inicio";
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
