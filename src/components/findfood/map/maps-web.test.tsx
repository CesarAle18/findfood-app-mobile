import { render, screen } from "@testing-library/react-native";
import { Platform } from "react-native";

import { DonorTrackingMap } from "./donor-tracking-map";
import { MapView, Marker, Polyline } from "./maps.web";

// What web resolves for `./maps` (Metro picks `maps.web.tsx`; Jest runs as iOS).
jest.mock("./maps", () => jest.requireActual("./maps.web"));

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

  it("keeps the donor's live map as a placeholder, without the volunteer's marker", async () => {
    const os = jest.replaceProperty(Platform, "OS", "web");
    try {
      await render(
        <DonorTrackingMap
          recogida={{ lat: 4.65, lng: -74.06 }}
          banco={null}
          voluntario={{ lat: 4.67, lng: -74.05, rumbo: 90 }}
          tramo={null}
        />,
      );

      expect(screen.getByTestId("donor-map")).toBeOnTheScreen();
      expect(screen.getByText("El mapa está disponible en la app móvil.")).toBeTruthy();
      expect(screen.queryByTestId("donor-map-volunteer")).toBeNull();
    } finally {
      os.restore();
    }
  });
});
