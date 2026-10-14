/**
 * Weekly availability windows (`FranjaDto`, Bogotá time) between `GET /me`, the
 * `AvailabilityField` and `PUT /voluntario/disponibilidad`, plus the API's rules checked on
 * the client: hours as `HH:mm`, the end after the start, no crossing windows on the same day
 * and at most 42 windows.
 *
 * Windows crossing midnight are rejected, never split: the API answers 422 `franja-invalida`
 * for an end that is not after the start, and the field offers `23:59` as the last end, so a
 * late shift is entered as two windows (`22:00–23:59` and the next day's `00:00–02:00`).
 */
import type { FranjaDto, MeDto } from "@/api/types";

/** `PUT /voluntario/disponibilidad` takes at most this many windows. */
export const MAX_FRANJAS = 42;

/** The last end a window can have: the API never takes one crossing midnight. */
export const END_OF_DAY = "23:59";

/** The week as shown, from Monday; `dia` is the API's `dia_semana` (Sunday = 0). */
export const WEEK_DAYS = [
  { dia: 1, label: "Lunes" },
  { dia: 2, label: "Martes" },
  { dia: 3, label: "Miércoles" },
  { dia: 4, label: "Jueves" },
  { dia: 5, label: "Viernes" },
  { dia: 6, label: "Sábado" },
  { dia: 0, label: "Domingo" },
] as const;

export function dayLabel(dia: number): string {
  return WEEK_DAYS.find((day) => day.dia === dia)?.label ?? "Día desconocido";
}

const TIME = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** `8:00` / `08:00:00` → `08:00`; null when it is not a time of day. */
export function toHHmm(value: string): string | null {
  const match = TIME.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Zero-padded text compares like the time itself; malformed hours are kept as typed. */
function normalized({ dia_semana, hora_inicio, hora_fin }: FranjaDto): FranjaDto {
  return {
    dia_semana,
    hora_inicio: toHHmm(hora_inicio) ?? hora_inicio,
    hora_fin: toHHmm(hora_fin) ?? hora_fin,
  };
}

const byDayAndStart = (a: FranjaDto, b: FranjaDto) =>
  a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio);

/** `me.voluntario.disponibilidad` as `HH:mm` windows, in the API's order. */
export function franjasFromDisponibilidad(franjas: readonly FranjaDto[]): FranjaDto[] {
  return franjas.map(normalized);
}

/** The `franjas` of `PUT /voluntario/disponibilidad`: zero-padded, by day and start. */
export function franjasBody(franjas: readonly FranjaDto[]): FranjaDto[] {
  return franjas.map(normalized).sort(byDayAndStart);
}

/** Pairs of windows of the same day that cross; back-to-back windows do not. */
export function findOverlaps(franjas: readonly FranjaDto[]): [FranjaDto, FranjaDto][] {
  const sorted = franjas.map(normalized).sort(byDayAndStart);
  const pairs: [FranjaDto, FranjaDto][] = [];
  sorted.forEach((a, i) => {
    for (const b of sorted.slice(i + 1)) {
      if (b.dia_semana !== a.dia_semana) break;
      if (b.hora_inicio < a.hora_fin) pairs.push([a, b]);
    }
  });
  return pairs;
}

const hours = ({ hora_inicio, hora_fin }: FranjaDto) => `${hora_inicio}–${hora_fin}`;

/** The first broken rule as a Spanish message, or undefined when the API would take them. */
export function validateFranjas(franjas: readonly FranjaDto[]): string | undefined {
  if (franjas.length > MAX_FRANJAS) return `Puedes registrar como máximo ${MAX_FRANJAS} franjas.`;
  for (const franja of franjas) {
    const start = toHHmm(franja.hora_inicio);
    const end = toHHmm(franja.hora_fin);
    const day = dayLabel(franja.dia_semana);
    if (start === null || end === null) return `${day}: revisa las horas de la franja.`;
    if (end <= start) return `${day}: la hora de fin debe ser posterior a la de inicio.`;
  }
  const [overlap] = findOverlaps(franjas);
  if (overlap) {
    const [a, b] = overlap;
    return `Las franjas del ${dayLabel(a.dia_semana).toLowerCase()} se cruzan: ${hours(a)} y ${hours(b)}.`;
  }
  return undefined;
}

/**
 * The cached account after a successful `PUT /voluntario/disponibilidad`: the saved windows,
 * and `disponible` off when none is left (the API turns it off too).
 */
export function withDisponibilidad(
  me: MeDto | undefined,
  franjas: FranjaDto[],
): MeDto | undefined {
  if (!me?.voluntario) return me;
  return {
    ...me,
    voluntario: {
      ...me.voluntario,
      disponibilidad: franjas,
      disponible: franjas.length > 0 && me.voluntario.disponible,
    },
  };
}
