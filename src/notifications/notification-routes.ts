/**
 * Where a notification opens, from its type code and related ids. Pure, so the inbox and
 * the push response handler share one mapping.
 */
import type { Href } from "expo-router";

import type { MobileRole } from "@/auth/access";

/** Codes the "Importantes" tab shows: they ask the user to act or report a failure. */
export const IMPORTANT_CODES: ReadonlySet<string> = new Set([
  "ASIGNACION_OFRECIDA",
  "DONACION_CANCELADA",
  "DONACION_EXPIRADA",
  "DONACION_RECHAZADA",
  "VERIFICACION_RECHAZADA",
]);

export function isImportant(tipo: string): boolean {
  return IMPORTANT_CODES.has(tipo);
}

/** The fields of a notification (inbox row or push `data`) that decide its screen. */
export interface NotificationLink {
  tipo: string;
  donacion_id?: string | null;
  asignacion_id?: string | null;
}

export interface NotificationAccess {
  canDonor: boolean;
  canVolunteer: boolean;
  /** The current view; picks the alerts tab when the notification has no screen of its own. */
  activeRole?: MobileRole | null;
}

/** The screen to push, and the view (role) it belongs to. */
export interface NotificationTarget {
  href: Href;
  role: MobileRole;
}

/** The alerts tab (this inbox) of each view. */
export const ALERTS_HREF: Record<MobileRole, Href> = {
  DONANTE: "/donante/alertas",
  VOLUNTARIO: "/voluntario/alertas",
};

/** Screens of the donor view that show one donation by its `?id=` (UUID). */
const DONOR_DONATION_SCREENS = {
  ASIGNACION_ACEPTADA: "/donante/voluntario-asignado",
  DONACION_RECOGIDA: "/donante/seguimiento",
  // Delivery confirmation, with "Calificar voluntario" while not rated yet.
  DONACION_ENTREGADA: "/donante/entrega-donacion",
  DONACION_RECIBIDA: "/donante/entrega-donacion",
  DONACION_RECHAZADA: "/donante/detalle-donacion",
  DONACION_EXPIRADA: "/donante/detalle-donacion",
} as const;

function canOpen(role: MobileRole, { canDonor, canVolunteer }: NotificationAccess): boolean {
  return role === "DONANTE" ? canDonor : canVolunteer;
}

/** The alerts tab of the active view, else of any view the user has; null without one. */
function alertsFor(access: NotificationAccess): NotificationTarget | null {
  const roles: MobileRole[] = access.activeRole
    ? [access.activeRole, "DONANTE", "VOLUNTARIO"]
    : ["DONANTE", "VOLUNTARIO"];
  const role = roles.find((candidate) => canOpen(candidate, access));
  return role ? { href: ALERTS_HREF[role], role } : null;
}

/** The notification's own screen, ignoring whether the user can open its view. */
function ownScreen(
  { tipo, donacion_id, asignacion_id }: NotificationLink,
  access: NotificationAccess,
): NotificationTarget | null {
  if (tipo === "ASIGNACION_OFRECIDA") {
    return asignacion_id
      ? {
          href: { pathname: "/voluntario/oferta", params: { asignacionId: asignacion_id } },
          role: "VOLUNTARIO",
        }
      : null;
  }
  if (tipo === "DONACION_CANCELADA") return { href: "/voluntario/rutas", role: "VOLUNTARIO" };
  if (tipo === "VERIFICACION_APROBADA" || tipo === "VERIFICACION_RECHAZADA") {
    // Without the volunteer role yet (a rejected application), the account screen.
    return access.canVolunteer
      ? { href: "/voluntario/perfil", role: "VOLUNTARIO" }
      : { href: "/cuenta", role: "DONANTE" };
  }
  if (tipo in DONOR_DONATION_SCREENS) {
    const pathname = DONOR_DONATION_SCREENS[tipo as keyof typeof DONOR_DONATION_SCREENS];
    return donacion_id ? { href: { pathname, params: { id: donacion_id } }, role: "DONANTE" } : null;
  }
  return null;
}

/**
 * The screen a notification opens: its own when the user has that view and the related id
 * is present, else the alerts tab. Null when the user can open neither view.
 */
export function routeForNotification(
  notification: NotificationLink,
  access: NotificationAccess,
): NotificationTarget | null {
  const own = ownScreen(notification, access);
  if (own && canOpen(own.role, access)) return own;
  return alertsFor(access);
}
