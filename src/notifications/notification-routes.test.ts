import type { Href } from "expo-router";

import type { MobileRole } from "@/auth/access";

import {
  IMPORTANT_CODES,
  isImportant,
  routeForNotification,
  type NotificationAccess,
  type NotificationTarget,
} from "./notification-routes";

const DONATION = "don-uuid";
const ASSIGNMENT = "asg-uuid";

const both: NotificationAccess = { canDonor: true, canVolunteer: true, activeRole: "DONANTE" };
const donorOnly: NotificationAccess = { canDonor: true, canVolunteer: false, activeRole: "DONANTE" };
const volunteerOnly: NotificationAccess = {
  canDonor: false,
  canVolunteer: true,
  activeRole: "VOLUNTARIO",
};

const ids = { donacion_id: DONATION, asignacion_id: ASSIGNMENT };
const target = (href: Href, role: MobileRole): NotificationTarget => ({ href, role });

const donorAlerts = target("/donante/alertas", "DONANTE");
const volunteerAlerts = target("/voluntario/alertas", "VOLUNTARIO");
const detail = target({ pathname: "/donante/detalle-donacion", params: { id: DONATION } }, "DONANTE");
const delivery = target({ pathname: "/donante/entrega-donacion", params: { id: DONATION } }, "DONANTE");
const volunteerDetail = target(
  { pathname: "/voluntario/detalle-donacion", params: { id: DONATION } },
  "VOLUNTARIO",
);
const volunteerHome = target("/voluntario", "VOLUNTARIO");
const volunteerActive: NotificationAccess = { ...both, activeRole: "VOLUNTARIO" };

describe("routeForNotification", () => {
  it.each<[string, NotificationAccess, NotificationTarget | null]>([
    [
      "ASIGNACION_OFRECIDA",
      both,
      target({ pathname: "/voluntario/oferta", params: { asignacionId: ASSIGNMENT } }, "VOLUNTARIO"),
    ],
    ["DONACION_CANCELADA", both, target("/voluntario/rutas", "VOLUNTARIO")],
    [
      "ASIGNACION_ACEPTADA",
      both,
      target({ pathname: "/donante/voluntario-asignado", params: { id: DONATION } }, "DONANTE"),
    ],
    [
      "DONACION_RECOGIDA",
      both,
      target({ pathname: "/donante/seguimiento", params: { id: DONATION } }, "DONANTE"),
    ],
    [
      "VOLUNTARIO_EN_SITIO",
      both,
      target({ pathname: "/donante/seguimiento", params: { id: DONATION } }, "DONANTE"),
    ],
    ["DONACION_ENTREGADA", both, delivery],
    ["DONACION_RECIBIDA", both, delivery],
    ["DONACION_RECHAZADA", both, detail],
    ["DONACION_EXPIRADA", both, detail],
    ["VERIFICACION_APROBADA", both, target("/voluntario/perfil", "VOLUNTARIO")],
    ["VERIFICACION_RECHAZADA", both, target("/voluntario/perfil", "VOLUNTARIO")],
    // A donor whose application was rejected has no volunteer view yet.
    ["VERIFICACION_RECHAZADA", donorOnly, target("/cuenta", "DONANTE")],
    ["ALERTA_VENCIMIENTO", both, donorAlerts],
    ["CODIGO_DESCONOCIDO", { ...both, activeRole: "VOLUNTARIO" }, volunteerAlerts],
    // A route of a role the user lacks falls back to the alerts of a role they have.
    ["ASIGNACION_OFRECIDA", donorOnly, donorAlerts],
    ["DONACION_ENTREGADA", volunteerOnly, volunteerAlerts],
    ["DONACION_ENTREGADA", { canDonor: false, canVolunteer: false, activeRole: null }, null],
    // Staff actions on the donor's donation open it, like the other donor notices.
    ["DONACION_CANCELADA_BANCO", both, detail],
    ["DONACION_REPUBLICADA", both, detail],
    ["RECOGIDA_FALLIDA", both, detail],
    ["RECOGIDA_FALLIDA", volunteerOnly, volunteerAlerts],
    // A closed offer has no screen left: the volunteer's Inicio lists the open ones.
    ["ASIGNACION_TOMADA", both, volunteerHome],
    ["ASIGNACION_RETIRADA", both, volunteerHome],
    ["ASIGNACION_RETIRADA", donorOnly, donorAlerts],
    // A reviewed incident opens its donation in the view the user is in.
    ["INCIDENCIA_EN_REVISION", both, detail],
    ["INCIDENCIA_EN_REVISION", volunteerActive, volunteerDetail],
    ["INCIDENCIA_RESUELTA", both, detail],
    ["INCIDENCIA_RESUELTA", volunteerOnly, volunteerDetail],
    ["INCIDENCIA_RESUELTA", { ...donorOnly, activeRole: "VOLUNTARIO" }, detail],
    // Staff-only codes keep the fallback.
    ["INCIDENCIA_REPORTADA", both, donorAlerts],
  ])("%s → %j", (tipo, access, expected) => {
    expect(routeForNotification({ tipo, ...ids }, access)).toEqual(expected);
  });

  it("opens the closed offers' Inicio even without ids", () => {
    const empty = { donacion_id: null, asignacion_id: null };
    for (const tipo of ["ASIGNACION_TOMADA", "ASIGNACION_RETIRADA"]) {
      expect(routeForNotification({ tipo, ...empty }, both)).toEqual(volunteerHome);
    }
  });

  it.each([
    ["DONACION_CANCELADA_BANCO", both, donorAlerts],
    ["DONACION_REPUBLICADA", both, donorAlerts],
    ["RECOGIDA_FALLIDA", both, donorAlerts],
    ["INCIDENCIA_EN_REVISION", both, donorAlerts],
    ["INCIDENCIA_RESUELTA", volunteerActive, volunteerAlerts],
  ] as const)("%s without a donation opens the alerts tab", (tipo, access, expected) => {
    const notice = { tipo, donacion_id: null, asignacion_id: ASSIGNMENT };
    expect(routeForNotification(notice, access)).toEqual(expected);
  });

  it("falls back to the alerts tab when the related id is missing", () => {
    const empty = { donacion_id: null, asignacion_id: null };
    expect(routeForNotification({ tipo: "ASIGNACION_OFRECIDA", ...empty }, both)).toEqual(donorAlerts);
    expect(routeForNotification({ tipo: "DONACION_RECOGIDA", ...empty }, both)).toEqual(donorAlerts);
    expect(routeForNotification({ tipo: "VOLUNTARIO_EN_SITIO", ...empty }, both)).toEqual(donorAlerts);
  });

  it("prefers the active role's alerts and ignores an active role the user lacks", () => {
    const unknown = { tipo: "OTRO", ...ids };
    expect(routeForNotification(unknown, { ...donorOnly, activeRole: "VOLUNTARIO" })).toEqual(
      donorAlerts,
    );
    expect(routeForNotification(unknown, { ...volunteerOnly, activeRole: null })).toEqual(
      volunteerAlerts,
    );
  });
});

describe("isImportant", () => {
  it("flags exactly the codes that need the user's attention", () => {
    expect([...IMPORTANT_CODES].sort()).toEqual([
      "ASIGNACION_OFRECIDA",
      "DONACION_CANCELADA",
      "DONACION_CANCELADA_BANCO",
      "DONACION_EXPIRADA",
      "DONACION_RECHAZADA",
      "RECOGIDA_FALLIDA",
      "VERIFICACION_RECHAZADA",
    ]);
    expect(isImportant("ASIGNACION_OFRECIDA")).toBe(true);
    expect(isImportant("DONACION_RECIBIDA")).toBe(false);
    expect(isImportant("OTRO")).toBe(false);
  });

  it.each([
    "DONACION_REPUBLICADA",
    "ASIGNACION_TOMADA",
    "ASIGNACION_RETIRADA",
    "INCIDENCIA_EN_REVISION",
    "INCIDENCIA_RESUELTA",
  ])("leaves the informative %s out", (tipo) => {
    expect(isImportant(tipo)).toBe(false);
  });
});
