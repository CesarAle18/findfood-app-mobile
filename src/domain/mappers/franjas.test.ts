import type { FranjaDto } from "@/api/types";
import { meFixture } from "@/test-utils/fixtures";

import {
  MAX_FRANJAS,
  WEEK_DAYS,
  dayLabel,
  findOverlaps,
  franjasBody,
  franjasFromDisponibilidad,
  toHHmm,
  validateFranjas,
  withDisponibilidad,
} from "./franjas";

const franja = (dia_semana: number, hora_inicio: string, hora_fin: string): FranjaDto => ({
  dia_semana,
  hora_inicio,
  hora_fin,
});

describe("days", () => {
  it("lists the week from Monday, with Sunday as 0 like the API", () => {
    expect(WEEK_DAYS.map(({ dia }) => dia)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(dayLabel(0)).toBe("Domingo");
    expect(dayLabel(1)).toBe("Lunes");
    expect(dayLabel(6)).toBe("Sábado");
  });
});

describe("toHHmm", () => {
  it.each([
    ["8:00", "08:00"],
    ["08:30", "08:30"],
    ["08:30:00", "08:30"],
    ["23:59", "23:59"],
    ["0:05", "00:05"],
  ])("pads %s to %s", (input, expected) => {
    expect(toHHmm(input)).toBe(expected);
  });

  it.each(["24:00", "12:60", "", "ab:cd", "8"])("rejects %p", (input) => {
    expect(toHHmm(input)).toBeNull();
  });
});

describe("franjasFromDisponibilidad / franjasBody", () => {
  it("keeps the API windows as HH:mm (Postgres TIME may carry seconds)", () => {
    expect(franjasFromDisponibilidad([franja(1, "08:00:00", "12:00:00")])).toEqual([
      franja(1, "08:00", "12:00"),
    ]);
  });

  it("sends zero-padded windows ordered by day (Sunday first) and start", () => {
    expect(
      franjasBody([franja(3, "14:00", "18:00"), franja(0, "9:00", "12:00"), franja(3, "8:00", "12:00")]),
    ).toEqual([franja(0, "09:00", "12:00"), franja(3, "08:00", "12:00"), franja(3, "14:00", "18:00")]);
  });
});

describe("findOverlaps", () => {
  it("finds windows of the same day that cross", () => {
    const a = franja(1, "08:00", "12:00");
    const b = franja(1, "11:00", "14:00");
    expect(findOverlaps([a, b, franja(2, "08:00", "12:00")])).toEqual([[a, b]]);
  });

  it("allows back-to-back windows and the same hours on other days", () => {
    expect(
      findOverlaps([franja(1, "08:00", "12:00"), franja(1, "12:00", "14:00"), franja(2, "08:00", "12:00")]),
    ).toEqual([]);
  });

  it("finds a window inside another one", () => {
    expect(findOverlaps([franja(5, "08:00", "18:00"), franja(5, "10:00", "11:00")])).toHaveLength(1);
  });
});

describe("validateFranjas", () => {
  it("accepts valid windows and an empty list", () => {
    expect(validateFranjas([franja(1, "08:00", "18:00"), franja(0, "09:00", "12:00")])).toBeUndefined();
    expect(validateFranjas([])).toBeUndefined();
  });

  it("rejects an end that is not after the start (the API never takes a window crossing midnight)", () => {
    expect(validateFranjas([franja(5, "22:00", "02:00")])).toBe(
      "Viernes: la hora de fin debe ser posterior a la de inicio.",
    );
    expect(validateFranjas([franja(5, "10:00", "10:00")])).toBe(
      "Viernes: la hora de fin debe ser posterior a la de inicio.",
    );
  });

  it("names the day and hours of crossing windows", () => {
    expect(validateFranjas([franja(1, "08:00", "12:00"), franja(1, "11:00", "14:00")])).toBe(
      "Las franjas del lunes se cruzan: 08:00–12:00 y 11:00–14:00.",
    );
  });

  it("rejects malformed hours", () => {
    expect(validateFranjas([franja(1, "8", "12:00")])).toBe("Lunes: revisa las horas de la franja.");
  });

  it(`rejects more than ${MAX_FRANJAS} windows`, () => {
    const many = Array.from({ length: MAX_FRANJAS + 1 }, (_, i) =>
      franja(i % 7, `${String(Math.floor(i / 7) * 2).padStart(2, "0")}:00`, `${String(Math.floor(i / 7) * 2 + 1).padStart(2, "0")}:00`),
    );
    expect(validateFranjas(many)).toBe(`Puedes registrar como máximo ${MAX_FRANJAS} franjas.`);
    expect(validateFranjas(many.slice(0, MAX_FRANJAS))).toBeUndefined();
  });
});

describe("withDisponibilidad", () => {
  it("stores the saved windows in the account", () => {
    const saved = [franja(2, "07:00", "09:00")];
    const me = withDisponibilidad(meFixture(), saved);
    expect(me?.voluntario?.disponibilidad).toEqual(saved);
    expect(me?.voluntario?.disponible).toBe(true);
  });

  it("turns availability off when no window is left, as the API does", () => {
    const me = withDisponibilidad(meFixture(), []);
    expect(me?.voluntario?.disponibilidad).toEqual([]);
    expect(me?.voluntario?.disponible).toBe(false);
  });

  it("leaves an account without a volunteer profile untouched", () => {
    const me = meFixture({ voluntario: null });
    expect(withDisponibilidad(me, [])).toBe(me);
    expect(withDisponibilidad(undefined, [])).toBeUndefined();
  });
});
