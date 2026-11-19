import { render, screen } from "@testing-library/react-native";

import type { FranjaDto } from "@/api/types";
import { colors } from "@/design/tokens";

import { AvailabilitySchedule } from "./availability-schedule";

const franja = (dia_semana: number, hora_inicio: string, hora_fin: string): FranjaDto => ({
  dia_semana,
  hora_inicio,
  hora_fin,
});

/** Mon–Wed 08–18 (with the API's seconds), Thu–Fri 08–20, Sat 09–14, nothing on Sunday. */
const WEEK = [
  ...[1, 2, 3].map((dia) => franja(dia, "08:00:00", "18:00:00")),
  franja(4, "08:00", "20:00"),
  franja(5, "08:00", "20:00"),
  franja(6, "09:00", "14:00"),
];

/** Thursday 19/11/2026, 10:00 in Bogotá. */
const THURSDAY = Date.UTC(2026, 10, 19, 15, 0);

describe("AvailabilitySchedule", () => {
  it("shows one row per group of days with the same hours", async () => {
    await render(<AvailabilitySchedule franjas={WEEK} now={THURSDAY} />);

    expect(screen.getByText("Lun – Mié")).toBeOnTheScreen();
    expect(screen.getByText("08:00 – 18:00")).toBeOnTheScreen();
    expect(screen.getByText("Jue – Vie")).toBeOnTheScreen();
    expect(screen.getByText("08:00 – 20:00")).toBeOnTheScreen();
    expect(screen.getByText("Sáb")).toBeOnTheScreen();
    expect(screen.getByText("09:00 – 14:00")).toBeOnTheScreen();
    expect(screen.getByText("Dom")).toBeOnTheScreen();
    expect(screen.getByText("Sin horario")).toBeOnTheScreen();
    expect(screen.getByLabelText("Dom: Sin horario")).toBeOnTheScreen();
  });

  it("stacks every window of a day", async () => {
    await render(
      <AvailabilitySchedule
        franjas={[franja(1, "08:00", "12:00"), franja(1, "14:00", "18:00")]}
        now={THURSDAY}
      />,
    );

    expect(screen.getByText("08:00 – 12:00")).toBeOnTheScreen();
    expect(screen.getByText("14:00 – 18:00")).toBeOnTheScreen();
    expect(screen.getByLabelText("Lun: 08:00 – 12:00, 14:00 – 18:00")).toBeOnTheScreen();
  });

  it("highlights the row of today and mutes the days without a schedule", async () => {
    await render(<AvailabilitySchedule franjas={WEEK} now={THURSDAY} />);

    expect(screen.getByText("Jue – Vie")).toHaveStyle({ color: colors.primary });
    expect(screen.getByText("08:00 – 20:00")).toHaveStyle({ color: colors.primary });
    expect(screen.getByLabelText("Jue – Vie: 08:00 – 20:00, hoy")).toBeOnTheScreen();
    expect(screen.getByText("Lun – Mié")).toHaveStyle({ color: colors.text });
    expect(screen.getByText("Sin horario")).toHaveStyle({ color: colors.secondary });
  });

  it("says when there is no schedule at all", async () => {
    await render(<AvailabilitySchedule franjas={[]} now={THURSDAY} />);

    expect(screen.getByText("Sin horario registrado")).toBeOnTheScreen();
  });
});
