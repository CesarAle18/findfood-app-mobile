import {
  formatDate,
  formatTime,
  fromFechaVencimiento,
  fromIsoToBogota,
  fromPickupWindow,
  parseDate,
  parseTime,
  toBogotaIso,
  toFechaVencimiento,
  toPickupWindow,
} from "./dates";
import { errorCode } from "@/test-utils/mapping";

import { MappingError } from "./errors";

/** Epoch of a Bogotá wall-clock instant (UTC−05:00), for `now`. */
const bogota = (year: number, month: number, day: number, hour: number, minute = 0) =>
  Date.UTC(year, month - 1, day, hour + 5, minute);

describe("MappingError", () => {
  it("is an Error with a stable code and the rejected value", () => {
    let caught: unknown;
    try {
      parseDate("31/02/2026");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MappingError);
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({
      name: "MappingError",
      code: "invalid-date",
      value: "31/02/2026",
    });
  });
});

describe("parseDate / formatDate", () => {
  it.each([
    ["07/09/2026", { year: 2026, month: 9, day: 7 }],
    ["01/01/2026", { year: 2026, month: 1, day: 1 }],
    ["31/12/2026", { year: 2026, month: 12, day: 31 }],
    ["29/02/2028", { year: 2028, month: 2, day: 29 }],
    ["29/02/2000", { year: 2000, month: 2, day: 29 }],
  ])("parses %s", (value, expected) => {
    expect(parseDate(value)).toEqual(expected);
  });

  it.each([
    ["29/02/2026", "Feb 29 on a non-leap year"],
    ["29/02/2100", "Feb 29 on a century that is not a leap year"],
    ["31/04/2026", "day 31 of a 30-day month"],
    ["32/01/2026", "day 32"],
    ["00/01/2026", "day 0"],
    ["01/13/2026", "month 13"],
    ["01/00/2026", "month 0"],
    ["7/9/2026", "unpadded parts"],
    ["2026-09-07", "ISO order"],
    [" 07/09/2026", "surrounding spaces"],
    ["07/09/26", "two-digit year"],
    ["07/09/1899", "a year before 1900"],
    ["", "an empty value"],
  ])("rejects %s (%s)", (value) => {
    expect(errorCode(() => parseDate(value))).toBe("invalid-date");
  });

  it("formats with zero padding", () => {
    expect(formatDate({ year: 2026, month: 9, day: 7 })).toBe("07/09/2026");
  });
});

describe("parseTime / formatTime", () => {
  it.each([
    ["00:00", { hour: 0, minute: 0 }],
    ["09:05", { hour: 9, minute: 5 }],
    ["23:59", { hour: 23, minute: 59 }],
  ])("parses %s", (value, expected) => {
    expect(parseTime(value)).toEqual(expected);
  });

  it.each(["24:00", "12:60", "9:00", "12:5", "ab:cd", "12h00", "12:00:00", ""])(
    "rejects %p",
    (value) => {
      expect(errorCode(() => parseTime(value))).toBe("invalid-time");
    },
  );

  it("formats in 24 h with zero padding", () => {
    expect(formatTime({ hour: 7, minute: 5 })).toBe("07:05");
  });
});

describe("toBogotaIso / fromIsoToBogota", () => {
  it("builds an ISO string with the fixed Bogotá offset", () => {
    expect(toBogotaIso("23/09/2026", "14:00")).toBe("2026-09-23T14:00:00-05:00");
  });

  it("validates the date and the time", () => {
    expect(errorCode(() => toBogotaIso("30/02/2026", "14:00"))).toBe("invalid-date");
    expect(errorCode(() => toBogotaIso("23/09/2026", "24:00"))).toBe("invalid-time");
  });

  it.each([
    ["2026-09-23T19:00:00.000Z", { date: "23/09/2026", time: "14:00" }],
    // Still the previous day in Bogotá although UTC is already on the next one.
    ["2026-09-24T03:30:00.000Z", { date: "23/09/2026", time: "22:30" }],
    ["2027-01-01T04:59:00.000Z", { date: "31/12/2026", time: "23:59" }],
    ["2026-03-01T04:00:00.000Z", { date: "28/02/2026", time: "23:00" }],
    ["2026-09-23T14:00:00-05:00", { date: "23/09/2026", time: "14:00" }],
    ["2026-09-23T21:00:00+02:00", { date: "23/09/2026", time: "14:00" }],
    ["2026-09-23T19:00Z", { date: "23/09/2026", time: "14:00" }],
    // Seconds are dropped, never rounded up.
    ["2026-09-23T19:00:59.999Z", { date: "23/09/2026", time: "14:00" }],
  ])("reads %s in Bogotá wall-clock time", (iso, expected) => {
    expect(fromIsoToBogota(iso)).toEqual(expected);
  });

  it("round-trips what it builds", () => {
    expect(fromIsoToBogota(toBogotaIso("31/12/2026", "23:45"))).toEqual({
      date: "31/12/2026",
      time: "23:45",
    });
  });

  it.each([
    ["2026-09-23T14:00:00", "no offset (it would be read in the device zone)"],
    ["2026-13-01T00:00:00.000Z", "month 13"],
    ["2026-02-30T00:00:00.000Z", "Feb 30"],
    ["2026-09-23T24:00:00.000Z", "hour 24"],
    ["23/09/2026 14:00", "display format"],
    ["", "an empty value"],
  ])("rejects %s (%s)", (iso) => {
    expect(errorCode(() => fromIsoToBogota(iso))).toBe("invalid-timestamp");
  });
});

describe("toPickupWindow", () => {
  it("keeps a window inside one day on that day", () => {
    expect(toPickupWindow({ date: "23/09/2026", start: "14:00", end: "16:00" })).toEqual({
      ventana_recogida_inicio: "2026-09-23T14:00:00-05:00",
      ventana_recogida_fin: "2026-09-23T16:00:00-05:00",
    });
  });

  it.each([
    ["23/09/2026", "2026-09-23", "2026-09-24", "the same month"],
    ["30/09/2026", "2026-09-30", "2026-10-01", "a month end"],
    ["28/02/2026", "2026-02-28", "2026-03-01", "February of a common year"],
    ["28/02/2028", "2028-02-28", "2028-02-29", "February of a leap year"],
    ["31/12/2026", "2026-12-31", "2027-01-01", "the year end"],
  ])("moves the end of a window crossing midnight to the next day (%s, %s)", (date, startDay, endDay) => {
    expect(toPickupWindow({ date, start: "22:00", end: "02:00" })).toEqual({
      ventana_recogida_inicio: `${startDay}T22:00:00-05:00`,
      ventana_recogida_fin: `${endDay}T02:00:00-05:00`,
    });
  });

  it("treats an end equal to the start as the next day", () => {
    expect(toPickupWindow({ date: "23/09/2026", start: "09:00", end: "09:00" })).toEqual({
      ventana_recogida_inicio: "2026-09-23T09:00:00-05:00",
      ventana_recogida_fin: "2026-09-24T09:00:00-05:00",
    });
  });

  it("validates every part", () => {
    expect(errorCode(() => toPickupWindow({ date: "", start: "14:00", end: "16:00" }))).toBe(
      "invalid-date",
    );
    expect(
      errorCode(() => toPickupWindow({ date: "23/09/2026", start: "14:00", end: "4pm" })),
    ).toBe("invalid-time");
  });
});

describe("fromPickupWindow", () => {
  it("reads a window the API returns in UTC", () => {
    expect(fromPickupWindow("2026-09-23T19:00:00.000Z", "2026-09-23T21:00:00.000Z")).toEqual({
      date: "23/09/2026",
      start: "14:00",
      end: "16:00",
      endDate: "23/09/2026",
      crossesMidnight: false,
      display: "23/09/2026 · 14:00–16:00",
    });
  });

  it("keeps a Bogotá-day window on one day although it spans two UTC days", () => {
    const window = fromPickupWindow("2026-09-23T23:00:00.000Z", "2026-09-24T01:00:00.000Z");

    expect(window.crossesMidnight).toBe(false);
    expect(window.display).toBe("23/09/2026 · 18:00–20:00");
  });

  it("shows the end day of a window that crosses midnight", () => {
    expect(fromPickupWindow("2027-01-01T03:00:00.000Z", "2027-01-01T07:00:00.000Z")).toEqual({
      date: "31/12/2026",
      start: "22:00",
      end: "02:00",
      endDate: "01/01/2027",
      crossesMidnight: true,
      display: "31/12/2026 · 22:00 – 01/01/2027 · 02:00",
    });
  });

  it("is the inverse of toPickupWindow", () => {
    const input = { date: "31/12/2026", start: "22:00", end: "02:00" };
    const { ventana_recogida_inicio, ventana_recogida_fin } = toPickupWindow(input);

    expect(fromPickupWindow(ventana_recogida_inicio, ventana_recogida_fin)).toMatchObject(input);
  });

  describe("with the current time", () => {
    const inicio = "2026-09-23T19:00:00.000Z";
    const fin = "2026-09-23T21:00:00.000Z";

    it("labels a window of today", () => {
      expect(fromPickupWindow(inicio, fin, bogota(2026, 9, 23, 8)).display).toBe(
        "Hoy · 14:00–16:00",
      );
    });

    it("uses the Bogotá day of `now`, not the UTC one", () => {
      // 23:30 in Bogotá is already 04:30 of the 24th in UTC.
      expect(fromPickupWindow(inicio, fin, bogota(2026, 9, 23, 23, 30)).display).toBe(
        "Hoy · 14:00–16:00",
      );
    });

    it("labels a window of tomorrow", () => {
      expect(fromPickupWindow(inicio, fin, bogota(2026, 9, 22, 20)).display).toBe(
        "Mañana · 14:00–16:00",
      );
    });

    it("labels tomorrow across a year end", () => {
      expect(
        fromPickupWindow(
          "2027-01-01T14:00:00.000Z",
          "2027-01-01T16:00:00.000Z",
          bogota(2026, 12, 31, 10),
        ).display,
      ).toBe("Mañana · 09:00–11:00");
    });

    it("labels both days of a window crossing midnight", () => {
      expect(
        fromPickupWindow(
          "2026-09-24T03:00:00.000Z",
          "2026-09-24T07:00:00.000Z",
          bogota(2026, 9, 23, 8),
        ).display,
      ).toBe("Hoy · 22:00 – Mañana · 02:00");
    });

    it("shows the date of any other day", () => {
      expect(fromPickupWindow(inicio, fin, bogota(2026, 9, 25, 8)).display).toBe(
        "23/09/2026 · 14:00–16:00",
      );
    });
  });

  it.each([
    ["2026-09-23T21:00:00.000Z", "2026-09-23T19:00:00.000Z", "an end before the start"],
    ["2026-09-23T19:00:00.000Z", "2026-09-23T19:00:00.000Z", "an empty window"],
  ])("rejects %s → %s (%s)", (inicio, fin) => {
    expect(errorCode(() => fromPickupWindow(inicio, fin))).toBe("invalid-window");
  });

  it("rejects a malformed bound", () => {
    expect(errorCode(() => fromPickupWindow("2026-09-23T19:00:00", "2026-09-23T21:00:00Z"))).toBe(
      "invalid-timestamp",
    );
  });
});

describe("toFechaVencimiento / fromFechaVencimiento", () => {
  it("sends a calendar date as YYYY-MM-DD", () => {
    expect(toFechaVencimiento("07/09/2026")).toBe("2026-09-07");
  });

  it("validates the date it sends", () => {
    expect(errorCode(() => toFechaVencimiento("31/04/2026"))).toBe("invalid-date");
  });

  it.each([
    // Converted to Bogotá, midnight UTC would fall on the previous day.
    ["2026-09-07T00:00:00.000Z", "07/09/2026"],
    ["2026-01-01T00:00:00.000Z", "01/01/2026"],
    ["2026-03-01T00:00:00.000Z", "01/03/2026"],
    ["2026-12-31T00:00:00.000Z", "31/12/2026"],
    ["2026-09-07", "07/09/2026"],
    ["2026-09-07T00:00:00Z", "07/09/2026"],
  ])("keeps the calendar date of %s", (apiValue, expected) => {
    expect(fromFechaVencimiento(apiValue)).toBe(expected);
  });

  it("round-trips through the API format", () => {
    expect(fromFechaVencimiento(`${toFechaVencimiento("29/02/2028")}T00:00:00.000Z`)).toBe(
      "29/02/2028",
    );
  });

  it.each([
    "07/09/2026",
    "2026-02-30T00:00:00.000Z",
    "2026-9-7",
    "",
    // Only a bare date or midnight UTC: anything else after the date is not a calendar date.
    "2026-09-07garbage",
    "2026-09-07T",
    "2026-09-07T12:00:00.000Z",
    "2026-09-07T00:00:00.000-05:00",
    "2026-09-07T00:00:00.0Z",
    "2026-09-07 00:00:00",
  ])("rejects %p", (apiValue) => {
    expect(errorCode(() => fromFechaVencimiento(apiValue))).toBe("invalid-date");
  });
});

describe("device time zone independence", () => {
  const localGetters = [
    "getFullYear",
    "getMonth",
    "getDate",
    "getDay",
    "getHours",
    "getMinutes",
    "getTimezoneOffset",
  ] as const;

  beforeEach(() => {
    for (const getter of localGetters) {
      jest.spyOn(Date.prototype, getter).mockImplementation(() => {
        throw new Error(`Date.prototype.${getter} depends on the device time zone`);
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("never reads local-time fields", () => {
    const window = toPickupWindow({ date: "31/12/2026", start: "22:00", end: "02:00" });

    expect(
      fromPickupWindow(
        window.ventana_recogida_inicio,
        window.ventana_recogida_fin,
        bogota(2026, 12, 31, 8),
      ).display,
    ).toBe("Hoy · 22:00 – Mañana · 02:00");
    expect(fromIsoToBogota("2026-09-24T03:30:00.000Z")).toEqual({
      date: "23/09/2026",
      time: "22:30",
    });
    expect(fromFechaVencimiento("2026-09-07T00:00:00.000Z")).toBe("07/09/2026");
  });
});
