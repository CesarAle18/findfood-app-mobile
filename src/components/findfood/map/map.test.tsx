import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Location from "expo-location";
import { Platform } from "react-native";

import { ApiError } from "@/api/errors";
import { hasGoogleMapsKey } from "@/config/maps";
import { clearReverseGeocodeCache } from "@/location/geocode";
import {
  autocompletarDireccion,
  geocodificar,
  geocodificarInversa,
  getLugar,
} from "@/services/geo";
import type { GeometriaRutaDto } from "@/services/rutas";

import {
  APPROXIMATE_NOTICE,
  AUTOCOMPLETE_DELAY_MS,
  LocationPicker,
  REVERSE_GEOCODE_DELAY_MS,
} from "./location-picker";
import { DonorTrackingMap } from "./donor-tracking-map";
import { PointMap } from "./point-map";
import { RouteMapView, type RouteStop } from "./route-map-view";

// A build with the Maps key of its platform, unless a test says otherwise.
jest.mock("@/config/maps", () => ({ hasGoogleMapsKey: jest.fn(() => true) }));

// The API's address search (Google), unavailable unless a test says otherwise.
jest.mock("@/services/geo", () => ({
  ...jest.requireActual<typeof import("@/services/geo")>("@/services/geo"),
  autocompletarDireccion: jest.fn(),
  getLugar: jest.fn(),
  geocodificar: jest.fn(),
  geocodificarInversa: jest.fn(),
}));

const noGoogle = () =>
  new ApiError({ type: "geo-no-disponible", status: 503, title: "No disponible" });

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
  clearReverseGeocodeCache();
  for (const search of [autocompletarDireccion, getLugar, geocodificar, geocodificarInversa]) {
    jest.mocked(search).mockRejectedValue(noGoogle());
  }
});

afterEach(() => {
  jest.mocked(Location.useForegroundPermissions).mockImplementation(defaultHook);
  jest.mocked(hasGoogleMapsKey).mockReturnValue(true);
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
    expect(onChange).toHaveBeenCalledWith({ lat: 4.7, lng: -74.1 }, "map");
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
    expect(onChange).toHaveBeenCalledWith({ lat: 4.65, lng: -74.06 }, "device");
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

  describe("Ubicar dirección", () => {
    afterEach(() => {
      (Location.geocodeAsync as Partial<jest.Mock>).mockRestore?.();
    });

    const locate = () =>
      act(async () => {
        fireEvent.press(screen.getByRole("button", { name: "Ubicar dirección" }));
      });

    it("is only offered when the parent passes an address", async () => {
      await render(<LocationPicker value={null} onChange={jest.fn()} />);

      expect(screen.queryByRole("button", { name: "Ubicar dirección" })).toBeNull();
    });

    it("locates the typed address in Colombia and emits it as an address point", async () => {
      const geocode = jest
        .spyOn(Location, "geocodeAsync")
        .mockResolvedValue([{ latitude: 4.61, longitude: -74.07 }]);
      const onChange = jest.fn();
      await render(<LocationPicker value={null} onChange={onChange} address="Cra 45 #12-30" />);

      await locate();

      expect(geocode).toHaveBeenCalledWith("Cra 45 #12-30, Colombia");
      expect(onChange).toHaveBeenCalledWith({ lat: 4.61, lng: -74.07 }, "address");
    });

    it("explains a failed lookup and never emits a guessed point", async () => {
      jest.spyOn(Location, "geocodeAsync").mockResolvedValue([]);
      const onChange = jest.fn();
      await render(<LocationPicker value={null} onChange={onChange} address="Dirección rara" />);

      await locate();

      expect(screen.getByText(/No pudimos ubicar esa dirección/)).toBeOnTheScreen();
      expect(onChange).not.toHaveBeenCalled();
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    it("asks for the address before looking it up", async () => {
      const geocode = jest.spyOn(Location, "geocodeAsync");
      await render(<LocationPicker value={null} onChange={jest.fn()} address="  " />);

      await locate();

      expect(screen.getByText("Escribe la dirección de recogida para ubicarla.")).toBeOnTheScreen();
      expect(geocode).not.toHaveBeenCalled();
    });

    it("needs the location permission on Android, and explains when it is refused", async () => {
      const os = jest.replaceProperty(Platform, "OS", "android");
      try {
        mockForegroundPermission(permission(false, true));
        const geocode = jest.spyOn(Location, "geocodeAsync");
        const onChange = jest.fn();
        await render(<LocationPicker value={null} onChange={onChange} address="Cra 45 #12-30" />);

        await locate();

        expect(screen.getByText(/Permite el acceso a tu ubicación/)).toBeOnTheScreen();
        expect(geocode).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
      } finally {
        os.restore();
      }
    });
  });
});

describe("LocationPicker with Google through the API", () => {
  afterEach(() => {
    jest.useRealTimers();
    (Location.geocodeAsync as Partial<jest.Mock>).mockRestore?.();
  });

  const locate = () =>
    act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Ubicar dirección" }));
    });

  it("locates with Google first, without the phone geocoder or its Android permission", async () => {
    const os = jest.replaceProperty(Platform, "OS", "android");
    try {
      mockForegroundPermission(permission(false, true));
      jest.mocked(geocodificar).mockResolvedValue({
        direccion: "Cra. 45 #12-30, Bogotá",
        ubicacion: { lat: 4.62, lng: -74.08 },
        precision: "ROOFTOP",
      });
      const geocode = jest.spyOn(Location, "geocodeAsync");
      const onChange = jest.fn();
      await render(<LocationPicker value={null} onChange={onChange} address=" Cra 45 #12-30 " />);

      await locate();

      expect(geocodificar).toHaveBeenCalledWith("Cra 45 #12-30");
      expect(onChange).toHaveBeenCalledWith({ lat: 4.62, lng: -74.08 }, "address");
      expect(geocode).not.toHaveBeenCalled();
      expect(screen.queryByText(APPROXIMATE_NOTICE)).toBeNull();
    } finally {
      os.restore();
    }
  });

  it("asks to adjust the pin when Google only found the zone", async () => {
    jest.mocked(geocodificar).mockResolvedValue({
      direccion: "Chapinero, Bogotá",
      ubicacion: { lat: 4.64, lng: -74.06 },
      precision: "APPROXIMATE",
    });
    await render(<LocationPicker value={null} onChange={jest.fn()} address="Chapinero" />);

    await locate();

    expect(screen.getByText(APPROXIMATE_NOTICE)).toBeOnTheScreen();
  });

  it("trusts Google's 'no such address' and does not ask the phone", async () => {
    jest
      .mocked(geocodificar)
      .mockRejectedValue(new ApiError({ type: "no-encontrado", status: 404, title: "No" }));
    const geocode = jest.spyOn(Location, "geocodeAsync");
    const onChange = jest.fn();
    await render(<LocationPicker value={null} onChange={onChange} address="Dirección rara" />);

    await locate();

    expect(screen.getByText(/No pudimos ubicar esa dirección/)).toBeOnTheScreen();
    expect(geocode).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("suggests addresses while typing; picking one sets the address before the point", async () => {
    jest.useFakeTimers();
    jest.mocked(autocompletarDireccion).mockResolvedValue({
      sugerencias: [{ place_id: "ChIJ72", principal: "Calle 72 #10-34", secundario: "Bogotá" }],
    });
    jest.mocked(getLugar).mockResolvedValue({
      place_id: "ChIJ72",
      direccion: "Cl. 72 #10-34, Bogotá",
      ubicacion: { lat: 4.657, lng: -74.056 },
    });
    const calls: string[] = [];
    const onChange = jest.fn(() => calls.push("point"));
    const onAddressChosen = jest.fn(() => calls.push("address"));
    const view = await render(
      <LocationPicker
        value={null}
        onChange={onChange}
        address="Calle 7"
        onAddressChosen={onAddressChosen}
      />,
    );
    await view.rerender(
      <LocationPicker
        value={null}
        onChange={onChange}
        address="Calle 72"
        onAddressChosen={onAddressChosen}
      />,
    );

    await act(async () => {
      jest.advanceTimersByTime(AUTOCOMPLETE_DELAY_MS);
    });

    // Typing restarts the pause: only the last text is searched.
    expect(autocompletarDireccion).toHaveBeenCalledTimes(1);
    const [query, sesion] = jest.mocked(autocompletarDireccion).mock.calls[0];
    expect(query).toBe("Calle 72");

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Calle 72 #10-34, Bogotá" }));
    });

    expect(getLugar).toHaveBeenCalledWith("ChIJ72", sesion);
    expect(onAddressChosen).toHaveBeenCalledWith("Cl. 72 #10-34, Bogotá");
    expect(onChange).toHaveBeenCalledWith({ lat: 4.657, lng: -74.056 }, "address");
    expect(calls).toEqual(["address", "point"]);
  });

  it("stops suggesting once the API says it cannot search", async () => {
    jest.useFakeTimers();
    const onAddressChosen = jest.fn();
    const view = await render(
      <LocationPicker value={null} onChange={jest.fn()} address="Calle 72" onAddressChosen={onAddressChosen} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(AUTOCOMPLETE_DELAY_MS);
    });
    await view.rerender(
      <LocationPicker value={null} onChange={jest.fn()} address="Calle 72 #1" onAddressChosen={onAddressChosen} />,
    );
    await act(async () => {
      jest.advanceTimersByTime(AUTOCOMPLETE_DELAY_MS);
    });

    expect(autocompletarDireccion).toHaveBeenCalledTimes(1);
  });

  it("suggests the address of a dropped pin once the map rests, without location permission", async () => {
    jest.useFakeTimers();
    jest.mocked(geocodificarInversa).mockResolvedValue({ direccion: "Calle 76 #15-20, Bogotá" });
    const onAddressSuggestion = jest.fn();
    await render(
      <LocationPicker value={null} onChange={jest.fn()} onAddressSuggestion={onAddressSuggestion} />,
    );
    const map = screen.getByTestId("location-picker-map");

    await act(async () => {
      fireEvent(map, "regionChangeComplete", region, { isGesture: true });
      fireEvent(map, "regionChangeComplete", { ...region, latitude: 4.71 }, { isGesture: true });
    });
    expect(geocodificarInversa).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(REVERSE_GEOCODE_DELAY_MS);
    });

    expect(geocodificarInversa).toHaveBeenCalledTimes(1);
    expect(geocodificarInversa).toHaveBeenCalledWith({ lat: 4.71, lng: -74.1 });
    expect(onAddressSuggestion).toHaveBeenCalledWith("Calle 76 #15-20, Bogotá");
    expect(Location.reverseGeocodeAsync).not.toHaveBeenCalled();
  });

  it("draws the coverage radius around the chosen point", async () => {
    await render(
      <LocationPicker value={{ lat: 4.65, lng: -74.06 }} onChange={jest.fn()} coverageKm={12} />,
    );

    const circle = screen.getByTestId("location-picker-coverage");
    expect(circle.props.center).toEqual({ latitude: 4.65, longitude: -74.06 });
    expect(circle.props.radius).toBe(12_000);
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

  it("draws the leg to the next stop over the route and shows the device's position", async () => {
    await render(
      <RouteMapView
        geometria={geometria}
        paradas={paradas}
        showsUserLocation
        tramo={{ type: "LineString", coordinates: [[-74.05, 4.64], [-74.06, 4.65]] }}
      />,
    );

    expect(screen.getByTestId("route-next-leg").props.coordinates).toEqual([
      { latitude: 4.64, longitude: -74.05 },
      { latitude: 4.65, longitude: -74.06 },
    ]);
    const map = screen.getByTestId("route-map");
    expect(map.props.showsUserLocation).toBe(true);
    expect(map.props.showsMyLocationButton).toBe(true);
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

  it("stays light even when the phone is in dark mode", async () => {
    await render(<PointMap point={{ lat: 4.65, lng: -74.06 }} title="Punto de recogida" />);

    expect(screen.getByTestId("point-map").props.userInterfaceStyle).toBe("light");
  });
});

describe("without a Maps key in the build", () => {
  it("shows a placeholder instead of the map, which would abort the app", async () => {
    jest.mocked(hasGoogleMapsKey).mockReturnValue(false);
    await render(<PointMap point={{ lat: 4.65, lng: -74.06 }} title="Punto de recogida" />);

    const placeholder = screen.getByTestId("point-map");
    expect(placeholder.props.accessibilityLabel).toBe("Mapa: Punto de recogida");
    expect(placeholder.props.region).toBeUndefined();
    expect(
      screen.getByText("El mapa no está disponible en esta versión de la app."),
    ).toBeTruthy();
  });
});

describe("DonorTrackingMap", () => {
  const recogida = { lat: 4.65, lng: -74.06 };
  const banco = { nombre: "Bodega Norte", lat: 4.69, lng: -74.08 };
  const tramo: GeometriaRutaDto = {
    type: "LineString",
    coordinates: [
      [-74.05, 4.67],
      [-74.06, 4.65],
    ],
  };

  it("shows the volunteer heading to the pickup, the bank and the leg, never route stops", async () => {
    await render(
      <DonorTrackingMap
        recogida={recogida}
        banco={banco}
        voluntario={{ lat: 4.67, lng: -74.05, rumbo: 135 }}
        tramo={tramo}
      />,
    );

    const volunteer = screen.getByTestId("donor-map-volunteer");
    expect(volunteer.props.coordinate).toEqual({ latitude: 4.67, longitude: -74.05 });
    expect(volunteer.props.rotation).toBe(135);
    expect(volunteer.props.flat).toBe(true);
    expect(volunteer.props.tracksViewChanges).toBe(false);
    expect(screen.getByTestId("donor-map-pickup").props.coordinate).toEqual({
      latitude: 4.65,
      longitude: -74.06,
    });
    expect(screen.getByTestId("donor-map-bank").props.title).toBe("Bodega Norte");
    expect(screen.getByTestId("donor-map-leg").props.coordinates).toEqual([
      { latitude: 4.67, longitude: -74.05 },
      { latitude: 4.65, longitude: -74.06 },
    ]);
    expect(screen.queryByTestId("route-path")).toBeNull();
  });

  it("without a position, bank or leg shows the pickup alone", async () => {
    await render(<DonorTrackingMap recogida={recogida} banco={null} voluntario={null} tramo={null} />);

    expect(screen.getByTestId("donor-map-pickup")).toBeOnTheScreen();
    expect(screen.queryByTestId("donor-map-volunteer")).toBeNull();
    expect(screen.queryByTestId("donor-map-bank")).toBeNull();
    expect(screen.queryByTestId("donor-map-leg")).toBeNull();
  });

  it("points the volunteer north when the phone reports no heading", async () => {
    await render(
      <DonorTrackingMap
        recogida={recogida}
        banco={null}
        voluntario={{ lat: 4.67, lng: -74.05, rumbo: null }}
        tramo={null}
      />,
    );

    expect(screen.getByTestId("donor-map-volunteer").props.rotation).toBe(0);
  });

  it("opens framing what it knows, and keeps that frame while the volunteer moves", async () => {
    const view = await render(
      <DonorTrackingMap
        recogida={recogida}
        banco={banco}
        voluntario={{ lat: 4.67, lng: -74.05, rumbo: 0 }}
        tramo={null}
      />,
    );
    const opened = screen.getByTestId("donor-map").props.initialRegion;
    expect(opened.latitude).toBeCloseTo(4.67);
    expect(opened.latitudeDelta).toBeGreaterThan(0.04);

    await view.rerender(
      <DonorTrackingMap
        recogida={recogida}
        banco={banco}
        voluntario={{ lat: 4.5, lng: -74.2, rumbo: 0 }}
        tramo={null}
      />,
    );

    expect(screen.getByTestId("donor-map").props.initialRegion).toBe(opened);
    expect(screen.getByTestId("donor-map-volunteer").props.coordinate).toEqual({
      latitude: 4.5,
      longitude: -74.2,
    });
  });
});
