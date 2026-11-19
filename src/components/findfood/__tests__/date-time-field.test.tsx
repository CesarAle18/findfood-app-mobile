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

describe("DateTimeField (date) with maxDate", () => {
  it("opens an empty value on maxDate's month", async () => {
    await openCalendar({ maxDate: "16/10/2008" });

    expect(
      screen.getByRole("button", { name: "Elegir año, Octubre 2008" }),
    ).toBeOnTheScreen();
  });

  it("blocks the days after maxDate and the months past it", async () => {
    const onChange = await openCalendar({ maxDate: "16/10/2008" });

    const tooLate = screen.getByRole("button", { name: "17/10/2008" });
    expect(tooLate).toBeDisabled();
    await fireEvent.press(tooLate);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mes anterior" })).toBeEnabled();

    await fireEvent.press(screen.getByRole("button", { name: "16/10/2008" }));
    expect(onChange).toHaveBeenCalledWith("16/10/2008");
  });

  it("jumps to a chosen year, within maxDate and 1900", async () => {
    const onChange = await openCalendar({ maxDate: "16/10/2008" });

    await fireEvent.press(
      screen.getByRole("button", { name: "Elegir año, Octubre 2008" }),
    );
    expect(screen.getByRole("button", { name: "1900" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "1899" })).toBeNull();
    expect(screen.queryByRole("button", { name: "2009" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "1995" }));

    expect(
      screen.getByRole("button", { name: "Elegir año, Octubre 1995" }),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Mes siguiente" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "12/10/1995" }));
    expect(onChange).toHaveBeenCalledWith("12/10/1995");
  });

  it("clamps the month of a chosen year to maxDate", async () => {
    await render(
      <DateTimeField
        label="Fecha de nacimiento"
        value="12/12/1995"
        onChange={jest.fn()}
        maxDate="16/10/2008"
      />,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Fecha de nacimiento: 12/12/1995" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Elegir año, Diciembre 1995" }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "2008" }));

    expect(
      screen.getByRole("button", { name: "Elegir año, Octubre 2008" }),
    ).toBeOnTheScreen();
  });

  it("shows the hint below the field", async () => {
    await render(
      <DateTimeField
        label="Fecha de nacimiento"
        value=""
        onChange={jest.fn()}
        hint="Debes tener al menos 18 años."
      />,
    );

    expect(screen.getByText("Debes tener al menos 18 años.")).toBeOnTheScreen();
  });
});

describe("DateTimeField (date) year list with disablePast", () => {
  it("starts the years at the current one", async () => {
    await openCalendar({ disablePast: true });

    await fireEvent.press(
      screen.getByRole("button", { name: "Elegir año, Octubre 2026" }),
    );
    expect(screen.queryByRole("button", { name: "2025" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "2027" }));

    expect(
      screen.getByRole("button", { name: "Elegir año, Octubre 2027" }),
    ).toBeOnTheScreen();
  });
});
