import { render, screen } from "@testing-library/react-native";
import { useReducedMotion, withRepeat } from "react-native-reanimated";

import { toneColor } from "@/domain/mappers/statuses";

import { LiveStatusBadge } from "./live-status-badge";

// Only the pulse's entry points are watched; the rest of Reanimated stays real.
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    useReducedMotion: jest.fn(() => false),
    withRepeat: jest.fn(actual.withRepeat),
  };
});

const mockedReducedMotion = jest.mocked(useReducedMotion);
const mockedRepeat = jest.mocked(withRepeat);

beforeEach(() => {
  mockedReducedMotion.mockReturnValue(false);
  mockedRepeat.mockClear();
});

describe("LiveStatusBadge", () => {
  it("announces the whole status as one polite live text", async () => {
    await render(<LiveStatusBadge state="online" label="En línea · hasta 18:00" />);

    const badge = screen.getByLabelText("En línea · hasta 18:00");
    expect(badge).toHaveProp("accessibilityRole", "text");
    expect(badge).toHaveProp("accessibilityLiveRegion", "polite");
    expect(screen.getByText("En línea · hasta 18:00")).toBeOnTheScreen();
  });

  it.each([
    ["online", "En línea · hasta 18:00", "primary"],
    ["off-hours", "Fuera de horario · vuelve mañana 08:00", "warning"],
    ["offline", "No disponible", "neutral"],
  ] as const)("colors the %s state with the %s tone", async (state, label, tone) => {
    await render(<LiveStatusBadge state={state} label={label} />);

    expect(screen.getByLabelText(label)).toHaveStyle({ backgroundColor: toneColor(tone).background });
    expect(screen.getByText(label)).toHaveStyle({ color: toneColor(tone).text });
  });

  it("pulses the dot only while online", async () => {
    await render(<LiveStatusBadge state="online" label="En línea · hasta 18:00" />);
    expect(mockedRepeat).toHaveBeenCalled();

    mockedRepeat.mockClear();
    await render(<LiveStatusBadge state="off-hours" label="Fuera de horario" />);
    await render(<LiveStatusBadge state="offline" label="No disponible" />);
    expect(mockedRepeat).not.toHaveBeenCalled();
  });

  it("keeps the dot still under the system reduce-motion setting", async () => {
    mockedReducedMotion.mockReturnValue(true);

    await render(<LiveStatusBadge state="online" label="En línea · hasta 18:00" />);

    expect(mockedRepeat).not.toHaveBeenCalled();
  });
});
