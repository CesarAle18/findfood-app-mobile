/**
 * The volunteer's weekly availability (`me.voluntario.disponibilidad`, Bogotá time) as the
 * profile shows it: consecutive days with the same hours folded into one row, and whether
 * the volunteer is reachable right now.
 *
 * Windows never cross midnight (see `franjas.ts`), so every comparison stays within one day
 * and `HH:mm` text compares like the time itself.
 */
import type { FranjaDto } from "@/api/types";

import { bogotaWeekdayAndTime } from "./dates";
import { END_OF_DAY, toHHmm, WEEK_DAYS } from "./franjas";

export interface AvailabilityBlock {
  /** The `dia_semana` of each day in the row, from Monday. */
  days: number[];
  /** `Lun – Mié`, or one day's `Sáb`. */
  label: string;
  /** `08:00 – 18:00` per window, by start; none on days without a schedule. */
  ranges: string[];
  /** The row's days have no window ("Sin horario"). */
  empty: boolean;
}

export type LiveState = "online" | "off-hours" | "offline";

export interface LiveAvailability {
  state: LiveState;
  label: string;
}

interface Window {
  start: string;
  end: string;
}

const shortDay = (dia: number) => WEEK_DAYS.find((day) => day.dia === dia)?.short ?? "?";

/**
 * Each day's windows as `HH:mm`, by start. Hours that do not read as a time are left out:
 * the API never sends them, and one would break every text comparison below.
 */
function windowsByDay(franjas: readonly FranjaDto[]): Map<number, Window[]> {
  const byDay = new Map<number, Window[]>();
  for (const { dia_semana, hora_inicio, hora_fin } of franjas) {
    const start = toHHmm(hora_inicio);
    const end = toHHmm(hora_fin);
    if (start === null || end === null) continue;
    byDay.set(dia_semana, [...(byDay.get(dia_semana) ?? []), { start, end }]);
  }
  for (const windows of byDay.values()) windows.sort((a, b) => a.start.localeCompare(b.start));
  return byDay;
}

const sameRanges = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((range, i) => range === b[i]);

/**
 * The week from Monday to Sunday in rows: consecutive days whose whole list of windows is
 * identical share a row, days without windows too ("Sin horario"). Sunday never folds into
 * Monday, so the rows read in the order of the week. No window at all → no rows.
 */
export function groupFranjas(franjas: readonly FranjaDto[]): AvailabilityBlock[] {
  const byDay = windowsByDay(franjas);
  const rows: { days: number[]; ranges: string[] }[] = [];
  for (const { dia } of WEEK_DAYS) {
    const ranges = (byDay.get(dia) ?? []).map(({ start, end }) => `${start} – ${end}`);
    const last = rows.at(-1);
    if (last && sameRanges(last.ranges, ranges)) last.days.push(dia);
    else rows.push({ days: [dia], ranges });
  }
  if (rows.every(({ ranges }) => ranges.length === 0)) return [];
  return rows.map(({ days, ranges }) => {
    const first = shortDay(days[0]);
    return {
      days,
      label: days.length > 1 ? `${first} – ${shortDay(days[days.length - 1])}` : first,
      ranges,
      empty: ranges.length === 0,
    };
  });
}

/** A window ending at 23:59 runs to the end of the day, so its last minute still counts. */
const covers = ({ start, end }: Window, time: string) =>
  start <= time && (time < end || (end === END_OF_DAY && time === END_OF_DAY));

/**
 * The badge of the profile: "No disponible" with the toggle off; with it on, online until
 * the current window ends (back-to-back windows read as one), otherwise off hours with the
 * next start within a week ("hoy", "mañana" or the weekday).
 *
 * @param now Epoch milliseconds; the windows are read in Bogotá time.
 */
export function liveAvailability({
  disponible,
  franjas,
  now,
}: {
  disponible: boolean;
  franjas: readonly FranjaDto[];
  now: number;
}): LiveAvailability {
  if (!disponible) return { state: "offline", label: "No disponible" };
  const byDay = windowsByDay(franjas);
  const { dia, time } = bogotaWeekdayAndTime(now);
  const today = byDay.get(dia) ?? [];

  const current = today.find((window) => covers(window, time));
  if (current) {
    let end = current.end;
    for (const next of today) if (next.start === end && next.end > end) end = next.end;
    return { state: "online", label: `En línea · hasta ${end}` };
  }

  const later = today.find(({ start }) => start > time);
  if (later) return { state: "off-hours", label: `Fuera de horario · vuelve hoy ${later.start}` };
  for (let ahead = 1; ahead <= 7; ahead++) {
    const day = (dia + ahead) % 7;
    const [first] = byDay.get(day) ?? [];
    if (!first) continue;
    const when = ahead === 1 ? "mañana" : shortDay(day);
    return { state: "off-hours", label: `Fuera de horario · vuelve ${when} ${first.start}` };
  }
  return { state: "off-hours", label: "Fuera de horario" };
}
