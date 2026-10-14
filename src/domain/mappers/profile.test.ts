import type { FranjaDto } from "@/api/types";

import { formatFranjas, formatKg, formatRating, profileChanges, profileFromMe } from "./profile";

const me = {
  email: "maria@correo.com",
  nombres: "María",
  apellidos: "García López",
  telefono: "+573001234567",
};

describe("profileFromMe", () => {
  it("joins names and takes the initials of the first name and first surname", () => {
    expect(profileFromMe(me)).toEqual({
      name: "María García López",
      initials: "MG",
      email: "maria@correo.com",
      phone: "+573001234567",
    });
  });

  it("uses the first two given names without a surname", () => {
    expect(profileFromMe({ ...me, nombres: "ana lucía", apellidos: null })).toMatchObject({
      name: "ana lucía",
      initials: "AL",
    });
  });

  it("falls back to the email when the profile has no names yet", () => {
    expect(profileFromMe({ ...me, nombres: null, apellidos: null })).toMatchObject({
      name: "maria@correo.com",
      initials: "M",
    });
  });

  it("says when there is no phone", () => {
    expect(profileFromMe({ ...me, telefono: null }).phone).toBe("Sin registrar");
  });
});

describe("formatKg", () => {
  it.each([
    [280, "280 kg"],
    [12.5, "12,5 kg"],
    [0.25, "0,3 kg"],
    [0, "0 kg"],
  ])("formats %p", (kg, expected) => {
    expect(formatKg(kg)).toBe(expected);
  });
});

describe("formatRating", () => {
  it.each([
    [4.5, "4,5 / 5"],
    [5, "5,0 / 5"],
    [3.96, "4,0 / 5"],
  ])("formats %p", (average, expected) => {
    expect(formatRating(average)).toBe(expected);
  });

  it("says when there are no ratings yet", () => {
    expect(formatRating(null)).toBe("Sin calificaciones");
  });
});

describe("formatFranjas", () => {
  const franja = (dia_semana: number, hora_inicio: string, hora_fin: string): FranjaDto => ({
    dia_semana,
    hora_inicio,
    hora_fin,
  });

  it("lists each window with its day (0 = Sunday)", () => {
    expect(formatFranjas([franja(1, "08:00", "12:00"), franja(0, "14:00", "18:00")])).toBe(
      "Lun 08:00–12:00 · Dom 14:00–18:00",
    );
  });

  it("drops the seconds the API may send", () => {
    expect(formatFranjas([franja(3, "08:00:00", "10:30:00")])).toBe("Mié 08:00–10:30");
  });

  it("says when there is no schedule", () => {
    expect(formatFranjas([])).toBe("Sin horario registrado");
  });
});

describe("profileChanges", () => {
  const me = { nombres: "Ana", apellidos: "Ruiz", telefono: "3001234567" };

  it("sends nothing when nothing changed (the phone compares normalized)", () => {
    expect(
      profileChanges(me, { nombres: "Ana", apellidos: "Ruiz", telefono: "+573001234567" }),
    ).toEqual({});
  });

  it("sends only the changed fields", () => {
    expect(
      profileChanges(me, { nombres: "Ana María", apellidos: "Ruiz", telefono: "+573109876543" }),
    ).toEqual({ nombres: "Ana María", telefono: "+573109876543" });
  });

  it("fills what the account was missing", () => {
    expect(
      profileChanges(
        { nombres: null, apellidos: null, telefono: null },
        { nombres: "Ana", apellidos: "Ruiz", telefono: "+573001234567" },
      ),
    ).toEqual({ nombres: "Ana", apellidos: "Ruiz", telefono: "+573001234567" });
  });
});
