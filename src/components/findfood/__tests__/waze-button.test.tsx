import { fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { WazeButton, wazeUrl } from "../waze-button";

let openURL: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

afterEach(() => {
  openURL.mockRestore();
});

describe("wazeUrl", () => {
  it("builds the universal link that starts navigation to the point", () => {
    expect(wazeUrl({ lat: 4.6, lng: -74.08 })).toBe(
      "https://waze.com/ul?ll=4.6,-74.08&navigate=yes",
    );
  });
});

describe("WazeButton", () => {
  it("opens Waze with navigation to the destination", async () => {
    await render(<WazeButton destino={{ lat: 4.6, lng: -74.08 }} />);

    await fireEvent.press(screen.getByRole("button", { name: "Ir con Waze" }));

    expect(openURL).toHaveBeenCalledWith("https://waze.com/ul?ll=4.6,-74.08&navigate=yes");
  });

  it("explains what to do when Waze cannot open", async () => {
    openURL.mockRejectedValueOnce(new Error("no handler"));
    await render(<WazeButton destino={{ lat: 4.6, lng: -74.08 }} />);

    await fireEvent.press(screen.getByRole("button", { name: "Ir con Waze" }));

    expect(
      await screen.findByText("No pudimos abrir Waze. Instálalo o usa otra app de mapas."),
    ).toBeOnTheScreen();
  });

  it.each([
    [Number.NaN, -74.08],
    [4.6, Number.POSITIVE_INFINITY],
  ])("renders nothing without a usable point (%p, %p)", async (lat, lng) => {
    await render(<WazeButton destino={{ lat, lng }} />);

    expect(screen.queryByRole("button")).toBeNull();
  });
});
