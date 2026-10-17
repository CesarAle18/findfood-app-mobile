import { render, screen } from "@testing-library/react-native";

import { MapView, Marker, Polyline } from "./maps.web";

describe("maps web stand-in", () => {
  it("renders a labelled placeholder instead of the native map, without its overlays", async () => {
    await render(
      <MapView testID="map" accessibilityLabel="Mapa de prueba">
        <Marker />
        <Polyline />
      </MapView>,
    );

    expect(screen.getByTestId("map").props.accessibilityLabel).toBe("Mapa de prueba");
    expect(screen.getByText("El mapa está disponible en la app móvil.")).toBeTruthy();
  });
});
