import { fireEvent, render, screen } from "@testing-library/react-native";

import { DateTimeField } from "../date-time-field";

// 16/10/2026 10:00 in Bogotá (UTC-5).
const NOW = Date.UTC(2026, 9, 16, 15, 0);

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openCalendar(props: Partial<Parameters<typeof DateTimeField>[0]> = {}) {
  const onChange = jest.fn();
  await render(
    <DateTimeField label="Fecha de vencimiento" value="" onChange={onChange} {...props} />,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Fecha de vencimiento: Seleccionar" }),
  );
  return onChange;
}

describe("DateTimeField (date)", () => {
  it("marks today in the calendar", async () => {
    await openCalendar();

    expect(screen.getByRole("button", { name: "16/10/2026, hoy" })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "15/10/2026" })).toBeOnTheScreen();
  });

  it("blocks the days before today with disablePast", async () => {
    const onChange = await openCalendar({ disablePast: true });

    const yesterday = screen.getByRole("button", { name: "15/10/2026" });
    expect(yesterday).toBeDisabled();
    await fireEvent.press(yesterday);
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "16/10/2026, hoy" }));
    expect(onChange).toHaveBeenCalledWith("16/10/2026");
  });

  it("does not go back before the current month with disablePast", async () => {
    await openCalendar({ disablePast: true });

    expect(screen.getByRole("button", { name: "Mes anterior" })).toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(screen.getByRole("button", { name: "01/11/2026" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Mes anterior" })).toBeEnabled();
  });

  it("keeps past days selectable without disablePast", async () => {
    const onChange = await openCalendar();

    await fireEvent.press(screen.getByRole("button", { name: "15/10/2026" }));
    expect(onChange).toHaveBeenCalledWith("15/10/2026");
  });
});
