import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Location from "expo-location";

import type { GeometriaRutaDto } from "@/services/rutas";

import { LocationPicker } from "./location-picker";
import { PointMap } from "./point-map";
import { RouteMapView, type RouteStop } from "./route-map-view";

const permission = (granted: boolean, canAskAgain: boolean) => ({
  status: granted ? "granted" : "denied",
  granted,
  canAskAgain,
  expires: "never",
});

function mockForegroundPermission(answer: ReturnType<typeof permission>) {
  jest.mocked(Location.useForegroundPermissions).mockImplementation(() => [
    answer as never,
    jest.fn(async () => answer as never),
    jest.fn(async () => answer as never),
  ]);
}

const defaultHook = jest.mocked(Location.useForegroundPermissions).getMockImplementation()!;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.mocked(Location.useForegroundPermissions).mockImplementation(defaultHook);
});

const region = { latitude: 4.7, longitude: -74.1, latitudeDelta: 0.01, longitudeDelta: 0.01 };

describe("LocationPicker", () => {
  it("emits {lat,lng} when the donor finishes moving the map", async () => {
    const onChange = jest.fn();
    await render(<LocationPicker value={null} onChange={onChange} />);

    await act(async () => {
      fireEvent(screen.getByTestId("location-picker-map"), "regionChangeComplete", region, {
        isGesture: true,
      });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ lat: 4.7, lng: -74.1 });
  });

  it("ignores moves the donor did not make (initial layout, animations)", async () => {
    const onChange = jest.fn();
    await render(<LocationPicker value={null} onChange={onChange} />);

    await act(async () => {
      fireEvent(screen.getByTestId("location-picker-map"), "regionChangeComplete", region, {
        isGesture: false,
      });
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("centers on the device's position and suggests its address", async () => {
    mockForegroundPermission(permission(true, true));
    jest.mocked(Location.reverseGeocodeAsync).mockResolvedValueOnce([
      { formattedAddress: "Calle 76 #15-20, Bogotá" } as Location.LocationGeocodedAddress,
    ]);
    const onChange = jest.fn();
    const onAddressSuggestion = jest.fn();
    await render(
      <LocationPicker value={null} onChange={onChange} onAddressSuggestion={onAddressSuggestion} />,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Usar mi ubicación" }));
    });

    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({
      accuracy: Location.Accuracy.Balanced,
    });
    expect(onChange).toHaveBeenCalledWith({ lat: 4.65, lng: -74.06 });
    expect(onAddressSuggestion).toHaveBeenCalledWith("Calle 76 #15-20, Bogotá");
  });

  it("does not geocode when the parent already has an address (no suggestion handler)", async () => {
    mockForegroundPermission(permission(true, true));
    await render(<LocationPicker value={{ lat: 4.6, lng: -74.0 }} onChange={jest.fn()} />);

    await act(async () => {
      fireEvent(screen.getByTestId("location-picker-map"), "regionChangeComplete", region, {
        isGesture: true,
      });
    });

    expect(Location.reverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it("explains how to enable location once the OS stops asking", async () => {
    mockForegroundPermission(permission(false, false));
    await render(<LocationPicker value={null} onChange={jest.fn()} />);

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Usar mi ubicación" }));
    });

    expect(screen.getByRole("button", { name: "Abrir ajustes" })).toBeOnTheScreen();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
});

describe("RouteMapView", () => {
  const geometria: GeometriaRutaDto = {
    type: "LineString",
    coordinates: [
      [-74.06, 4.65],
      [-74.07, 4.66],
      [-74.08, 4.67],
    ],
  };
  const paradas: RouteStop[] = [
    { id: "p2", orden: 2, direccion: "Banco", lat: 4.67, lng: -74.08 },
    { id: "p1", orden: 1, direccion: "Panadería", lat: 4.65, lng: -74.06 },
  ];

  it("draws the GeoJSON path in {latitude, longitude} order", async () => {
    await render(<RouteMapView geometria={geometria} paradas={paradas} />);

    expect(screen.getByTestId("route-path").props.coordinates).toEqual([
      { latitude: 4.65, longitude: -74.06 },
      { latitude: 4.66, longitude: -74.07 },
      { latitude: 4.67, longitude: -74.08 },
    ]);
  });

  it("numbers the stops by their order and shows them without geometry", async () => {
    await render(<RouteMapView geometria={null} paradas={paradas} />);

    expect(screen.queryByTestId("route-path")).toBeNull();
    expect(screen.getAllByText(/^[12]$/).map((node) => node.props.children)).toEqual([1, 2]);
  });
});

describe("PointMap", () => {
  it("previews the pickup point without taking touches", async () => {
    await render(<PointMap point={{ lat: 4.65, lng: -74.06 }} title="Punto de recogida" />);

    const map = screen.getByTestId("point-map");
    expect(map.props.scrollEnabled).toBe(false);
    expect(map.props.liteMode).toBe(true);
    expect(map.props.region).toMatchObject({ latitude: 4.65, longitude: -74.06 });
  });
});
