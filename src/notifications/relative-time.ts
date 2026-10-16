/**
 * How long ago a notification arrived, in short Spanish copy. Built by hand instead of
 * `Intl.RelativeTimeFormat` (not available in every Hermes build); older dates reuse the
 * Bogotá calendar formatting of the date mappers.
 */
import { fromIsoToBogota } from "@/domain/mappers/dates";
import { MappingError } from "@/domain/mappers/errors";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** "Ahora", "Hace 5 min", "Hace 3 h", "Ayer", "Hace 4 días" or `DD/MM/AAAA`; null when unreadable. */
export function relativeTime(iso: string, now: number): string | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "Ahora";
  if (elapsed < HOUR) return `Hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `Hace ${Math.floor(elapsed / HOUR)} h`;
  if (elapsed < 2 * DAY) return "Ayer";
  if (elapsed < WEEK) return `Hace ${Math.floor(elapsed / DAY)} días`;
  try {
    return fromIsoToBogota(iso).date;
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return null;
  }
}
