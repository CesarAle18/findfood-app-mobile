import { getMockContext } from "expo-router/testing-library";

import { resolveActiveRole, type Access, type AccessPhase, type MobileRole } from "@/auth/access";

import {
  guardsFor,
  ROUTE_GROUPS,
  routeForAccess,
  type RouteGroup,
  type RouteGuards,
} from "../access-route";

const PHASES: readonly AccessPhase[] = [
  "loading",
  "recovering",
  "auth",
  "error",
  "account-blocked",
  "verify-email",
  "change-password",
  "complete-profile",
  "no-mobile-role",
  "app",
];

const ROLES: readonly (MobileRole | null)[] = [null, "DONANTE", "VOLUNTARIO"];

/** The mobile roles an account can have. */
const ACCOUNTS: readonly (readonly MobileRole[])[] = [
  [],
  ["DONANTE"],
  ["VOLUNTARIO"],
  ["DONANTE", "VOLUNTARIO"],
];

const GROUPS = Object.keys(ROUTE_GROUPS) as RouteGroup[];

/** The group that guards a top-level route name, or undefined for the gate. */
function groupOf(name: string): RouteGroup | undefined {
  return GROUPS.find((group) => (ROUTE_GROUPS[group] as readonly string[]).includes(name));
}

function accessOf(phase: AccessPhase, roles: readonly MobileRole[]): Access {
  return { phase, canDonor: roles.includes("DONANTE"), canVolunteer: roles.includes("VOLUNTARIO") };
}

describe("routeForAccess", () => {
  it.each<[AccessPhase, MobileRole | null, string]>([
    ["auth", null, "/login"],
    ["verify-email", null, "/verificar-correo"],
    ["no-mobile-role", null, "/sin-acceso"],
    ["account-blocked", null, "/sin-acceso"],
    ["app", "DONANTE", "/donante"],
    ["app", "VOLUNTARIO", "/voluntario"],
    ["recovering", null, "/restablecer-contrasena"],
    ["complete-profile", null, "/completar-perfil"],
    ["change-password", null, "/cambiar-contrasena"],
  ])("sends %s with role %s to %s", (phase, role, route) => {
    expect(routeForAccess(phase, role)).toBe(route);
  });

  it.each<AccessPhase>([
    "auth",
    "verify-email",
    "no-mobile-role",
    "account-blocked",
    "recovering",
    "complete-profile",
    "change-password",
  ])(
    "ignores the active role in %s",
    (phase) => {
      const routes = ROLES.map((role) => routeForAccess(phase, role));
      expect(new Set(routes).size).toBe(1);
    },
  );

  it.each<AccessPhase>(["loading", "error"])(
    "keeps %s on the gate",
    (phase) => {
      for (const role of ROLES) expect(routeForAccess(phase, role)).toBeNull();
    },
  );

  it("keeps the app phase on the gate without a mobile role", () => {
    // Unreachable through resolveActiveRole, but a redirect here could loop.
    expect(routeForAccess("app", null)).toBeNull();
  });
});

describe("guardsFor", () => {
  // The password reset screen is never guarded: its deep link opens it in any phase (it
  // creates the session itself), and the `recovering` flag keeps the gate away from the app.
  const NONE: RouteGuards = {
    auth: false,
    verifyEmail: false,
    recovery: true,
    completeProfile: false,
    changePassword: false,
    noAccess: false,
    donor: false,
    volunteer: false,
    app: false,
  };

  it.each<[AccessPhase, Partial<RouteGuards>]>([
    ["loading", {}],
    ["recovering", {}],
    ["error", {}],
    ["change-password", { changePassword: true }],
    ["complete-profile", { completeProfile: true }],
    ["auth", { auth: true, verifyEmail: true }],
    ["verify-email", { verifyEmail: true }],
    ["no-mobile-role", { noAccess: true }],
    ["account-blocked", { noAccess: true }],
  ])("opens the right groups in %s, whatever the roles", (phase, open) => {
    for (const roles of ACCOUNTS) {
      expect(guardsFor(accessOf(phase, roles))).toEqual({ ...NONE, ...open });
    }
  });

  it.each<[string, readonly MobileRole[], Partial<RouteGuards>]>([
    ["a donor", ["DONANTE"], { app: true, donor: true }],
    ["a volunteer", ["VOLUNTARIO"], { app: true, volunteer: true }],
    ["a donor and volunteer", ["DONANTE", "VOLUNTARIO"], { app: true, donor: true, volunteer: true }],
  ])("opens only the segments of %s in the app phase", (_who, roles, open) => {
    expect(guardsFor(accessOf("app", roles))).toEqual({ ...NONE, ...open });
  });

  it("never opens a role segment outside the app phase", () => {
    for (const phase of PHASES.filter((p) => p !== "app")) {
      const guards = guardsFor(accessOf(phase, ["DONANTE", "VOLUNTARIO"]));
      expect([phase, guards.donor, guards.volunteer]).toEqual([phase, false, false]);
    }
  });
});

describe("route groups", () => {
  it("never redirects to a screen that its own access blocks", () => {
    // A blocked target falls back to the gate, which would redirect to it again.
    const blocked: string[] = [];
    for (const phase of PHASES) {
      for (const roles of ACCOUNTS) {
        for (const stored of ROLES) {
          const access = accessOf(phase, roles);
          const route = routeForAccess(phase, resolveActiveRole(roles, stored));
          if (route === null) continue;
          const group = groupOf(route.split("/")[1]);
          if (!group || !guardsFor(access)[group]) {
            blocked.push(`${phase} [${roles.join(",")}] (${stored}) -> ${route}`);
          }
        }
      }
    }
    expect(blocked).toEqual([]);
  });

  it("guards every route file except the gate, each segment exactly once", () => {
    // The route files expo-router finds (`./donante/(tabs)/index.tsx`), relative to the
    // project root. The root Stack guards top-level names: a file or a segment directory.
    const topLevel = getMockContext("./src/app")
      .keys()
      .map((key) => key.replace(/^\.\//, "").replace(/\.[tj]sx?$/, ""))
      // Layouts and special files (`+not-found`, `+html`) are not screens.
      .filter((name) => !/(^|\/)[_+]/.test(name) && name !== "index")
      .map((name) => name.split("/")[0]);
    const guarded = GROUPS.flatMap((group) => ROUTE_GROUPS[group]);

    expect([...guarded].sort()).toEqual([...new Set(topLevel)].sort());
  });
});
