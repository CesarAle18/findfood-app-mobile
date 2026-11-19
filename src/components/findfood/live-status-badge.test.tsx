import { act, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";
import { withRepeat } from "react-native-reanimated";

import { toneColor } from "@/domain/mappers/statuses";

import { LiveStatusBadge } from "./live-status-badge";

// Only the pulse's entry point is watched; the rest of Reanimated stays real.
jest.mock("react-native-reanimated", () => {
  const actual = jest.requireActual("react-native-reanimated");
  return {
    ...actual,
    __esModule: true,
    default: actual.default,
    withRepeat: jest.fn(actual.withRepeat),
  };
});

const mockedRepeat = jest.mocked(withRepeat);

/** Renders the badge and lets the reduce-motion answer arrive. */
async function renderBadge(element: React.ReactElement) {
  await render(element);
  await act(async () => {});
}

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(false);
  mockedRepeat.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("LiveStatusBadge", () => {
  it("announces the whole status as one polite live text", async () => {
    await renderBadge(<LiveStatusBadge state="online" label="En línea · hasta 18:00" />);

    const badge = screen.getByLabelText("En línea · hasta 18:00");
    expect(badge).toHaveProp("accessibilityRole", "text");
    expect(badge).toHaveProp("accessibilityLiveRegion", "polite");
    expect(screen.getByText("En línea · hasta 18:00")).toBeOnTheScreen();
  });

  it.each([
    { state: "online", label: "En línea · hasta 18:00", tone: "primary" },
    { state: "off-hours", label: "Fuera de horario · vuelve mañana 08:00", tone: "warning" },
    { state: "offline", label: "No disponible", tone: "neutral" },
  ] as const)("colors the $state state with the $tone tone", async ({ state, label, tone }) => {
    await renderBadge(<LiveStatusBadge state={state} label={label} />);

    expect(screen.getByLabelText(label)).toHaveStyle({
      backgroundColor: toneColor(tone).background,
    });
    expect(screen.getByText(label)).toHaveStyle({ color: toneColor(tone).text });
  });

  it("pulses the dot only while online", async () => {
    await renderBadge(<LiveStatusBadge state="online" label="En línea · hasta 18:00" />);
    expect(mockedRepeat).toHaveBeenCalled();

    mockedRepeat.mockClear();
    await renderBadge(<LiveStatusBadge state="off-hours" label="Fuera de horario" />);
    await renderBadge(<LiveStatusBadge state="offline" label="No disponible" />);
    expect(mockedRepeat).not.toHaveBeenCalled();
  });

  it("keeps the dot still under the system reduce-motion setting", async () => {
    jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);

    await renderBadge(<LiveStatusBadge state="online" label="En línea · hasta 18:00" />);

    expect(mockedRepeat).not.toHaveBeenCalled();
  });
});
