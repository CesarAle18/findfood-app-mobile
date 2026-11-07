/**
 * Where a notification opens, from its type code and related ids. Pure, so the inbox and
 * the push response handler share one mapping.
 */
import type { Href } from "expo-router";

import type { MobileRole } from "@/auth/access";

/**
 * Codes the "Importantes" tab shows: they ask the user to act or report a failure. Any other
 * code, known or not, is informative.
 */
export const IMPORTANT_CODES: ReadonlySet<string> = new Set([
  "ASIGNACION_OFRECIDA",
  "DONACION_CANCELADA",
  "DONACION_CANCELADA_BANCO",
  "DONACION_EXPIRADA",
  "DONACION_RECHAZADA",
  "RECOGIDA_FALLIDA",
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
  // The volunteer marked arrival at the pickup point: follow them live.
  VOLUNTARIO_EN_SITIO: "/donante/seguimiento",
  DONACION_RECOGIDA: "/donante/seguimiento",
  // Delivery confirmation, with "Calificar voluntario" while not rated yet.
  DONACION_ENTREGADA: "/donante/entrega-donacion",
  DONACION_RECIBIDA: "/donante/entrega-donacion",
  DONACION_RECHAZADA: "/donante/detalle-donacion",
  DONACION_EXPIRADA: "/donante/detalle-donacion",
  // Staff cancelled it, published it again for another volunteer, or its pickup failed.
  DONACION_CANCELADA_BANCO: "/donante/detalle-donacion",
  DONACION_REPUBLICADA: "/donante/detalle-donacion",
  RECOGIDA_FALLIDA: "/donante/detalle-donacion",
} as const;

/** Another volunteer or the bank fleet took the offer: it is closed, Inicio lists the open ones. */
const CLOSED_OFFER_CODES: ReadonlySet<string> = new Set([
  "ASIGNACION_TOMADA",
  "ASIGNACION_RETIRADA",
]);

/** The staff took or resolved an incident the user reported (usually on a pickup). */
const INCIDENT_CODES: ReadonlySet<string> = new Set([
  "INCIDENCIA_EN_REVISION",
  "INCIDENCIA_RESUELTA",
]);

/** The donation detail (`?id=`) of each view. */
const DONATION_DETAIL_HREF = {
  DONANTE: "/donante/detalle-donacion",
  VOLUNTARIO: "/voluntario/detalle-donacion",
} as const satisfies Record<MobileRole, Href>;

function canOpen(role: MobileRole, { canDonor, canVolunteer }: NotificationAccess): boolean {
  return role === "DONANTE" ? canDonor : canVolunteer;
}

/** The active view, else any view the user has; null without one. */
function currentView(access: NotificationAccess): MobileRole | null {
  const roles: MobileRole[] = access.activeRole
    ? [access.activeRole, "DONANTE", "VOLUNTARIO"]
    : ["DONANTE", "VOLUNTARIO"];
  return roles.find((candidate) => canOpen(candidate, access)) ?? null;
}

/** The alerts tab of the current view; null without one. */
function alertsFor(access: NotificationAccess): NotificationTarget | null {
  const role = currentView(access);
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
  if (CLOSED_OFFER_CODES.has(tipo)) return { href: "/voluntario", role: "VOLUNTARIO" };
  if (INCIDENT_CODES.has(tipo)) {
    // Its donation, in the view the user is in (the notice does not say which one reported it).
    const role = currentView(access);
    return donacion_id && role
      ? { href: { pathname: DONATION_DETAIL_HREF[role], params: { id: donacion_id } }, role }
      : null;
  }
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
