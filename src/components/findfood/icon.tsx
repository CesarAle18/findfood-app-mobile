import Svg, { Path } from "react-native-svg";
import { Platform } from "react-native";
import { colors } from "@/design/tokens";

export type IconName =
  | "calendar"
  | "menu"
  | "star"
  | "back"
  | "grid"
  | "home"
  | "route"
  | "bell"
  | "user"
  | "camera"
  | "pin"
  | "check"
  | "chevron"
  | "mail"
  | "clock"
  | "truck"
  | "search"
  | "box"
  | "eye"
  | "eye-off"
  | "arrow"
  | "file";

const paths: Record<IconName, string> = {
  calendar: "M3 5h18v16H3zM3 10h18M7 3v4M17 3v4",
  menu: "M4 12h1m6 0h1m6 0h1",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  back: "M19 12H5m7-7-7 7 7 7",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  home: "m3 10 9-7 9 7v10H3zM9 20v-7h6v7",
  route: "M6 4v12a4 4 0 0 0 8 0V8a4 4 0 0 1 8 0M3 4h6M19 8l3 3 2-3",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  user: "M20 21v-2a8 8 0 0 0-16 0v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  camera: "M3 6h4l2-3h6l2 3h4v14H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  pin: "M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 1 1 14 0zM14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  check: "m5 12 4 4L19 6",
  chevron: "m8 4 8 8-8 8",
  mail: "M3 5h18v14H3zM3 5l9 8 9-8",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2",
  truck:
    "M2 4h13v13H2zM15 9h4l3 4v4h-7M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-1 5 6 6",
  box: "m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10M7 5l10 5",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  "eye-off":
    "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 3l18 18",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  file: "M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h6",
};

export function Icon({
  name,
  size = 22,
  color = colors.primary,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      {...(Platform.OS === "web"
        ? { "aria-hidden": true as const, focusable: false }
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: "no-hide-descendants" as const,
          })}
    >
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
