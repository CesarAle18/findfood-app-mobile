import { relativeTime } from "./relative-time";

const NOW = Date.parse("2026-10-13T15:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it.each<[string, string, string | null]>([
    ["under a minute", ago(30_000), "Ahora"],
    ["a clock slightly ahead", ago(-5_000), "Ahora"],
    ["minutes", ago(5 * MIN), "Hace 5 min"],
    ["hours", ago(3 * HOUR + 10 * MIN), "Hace 3 h"],
    ["yesterday", ago(30 * HOUR), "Ayer"],
    ["days", ago(4 * DAY), "Hace 4 días"],
    // A week or more: the Bogotá calendar date (UTC−5).
    ["older", "2026-09-01T03:00:00Z", "31/08/2026"],
    ["unreadable", "ayer", null],
  ])("%s", (_name, iso, expected) => {
    expect(relativeTime(iso, NOW)).toBe(expected);
  });
});
