import type { FranjaDto } from "@/api/types";

import { groupFranjas, liveAvailability } from "./availability-summary";

const franja = (dia_semana: number, hora_inicio: string, hora_fin: string): FranjaDto => ({
  dia_semana,
  hora_inicio,
  hora_fin,
});

/** The same window on several days. */
const days = (dias: number[], start: string, end: string) =>
  dias.map((dia) => franja(dia, start, end));

/** Epoch ms of a Bogotá wall-clock instant (UTC−05:00, no DST). 16/11/2026 is a Monday. */
const bogota = (year: number, month: number, day: number, hour: number, minute = 0) =>
  Date.UTC(year, month - 1, day, hour + 5, minute);

/** The mockup: Mon–Wed 08–18, Thu–Fri 08–20, Sat 09–14, nothing on Sunday. */
const MOCKUP = [
  ...days([1, 2, 3], "08:00", "18:00"),
  ...days([4, 5], "08:00", "20:00"),
  franja(6, "09:00", "14:00"),
];

describe("groupFranjas", () => {
  it("groups consecutive days with the same hours, Sunday without a schedule", () => {
    expect(groupFranjas(MOCKUP)).toEqual([
      { days: [1, 2, 3], label: "Lun – Mié", ranges: ["08:00 – 18:00"], empty: false },
      { days: [4, 5], label: "Jue – Vie", ranges: ["08:00 – 20:00"], empty: false },
      { days: [6], label: "Sáb", ranges: ["09:00 – 14:00"], empty: false },
      { days: [0], label: "Dom", ranges: [], empty: true },
    ]);
  });

  it("reads the whole week as one row when every day has the same hours", () => {
    expect(groupFranjas(days([0, 1, 2, 3, 4, 5, 6], "07:00", "15:00"))).toEqual([
      {
        days: [1, 2, 3, 4, 5, 6, 0],
        label: "Lun – Dom",
        ranges: ["07:00 – 15:00"],
        empty: false,
      },
    ]);
  });

  it("keeps equal days apart when another day sits between them", () => {
    const blocks = groupFranjas([
      franja(1, "08:00", "12:00"),
      franja(2, "14:00", "18:00"),
      franja(3, "08:00", "12:00"),
    ]);
    expect(blocks.map(({ label, ranges }) => [label, ranges])).toEqual([
      ["Lun", ["08:00 – 12:00"]],
      ["Mar", ["14:00 – 18:00"]],
      ["Mié", ["08:00 – 12:00"]],
      ["Jue – Dom", []],
    ]);
  });

  it("lists every window of a day by start and only merges identical lists", () => {
    const blocks = groupFranjas([
      franja(1, "14:00", "18:00"),
      franja(1, "08:00", "12:00"),
      franja(2, "08:00", "12:00"),
      franja(2, "14:00", "18:00"),
      franja(3, "08:00", "12:00"),
    ]);
    expect(blocks.slice(0, 2)).toEqual([
      {
        days: [1, 2],
        label: "Lun – Mar",
        ranges: ["08:00 – 12:00", "14:00 – 18:00"],
        empty: false,
      },
      { days: [3], label: "Mié", ranges: ["08:00 – 12:00"], empty: false },
    ]);
  });

  it("reads the API's seconds as HH:mm and groups on them", () => {
    expect(
      groupFranjas([franja(1, "08:00:00", "18:00:00"), franja(2, "8:00", "18:00")])[0],
    ).toEqual({ days: [1, 2], label: "Lun – Mar", ranges: ["08:00 – 18:00"], empty: false });
  });

  it("returns no rows without any window", () => {
    expect(groupFranjas([])).toEqual([]);
  });
});

describe("liveAvailability", () => {
  const live = (now: number, franjas: FranjaDto[] = MOCKUP, disponible = true) =>
    liveAvailability({ disponible, franjas, now });

  it("is online until the window's end while inside it", () => {
    // Wednesday 10:30.
    expect(live(bogota(2026, 11, 18, 10, 30))).toEqual({
      state: "online",
      label: "En línea · hasta 18:00",
    });
    // The first minute counts.
    expect(live(bogota(2026, 11, 18, 8, 0)).state).toBe("online");
  });

  it("is off hours exactly at the end, back the next day", () => {
    expect(live(bogota(2026, 11, 18, 18, 0))).toEqual({
      state: "off-hours",
      label: "Fuera de horario · vuelve mañana 08:00",
    });
  });

  it("comes back later today before the first window", () => {
    expect(live(bogota(2026, 11, 21, 7, 15))).toEqual({
      state: "off-hours",
      label: "Fuera de horario · vuelve hoy 09:00",
    });
  });

  it("comes back between two windows of the same day", () => {
    const split = [franja(1, "08:00", "12:00"), franja(1, "14:00", "18:00")];
    expect(live(bogota(2026, 11, 16, 12, 30), split).label).toBe(
      "Fuera de horario · vuelve hoy 14:00",
    );
  });

  it("names the weekday when the next window is several days ahead", () => {
    // Saturday after 14:00: nothing on Sunday, back on Monday.
    expect(live(bogota(2026, 11, 21, 15, 0)).label).toBe("Fuera de horario · vuelve Lun 08:00");
    // Only Thursdays: from Friday it is the next Thursday.
    expect(live(bogota(2026, 11, 20, 9, 0), [franja(4, "10:00", "12:00")]).label).toBe(
      "Fuera de horario · vuelve Jue 10:00",
    );
  });

  it("reports the end of back-to-back windows", () => {
    const chained = [
      franja(2, "13:00", "17:00"),
      franja(2, "08:00", "13:00"),
      franja(2, "17:00", "20:00"),
    ];
    expect(live(bogota(2026, 11, 17, 9, 0), chained).label).toBe("En línea · hasta 20:00");
  });

  it("counts the last minute of a window that runs to the end of the day", () => {
    expect(live(bogota(2026, 11, 16, 23, 59), [franja(1, "20:00", "23:59")]).label).toBe(
      "En línea · hasta 23:59",
    );
  });

  it("is off hours with nothing to come back to without windows", () => {
    expect(live(bogota(2026, 11, 18, 10, 0), [])).toEqual({
      state: "off-hours",
      label: "Fuera de horario",
    });
  });

  it("is offline when the volunteer turned availability off, even inside a window", () => {
    expect(live(bogota(2026, 11, 18, 10, 30), MOCKUP, false)).toEqual({
      state: "offline",
      label: "No disponible",
    });
  });
});
