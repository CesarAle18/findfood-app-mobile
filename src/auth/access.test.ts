import { ApiError } from "@/api/errors";
import type { MeDto, Pendiente, Rol } from "@/api/types";

import { resolveAccess, resolveActiveRole, type AccessInput } from "./access";

function me(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: "u-1",
    email: "ana@example.com",
    nombres: "Ana",
    apellidos: "Ruiz",
    telefono: "3001234567",
    url_foto: null,
    estado: "ACTIVO",
    debe_cambiar_password: false,
    idioma: "es",
    acepto_terminos_at: "2026-10-01T10:00:00.000Z",
    created_at: "2026-10-01T10:00:00.000Z",
    email_verificado: true,
    roles: ["DONANTE"],
    pendientes: [],
    donante: null,
    voluntario: null,
    ...overrides,
  };
}

function signedIn(overrides: Partial<AccessInput> = {}): AccessInput {
  return {
    sessionStatus: "present",
    recovering: false,
    me: me(),
    meStatus: "success",
    ...overrides,
  };
}

function forbidden(type: string): ApiError {
  return new ApiError({ type, status: 403, title: "Forbidden" });
}

describe("resolveAccess", () => {
  it("waits while the session is being restored", () => {
    expect(
      resolveAccess({ sessionStatus: "loading", recovering: true, meStatus: "pending" }),
    ).toEqual({ phase: "loading", canDonor: false, canVolunteer: false });
  });

  it("waits until the stored recovery flag is read", () => {
    // A cold start with a stored recovery session must never open the app first.
    expect(resolveAccess(signedIn({ recovering: undefined })).phase).toBe("loading");
  });

  it("keeps a password recovery on its screen even when signed in", () => {
    expect(resolveAccess(signedIn({ recovering: true })).phase).toBe("recovering");
    expect(
      resolveAccess({ sessionStatus: "none", recovering: true, meStatus: "pending" }).phase,
    ).toBe("recovering");
  });

  it("sends a visitor without session to the auth screens", () => {
    expect(
      resolveAccess({ sessionStatus: "none", recovering: false, meStatus: "pending" }),
    ).toEqual({ phase: "auth", canDonor: false, canVolunteer: false });
  });

  it("ignores a cached account once the session is gone", () => {
    expect(resolveAccess(signedIn({ sessionStatus: "none" })).phase).toBe("auth");
  });

  it("waits for /me", () => {
    expect(resolveAccess(signedIn({ me: undefined, meStatus: "pending" })).phase).toBe(
      "loading",
    );
  });

  it("treats a success without data as still loading", () => {
    expect(resolveAccess(signedIn({ me: undefined })).phase).toBe("loading");
  });

  it.each(["cuenta-suspendida", "cuenta-inactiva", "cuenta-inexistente"])(
    "blocks the account on %s",
    (type) => {
      const access = resolveAccess(
        signedIn({ me: undefined, meStatus: "error", meError: forbidden(type) }),
      );
      expect(access).toEqual({ phase: "account-blocked", canDonor: false, canVolunteer: false });
    },
  );

  it("blocks the account even when an older /me is cached", () => {
    const access = resolveAccess(
      signedIn({ meStatus: "error", meError: forbidden("cuenta-suspendida") }),
    );
    expect(access.phase).toBe("account-blocked");
  });

  it.each([
    ["another 403", forbidden("prohibido")],
    ["a network error", ApiError.network(new TypeError("Network request failed"))],
    ["a non-API error", new Error("boom")],
    ["no error object", undefined],
  ])("reports %s without cached data as an error", (_label, error) => {
    expect(
      resolveAccess(signedIn({ me: undefined, meStatus: "error", meError: error })).phase,
    ).toBe("error");
  });

  it("keeps using the cached account when a background refetch fails", () => {
    const access = resolveAccess(
      signedIn({ meStatus: "error", meError: ApiError.timeout() }),
    );
    expect(access).toEqual({ phase: "app", canDonor: true, canVolunteer: false });
  });

  it.each<[Pendiente[], string]>([
    [["CONFIRMAR_CORREO"], "verify-email"],
    [["CAMBIAR_PASSWORD", "CONFIRMAR_CORREO", "TELEFONO"], "verify-email"],
    [["CAMBIAR_PASSWORD"], "change-password"],
    [["TELEFONO", "CAMBIAR_PASSWORD"], "change-password"],
    [["TELEFONO"], "complete-profile"],
    [["ACEPTAR_TERMINOS"], "complete-profile"],
    [["ACEPTAR_TERMINOS", "TELEFONO"], "complete-profile"],
  ])("routes pendientes %j to %s", (pendientes, phase) => {
    expect(resolveAccess(signedIn({ me: me({ pendientes }) })).phase).toBe(phase);
  });

  it("checks pendientes before the mobile roles", () => {
    const access = resolveAccess(
      signedIn({ me: me({ roles: ["ADMIN"], pendientes: ["TELEFONO"] }) }),
    );
    expect(access.phase).toBe("complete-profile");
  });

  it.each<[Rol[]]>([[[]], [["ADMIN"]], [["ASESOR_BANCO", "ADMIN"]]])(
    "has no mobile role with roles %j",
    (roles) => {
      expect(resolveAccess(signedIn({ me: me({ roles }) }))).toEqual({
        phase: "no-mobile-role",
        canDonor: false,
        canVolunteer: false,
      });
    },
  );

  it.each<[Rol[], boolean, boolean]>([
    [["DONANTE"], true, false],
    [["VOLUNTARIO"], false, true],
    [["DONANTE", "VOLUNTARIO", "ADMIN"], true, true],
  ])("opens the app for roles %j", (roles, canDonor, canVolunteer) => {
    expect(resolveAccess(signedIn({ me: me({ roles }) }))).toEqual({
      phase: "app",
      canDonor,
      canVolunteer,
    });
  });

  it("derives the role flags from /me whatever the phase", () => {
    const access = resolveAccess(
      signedIn({ me: me({ roles: ["VOLUNTARIO"], pendientes: ["CONFIRMAR_CORREO"] }) }),
    );
    expect(access).toEqual({ phase: "verify-email", canDonor: false, canVolunteer: true });
  });
});

describe("resolveActiveRole", () => {
  it("keeps the stored role when the account has it", () => {
    expect(resolveActiveRole(["DONANTE", "VOLUNTARIO"], "VOLUNTARIO")).toBe("VOLUNTARIO");
    expect(resolveActiveRole(["DONANTE", "VOLUNTARIO"], "DONANTE")).toBe("DONANTE");
  });

  it("falls back to DONANTE, then VOLUNTARIO", () => {
    expect(resolveActiveRole(["VOLUNTARIO", "DONANTE"], null)).toBe("DONANTE");
    expect(resolveActiveRole(["DONANTE"], "VOLUNTARIO")).toBe("DONANTE");
    expect(resolveActiveRole(["VOLUNTARIO"], "DONANTE")).toBe("VOLUNTARIO");
    expect(resolveActiveRole(["ADMIN", "VOLUNTARIO"], undefined)).toBe("VOLUNTARIO");
  });

  it("ignores stored values that are not mobile roles", () => {
    expect(resolveActiveRole(["ADMIN", "DONANTE"], "ADMIN")).toBe("DONANTE");
    expect(resolveActiveRole(["DONANTE", "VOLUNTARIO"], "garbage")).toBe("DONANTE");
  });

  it("is null without a mobile role", () => {
    expect(resolveActiveRole([], "DONANTE")).toBeNull();
    expect(resolveActiveRole(["ADMIN", "ASESOR_BANCO"], null)).toBeNull();
  });
});
