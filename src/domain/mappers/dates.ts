/**
 * Dates and times between the app's formats (`DD/MM/AAAA` and 24 h `HH:mm`, always in
 * Bogotá wall-clock time) and findfood-api.
 *
 * Bogotá is UTC−05:00 all year (no DST), so conversions are plain arithmetic on the epoch:
 * nothing here reads the device time zone (no local-time getters, no `Date.parse`, no Intl
 * time zones, whose support varies on Hermes). Only `Date.UTC` and the `getUTC*` getters
 * are used, and no Intl formatter is needed (labels are numeric or fixed Spanish words).
 */
import type { CrearDonacionBody } from "@/services/donaciones";

import { MappingError } from "./errors";

export interface CalendarDate {
  year: number;
  /** 1 (January) to 12. */
  month: number;
  day: number;
}

export interface WallTime {
  hour: number;
  minute: number;
}

const BOGOTA_OFFSET = "-05:00";
const BOGOTA_OFFSET_MS = -5 * 60 * 60 * 1000;
/** Earlier years are typos; this also keeps `Date.UTC` away from its 0–99 → 19xx mapping. */
const MIN_YEAR = 1900;

const DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const API_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** ISO 8601 with a mandatory offset: without one it would be read in the device zone. */
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const pad2 = (value: number) => String(value).padStart(2, "0");

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

function isValidDate({ year, month, day }: CalendarDate): boolean {
  return (
    year >= MIN_YEAR &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  );
}

function isValidTime({ hour, minute }: WallTime): boolean {
  return hour <= 23 && minute <= 59;
}

function sameDate(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** The following calendar day, rolling over month and year ends. */
function nextDay({ year, month, day }: CalendarDate): CalendarDate {
  if (day < daysInMonth(year, month)) return { year, month, day: day + 1 };
  if (month < 12) return { year, month: month + 1, day: 1 };
  return { year: year + 1, month: 1, day: 1 };
}

function invalidDate(value: unknown): MappingError {
  return new MappingError("invalid-date", value, `Invalid date: ${String(value)}`);
}

function invalidTimestamp(value: unknown): MappingError {
  return new MappingError("invalid-timestamp", value, `Invalid timestamp: ${String(value)}`);
}

// --- Display formats ----------------------------------------------------------------------

/** Parses `DD/MM/AAAA` (as the date picker writes it). */
export function parseDate(value: string): CalendarDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw invalidDate(value);
  const date = { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
  if (!isValidDate(date)) throw invalidDate(value);
  return date;
}

export function formatDate({ year, month, day }: CalendarDate): string {
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

/** Parses a 24 h `HH:mm` (as the time picker writes it). */
export function parseTime(value: string): WallTime {
  const match = TIME_PATTERN.exec(value);
  const time = match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
  if (!time || !isValidTime(time)) {
    throw new MappingError("invalid-time", value, `Invalid time: ${value}`);
  }
  return time;
}

export function formatTime({ hour, minute }: WallTime): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

// --- Timestamps ---------------------------------------------------------------------------

function toApiDate({ year, month, day }: CalendarDate): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function bogotaIso(date: CalendarDate, time: WallTime): string {
  return `${toApiDate(date)}T${formatTime(time)}:00${BOGOTA_OFFSET}`;
}

/** Minutes east of UTC of `Z` or `±HH:mm`, or null when out of range. */
function offsetMinutes(offset: string): number | null {
  if (offset === "Z") return 0;
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(4, 6));
  if (hours > 23 || minutes > 59) return null;
  return (offset[0] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

/** Epoch milliseconds of an ISO 8601 timestamp with offset, parsed by hand. */
function parseTimestamp(iso: string): number {
  const match = TIMESTAMP_PATTERN.exec(iso);
  if (!match) throw invalidTimestamp(iso);
  const [, year, month, day, hour, minute, second = "0", fraction = "", offset] = match;
  const date = { year: Number(year), month: Number(month), day: Number(day) };
  const time = { hour: Number(hour), minute: Number(minute) };
  const offsetMin = offsetMinutes(offset);
  if (!isValidDate(date) || !isValidTime(time) || Number(second) > 59 || offsetMin === null) {
    throw invalidTimestamp(iso);
  }
  const millis = Number(fraction.padEnd(3, "0").slice(0, 3));
  const utc = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    time.hour,
    time.minute,
    Number(second),
    millis,
  );
  return utc - offsetMin * 60 * 1000;
}

/** Bogotá wall-clock date and time of an instant: shift by −5 h, then read UTC fields. */
function bogotaParts(epochMs: number): { date: CalendarDate; time: WallTime } {
  const shifted = new Date(epochMs + BOGOTA_OFFSET_MS);
  return {
    date: {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
    },
    time: { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() },
  };
}

/** `DD/MM/AAAA` + `HH:mm` in Bogotá → `YYYY-MM-DDTHH:mm:00-05:00`. */
export function toBogotaIso(date: string, time: string): string {
  return bogotaIso(parseDate(date), parseTime(time));
}

/** Any ISO timestamp with offset (the API answers in UTC) → Bogotá `date` and `time`. */
export function fromIsoToBogota(iso: string): { date: string; time: string } {
  const { date, time } = bogotaParts(parseTimestamp(iso));
  return { date: formatDate(date), time: formatTime(time) };
}

// --- Pickup window ------------------------------------------------------------------------

export interface PickupWindowInput {
  /** `DD/MM/AAAA` of the start. */
  date: string;
  /** `HH:mm`. */
  start: string;
  /** `HH:mm`; at or before `start` means the window ends the next day. */
  end: string;
}

export type PickupWindowBody = Pick<
  CrearDonacionBody,
  "ventana_recogida_inicio" | "ventana_recogida_fin"
>;

export interface PickupWindowView extends PickupWindowInput {
  /** `DD/MM/AAAA` of the end: the next day when the window crosses midnight. */
  endDate: string;
  crossesMidnight: boolean;
  /** e.g. `Hoy · 16:00–18:00`, or `31/12/2026 · 22:00 – 01/01/2027 · 02:00`. */
  display: string;
}

export function toPickupWindow({ date, start, end }: PickupWindowInput): PickupWindowBody {
  const day = parseDate(date);
  const from = parseTime(start);
  const until = parseTime(end);
  const crossesMidnight = until.hour * 60 + until.minute <= from.hour * 60 + from.minute;
  return {
    ventana_recogida_inicio: bogotaIso(day, from),
    ventana_recogida_fin: bogotaIso(crossesMidnight ? nextDay(day) : day, until),
  };
}

/** Names today and tomorrow (in Bogotá) when `now` is given; other days by their date. */
function dayLabeler(now: number | undefined): (date: CalendarDate) => string {
  if (now === undefined) return formatDate;
  const today = bogotaParts(now).date;
  const tomorrow = nextDay(today);
  return (date) =>
    sameDate(date, today) ? "Hoy" : sameDate(date, tomorrow) ? "Mañana" : formatDate(date);
}

/**
 * The window bounds of a donation (UTC from the API) in Bogotá time, plus a display line.
 *
 * @param now Epoch milliseconds; when given, today and tomorrow read "Hoy" and "Mañana".
 */
export function fromPickupWindow(inicio: string, fin: string, now?: number): PickupWindowView {
  const startMs = parseTimestamp(inicio);
  const endMs = parseTimestamp(fin);
  if (endMs <= startMs) {
    throw new MappingError(
      "invalid-window",
      { inicio, fin },
      `Pickup window ends at or before its start: ${inicio} – ${fin}`,
    );
  }
  const from = bogotaParts(startMs);
  const until = bogotaParts(endMs);
  const crossesMidnight = !sameDate(from.date, until.date);
  const start = formatTime(from.time);
  const end = formatTime(until.time);
  const label = dayLabeler(now);
  return {
    date: formatDate(from.date),
    start,
    end,
    endDate: formatDate(until.date),
    crossesMidnight,
    display: crossesMidnight
      ? `${label(from.date)} · ${start} – ${label(until.date)} · ${end}`
      : `${label(from.date)} · ${start}–${end}`,
  };
}

// --- Expiry date --------------------------------------------------------------------------

/** `DD/MM/AAAA` → the `YYYY-MM-DD` the API expects in `fecha_vencimiento`. */
export function toFechaVencimiento(value: string): string {
  return toApiDate(parseDate(value));
}

/**
 * A `fecha_vencimiento` from the API (`YYYY-MM-DDT00:00:00.000Z`) → `DD/MM/AAAA`.
 *
 * It is a calendar date: only its first 10 characters are read. Converting it to Bogotá
 * would move it to the previous day.
 */
export function fromFechaVencimiento(apiValue: string): string {
  const match = API_DATE_PATTERN.exec(apiValue.slice(0, 10));
  if (!match) throw invalidDate(apiValue);
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (!isValidDate(date)) throw invalidDate(apiValue);
  return formatDate(date);
}
