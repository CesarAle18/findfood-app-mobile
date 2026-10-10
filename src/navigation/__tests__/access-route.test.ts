import { getMockContext } from "expo-router/testing-library";

import type { AccessPhase, MobileRole } from "@/auth/access";

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

const GROUPS = Object.keys(ROUTE_GROUPS) as RouteGroup[];

/** The group that guards a route name, or undefined for the gate. */
function groupOf(name: string): RouteGroup | undefined {
  return GROUPS.find((group) => (ROUTE_GROUPS[group] as readonly string[]).includes(name));
}

describe("routeForAccess", () => {
  it.each<[AccessPhase, MobileRole | null, string]>([
    ["auth", null, "/login"],
    ["verify-email", null, "/verificar-correo"],
    ["no-mobile-role", null, "/sin-acceso"],
    ["account-blocked", null, "/sin-acceso"],
    ["app", "DONANTE", "/inicio-donante"],
    ["app", "VOLUNTARIO", "/inicio"],
  ])("sends %s with role %s to %s", (phase, role, route) => {
    expect(routeForAccess(phase, role)).toBe(route);
  });

  it.each<AccessPhase>(["auth", "verify-email", "no-mobile-role", "account-blocked"])(
    "ignores the active role in %s",
    (phase) => {
      const routes = ROLES.map((role) => routeForAccess(phase, role));
      expect(new Set(routes).size).toBe(1);
    },
  );

  it.each<AccessPhase>(["loading", "error", "recovering", "change-password", "complete-profile"])(
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
  const NONE: RouteGuards = { auth: false, verifyEmail: false, noAccess: false, app: false };

  it.each<[AccessPhase, Partial<RouteGuards>]>([
    ["loading", {}],
    ["recovering", {}],
    ["error", {}],
    ["change-password", {}],
    ["complete-profile", {}],
    ["auth", { auth: true, verifyEmail: true }],
    ["verify-email", { verifyEmail: true }],
    ["no-mobile-role", { noAccess: true }],
    ["account-blocked", { noAccess: true }],
    ["app", { app: true }],
  ])("opens the right groups in %s", (phase, open) => {
    expect(guardsFor(phase)).toEqual({ ...NONE, ...open });
  });
});

describe("route groups", () => {
  it("never redirects to a screen that its own phase blocks", () => {
    // A blocked target falls back to the gate, which would redirect to it again.
    const blocked: string[] = [];
    for (const phase of PHASES) {
      for (const role of ROLES) {
        const route = routeForAccess(phase, role);
        if (route === null) continue;
        const group = groupOf(route.slice(1));
        if (!group || !guardsFor(phase)[group]) blocked.push(`${phase} (${role}) -> ${route}`);
      }
    }
    expect(blocked).toEqual([]);
  });

  it("guards every route file except the gate, each exactly once", () => {
    // The route files expo-router finds (`./login.tsx`), relative to the project root.
    const routes = getMockContext("./src/app")
      .keys()
      .map((key) => key.replace(/^\.\//, "").replace(/\.[tj]sx?$/, ""))
      // Layouts and special files (`+not-found`, `+html`) are not screens.
      .filter((name) => !/(^|\/)[_+]/.test(name) && name !== "index");
    const guarded = GROUPS.flatMap((group) => ROUTE_GROUPS[group]);

    expect([...guarded].sort()).toEqual(routes.sort());
  });
});
