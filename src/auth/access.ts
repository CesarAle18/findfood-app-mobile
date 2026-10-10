/**
 * Which part of the app the user may see, derived from the session and `GET /me`.
 * Pure, so the root navigation guards and their tests share one source of truth.
 */
import { isApiError } from "@/api/errors";
import type { MeDto, Rol } from "@/api/types";

import type { SessionStatus } from "./session-store";

export type AccessPhase =
  | "loading"
  | "recovering"
  | "auth"
  | "error"
  | "account-blocked"
  | "verify-email"
  | "change-password"
  | "complete-profile"
  | "no-mobile-role"
  | "app";

/** Roles with screens in the mobile app. */
export type MobileRole = Extract<Rol, "DONANTE" | "VOLUNTARIO">;

export interface AccessInput {
  sessionStatus: SessionStatus;
  /** A password reset is in progress (its deep link creates a session first). */
  recovering: boolean;
  me?: MeDto;
  /** TanStack Query status of `GET /me`. */
  meStatus: "pending" | "error" | "success";
  meError?: unknown;
}

export interface Access {
  phase: AccessPhase;
  canDonor: boolean;
  canVolunteer: boolean;
}

/** 403 problem types of accounts that may not use the app. */
const BLOCKED_ACCOUNT_TYPES = new Set([
  "cuenta-suspendida",
  "cuenta-inactiva",
  "cuenta-inexistente",
]);

/** Fallback order when the user has not chosen a role (or chose one they lost). */
const MOBILE_ROLES: readonly MobileRole[] = ["DONANTE", "VOLUNTARIO"];

function isMobileRole(value: unknown): value is MobileRole {
  return MOBILE_ROLES.some((role) => role === value);
}

function resolvePhase({
  sessionStatus,
  recovering,
  me,
  meStatus,
  meError,
}: AccessInput): AccessPhase {
  if (sessionStatus === "loading") return "loading";
  if (recovering) return "recovering";
  if (sessionStatus === "none") return "auth";
  if (meStatus === "pending") return "loading";
  if (meStatus === "error") {
    if (isApiError(meError) && BLOCKED_ACCOUNT_TYPES.has(meError.type)) {
      return "account-blocked";
    }
    // A failed background refetch keeps the cached account usable.
    if (!me) return "error";
  }
  if (!me) return "loading";

  const { pendientes, roles } = me;
  if (pendientes.includes("CONFIRMAR_CORREO")) return "verify-email";
  if (pendientes.includes("CAMBIAR_PASSWORD")) return "change-password";
  if (pendientes.includes("TELEFONO") || pendientes.includes("ACEPTAR_TERMINOS")) {
    return "complete-profile";
  }
  if (!roles.some(isMobileRole)) return "no-mobile-role";
  return "app";
}

export function resolveAccess(input: AccessInput): Access {
  const roles = input.me?.roles ?? [];
  return {
    phase: resolvePhase(input),
    canDonor: roles.includes("DONANTE"),
    canVolunteer: roles.includes("VOLUNTARIO"),
  };
}

/**
 * The role whose screens are shown: the stored choice while the account still has it,
 * otherwise DONANTE, then VOLUNTARIO; null without a mobile role.
 */
export function resolveActiveRole(
  roles: readonly Rol[],
  stored: string | null | undefined,
): MobileRole | null {
  if (isMobileRole(stored) && roles.includes(stored)) return stored;
  return MOBILE_ROLES.find((role) => roles.includes(role)) ?? null;
}
