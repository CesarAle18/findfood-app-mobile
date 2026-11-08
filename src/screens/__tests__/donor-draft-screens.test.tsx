/**
 * Nueva donación → Revisar: the draft is validated before review, then created (or updated)
 * and published against the (mocked) API.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, Stack, router, useLocalSearchParams } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as Location from "expo-location";
import { Text } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import {
  initialDonationDraft,
  PICKUP_POINT_OUTSIDE_AREA,
  PICKUP_POINT_REQUIRED,
  type DonationDraft,
} from "@/domain/donation-draft";
import { clearReverseGeocodeCache } from "@/location/geocode";
import { NewDonationScreen } from "@/screens/donations";
import { ReviewDonationScreen } from "@/screens/donor";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { catalogosFixture, detalleFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

// A build with the Maps key: the picker draws the map the donor moves.
jest.mock("@/config/maps", () => ({ hasGoogleMapsKey: () => true }));

// The Jest build of Reanimated has no LayoutAnimationConfig: render its children as they are.
jest.mock("@/components/findfood/motion", () => ({
  ...jest.requireActual<typeof import("@/components/findfood/motion")>(
    "@/components/findfood/motion",
  ),
  LayoutAnimationConfig: ({ children }: { children: React.ReactNode }) => children,
}));

const mockApi = api as unknown as ApiMock;

/** 16/10/2026 10:00 in Bogotá. */
const NOW = Date.UTC(2026, 9, 16, 15, 0);

const readyDraft: DonationDraft = {
  ...initialDonationDraft,
  products: [
    {
      ...initialDonationDraft.products[0],
      tipoAlimentoId: 11,
      name: "Leche",
      quantity: "20",
      unit: "L",
      coldChain: "Refrigerado",
      rutaFoto: "productos/u/leche.jpg",
      fotoUri: "file:///leche.jpg",
    },
  ],
  direccion: "Cra 45 #12-30",
  ubicacionRecogida: { lat: 4.65, lng: -74.06 },
};

let client: QueryClient;

function Waiting() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Esperando voluntario {id}</Text>;
}

async function renderScreen(Component: React.ComponentType, draft?: DonationDraft) {
  client = createTestQueryClient();
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <MobileProvider initialDraft={draft}>
          <Slot />
        </MobileProvider>
      </QueryClientProvider>
    );
  }
  function Pantalla() {
    return <Component />;
  }
  await renderRouter(
    {
      _layout: Layout,
      pantalla: Pantalla,
      "donante/revisar-donacion": () => <Text>Revisión</Text>,
      "donante/espera-voluntario": Waiting,
    },
    { initialUrl: "/pantalla" },
  );
}

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === "/catalogos") return catalogosFixture;
    throw new Error(`unexpected GET ${path}`);
  });
  mockApi.post.mockReset();
  mockApi.patch.mockReset();
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe("NewDonationScreen", () => {
  it("shows the errors by field and stays while the draft is incomplete", async () => {
    await renderScreen(NewDonationScreen, initialDonationDraft);

    await fireEvent.press(await screen.findByText("Continuar"));

    expect(screen.getByText("Selecciona el producto.")).toBeOnTheScreen();
    expect(
      screen.getByText("Ingresa una cantidad mayor que 0, con máximo 2 decimales."),
    ).toBeOnTheScreen();
    expect(screen.getByText("Agrega una foto del producto.")).toBeOnTheScreen();
    expect(screen.getByText("Ingresa una dirección de al menos 5 caracteres.")).toBeOnTheScreen();
    expect(screen.getByText(PICKUP_POINT_REQUIRED)).toBeOnTheScreen();
    expect(screen.getByText("Revisa los campos marcados antes de continuar.")).toBeOnTheScreen();
    expect(screen.queryByText("Revisión")).toBeNull();
  });

  it("does not ask for a pickup window", async () => {
    await renderScreen(NewDonationScreen, readyDraft);

    expect(await screen.findByText("Continuar")).toBeOnTheScreen();
    expect(screen.queryByText("Ventana de recogida")).toBeNull();
    expect(screen.queryByText("Fecha de recogida")).toBeNull();
    expect(screen.queryByLabelText(/Fecha de recogida/)).toBeNull();
  });

  it("refuses a pickup point outside Bogotá's service area", async () => {
    await renderScreen(NewDonationScreen, {
      ...readyDraft,
      ubicacionRecogida: { lat: 6.24, lng: -75.58 },
    });

    await fireEvent.press(await screen.findByText("Continuar"));

    expect(screen.getByText(PICKUP_POINT_OUTSIDE_AREA)).toBeOnTheScreen();
    expect(screen.queryByText("Revisión")).toBeNull();
  });

  it("opens the review when the draft is valid", async () => {
    await renderScreen(NewDonationScreen, readyDraft);

    await fireEvent.press(await screen.findByText("Continuar"));

    expect(await screen.findByText("Revisión")).toBeOnTheScreen();
  });

  it("does not show the chosen point's coordinates", async () => {
    await renderScreen(NewDonationScreen, readyDraft);

    expect(await screen.findByText("Continuar")).toBeOnTheScreen();
    expect(screen.queryByText(/Punto elegido/)).toBeNull();
    expect(
      screen.queryByText("Este punto de recogida se compartirá entre todos los productos."),
    ).toBeNull();
  });

  it("locates the typed address as the pickup point", async () => {
    jest.spyOn(Location, "geocodeAsync").mockResolvedValue([{ latitude: 4.61, longitude: -74.07 }]);
    await renderScreen(NewDonationScreen, { ...readyDraft, ubicacionRecogida: null });

    await fireEvent.press(await screen.findByRole("button", { name: "Ubicar dirección" }));
    await fireEvent.press(screen.getByText("Continuar"));

    expect(await screen.findByText("Revisión")).toBeOnTheScreen();
  });

  it("drops the located point when the address changes", async () => {
    jest.spyOn(Location, "geocodeAsync").mockResolvedValue([{ latitude: 4.61, longitude: -74.07 }]);
    await renderScreen(NewDonationScreen, { ...readyDraft, ubicacionRecogida: null });

    await fireEvent.press(await screen.findByRole("button", { name: "Ubicar dirección" }));
    await waitFor(() => expect(Location.geocodeAsync).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByDisplayValue("Cra 45 #12-30"), "Cra 45 #12-31");
    expect(screen.queryByText(/Punto elegido/)).toBeNull();

    await fireEvent.press(screen.getByText("Continuar"));
    expect(screen.getByText(PICKUP_POINT_REQUIRED)).toBeOnTheScreen();
    expect(screen.queryByText("Revisión")).toBeNull();
  });

  describe("the address follows the chosen point", () => {
    const suggested = "Calle 76 #15-20, Bogotá";

    beforeEach(() => {
      clearReverseGeocodeCache();
      mockApi.get.mockImplementation(async (path: string) => {
        if (path === "/catalogos") return catalogosFixture;
        if (path === "/geo/inversa") return { direccion: suggested };
        throw new Error(`unexpected GET ${path}`);
      });
    });

    it("replaces the typed address once the donor moves the map", async () => {
      await renderScreen(NewDonationScreen, readyDraft);

      const region = { latitude: 4.7, longitude: -74.1, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      const map = await screen.findByTestId("location-picker-map");
      await fireEvent(map, "regionChangeComplete", region, { isGesture: true });

      expect(await screen.findByDisplayValue(suggested, {}, { timeout: 2000 })).toBeOnTheScreen();
      expect(screen.queryByDisplayValue("Cra 45 #12-30")).toBeNull();
    });

    it("replaces the typed address with the device position's", async () => {
      const defaultHook = jest.mocked(Location.useForegroundPermissions).getMockImplementation()!;
      const granted = { status: "granted", granted: true, canAskAgain: true, expires: "never" };
      jest.mocked(Location.useForegroundPermissions).mockImplementation(() => [
        granted as never,
        jest.fn(async () => granted as never),
        jest.fn(async () => granted as never),
      ]);
      try {
        await renderScreen(NewDonationScreen, readyDraft);

        await fireEvent.press(await screen.findByRole("button", { name: "Usar mi ubicación" }));

        expect(await screen.findByDisplayValue(suggested)).toBeOnTheScreen();
        expect(screen.queryByDisplayValue("Cra 45 #12-30")).toBeNull();
      } finally {
        jest.mocked(Location.useForegroundPermissions).mockImplementation(defaultHook);
      }
    });
  });
});

describe("ReviewDonationScreen", () => {
  const expectedBody = {
    // From the moment of sending (10:00 in Bogotá) for 24 hours.
    ventana_recogida_inicio: "2026-10-16T10:00:00-05:00",
    ventana_recogida_fin: "2026-10-17T10:00:00-05:00",
    direccion_recogida: "Cra 45 #12-30",
    ubicacion_recogida: { lat: 4.65, lng: -74.06 },
    items: [
      {
        tipo_alimento_id: 11,
        unidad_medida_id: 22,
        cantidad: 20,
        peso_estimado_kg: 20,
        requiere_refrigeracion: true,
        ruta_foto: "productos/u/leche.jpg",
      },
    ],
  };
  const publicada = (id: string) => ({ ...detalleFixture({ id, estado: "PUBLICADA" }), oferta_en_curso: true });
  /** Confirmar waits for the units catalog. */
  const pressConfirm = async () => {
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar" })).toBeEnabled());
    await fireEvent.press(screen.getByText("Confirmar"));
  };
  const problem = (status: number, type: string) => new ApiError({ status, type, title: type });

  it("creates the donation, publishes it and opens the waiting screen", async () => {
    mockApi.post.mockImplementation(async (path: string) => {
      if (path === "/donaciones") return detalleFixture({ id: "nueva-1", estado: "BORRADOR" });
      if (path === "/donaciones/nueva-1/publicar") return publicada("nueva-1");
      throw new Error(`unexpected POST ${path}`);
    });
    await renderScreen(ReviewDonationScreen, readyDraft);

    await pressConfirm();

    expect(await screen.findByText("Esperando voluntario nueva-1")).toBeOnTheScreen();
    expect(mockApi.post).toHaveBeenNthCalledWith(1, "/donaciones", { body: expectedBody });
    expect(mockApi.post).toHaveBeenNthCalledWith(2, "/donaciones/nueva-1/publicar");
    expect(mockApi.patch).not.toHaveBeenCalled();
  });

  it("goes back from the waiting screen to the home, not to the form", async () => {
    mockApi.post.mockImplementation(async (path: string) => {
      if (path === "/donaciones") return detalleFixture({ id: "nueva-1", estado: "BORRADOR" });
      if (path === "/donaciones/nueva-1/publicar") return publicada("nueva-1");
      throw new Error(`unexpected POST ${path}`);
    });
    client = createTestQueryClient();
    function Layout() {
      return (
        <QueryClientProvider client={client}>
          <MobileProvider initialDraft={readyDraft}>
            <Slot />
          </MobileProvider>
        </QueryClientProvider>
      );
    }
    await renderRouter(
      {
        _layout: Layout,
        "donante/_layout": () => <Stack />,
        "donante/(tabs)/index": () => <Text>Inicio del donante</Text>,
        "donante/nueva-donacion": () => <Text>Formulario de donación</Text>,
        "donante/revisar-donacion": ReviewDonationScreen,
        "donante/espera-voluntario": Waiting,
      },
      { initialUrl: "/donante" },
    );
    await act(() => router.push("/donante/nueva-donacion"));
    await act(() => router.push("/donante/revisar-donacion"));

    await pressConfirm();
    expect(await screen.findByText("Esperando voluntario nueva-1")).toBeOnTheScreen();

    // The header's back button and the system back both pop the stack.
    await act(() => router.back());
    expect(await screen.findByText("Inicio del donante")).toBeOnTheScreen();
    expect(screen.queryByText("Formulario de donación")).toBeNull();
  });

  it("updates the draft already created in the API instead of creating another", async () => {
    mockApi.patch.mockResolvedValue(detalleFixture({ id: "borrador-1", estado: "BORRADOR" }));
    mockApi.post.mockResolvedValue(publicada("borrador-1"));
    await renderScreen(ReviewDonationScreen, { ...readyDraft, apiId: "borrador-1" });

    await pressConfirm();

    expect(await screen.findByText("Esperando voluntario borrador-1")).toBeOnTheScreen();
    expect(mockApi.patch).toHaveBeenCalledWith("/donaciones/borrador-1", { body: expectedBody });
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post).toHaveBeenCalledWith("/donaciones/borrador-1/publicar");
  });

  it("shows why publishing failed and retries on the same donation", async () => {
    mockApi.post.mockImplementation(async (path: string) => {
      if (path === "/donaciones") return detalleFixture({ id: "nueva-1", estado: "BORRADOR" });
      throw problem(422, "ventana-muy-corta");
    });
    mockApi.patch.mockResolvedValue(detalleFixture({ id: "nueva-1", estado: "BORRADOR" }));
    await renderScreen(ReviewDonationScreen, readyDraft);

    await pressConfirm();

    expect(
      await screen.findByText("La ventana de recogida es demasiado corta. Amplía el horario."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Confirmar"));
    await waitFor(() =>
      expect(mockApi.patch).toHaveBeenCalledWith("/donaciones/nueva-1", { body: expectedBody }),
    );
    expect(mockApi.post.mock.calls.filter(([path]) => path === "/donaciones")).toHaveLength(1);
  });

  it("forgets a draft the API no longer lets edit", async () => {
    mockApi.patch.mockRejectedValue(problem(409, "donacion-no-editable"));
    await renderScreen(ReviewDonationScreen, { ...readyDraft, apiId: "borrador-1" });

    await pressConfirm();

    expect(
      await screen.findByText(
        "Esta donación ya no se puede editar. Revisa Mis donaciones antes de confirmar de nuevo: se creará una donación nueva.",
      ),
    ).toBeOnTheScreen();
    mockApi.post.mockResolvedValue(detalleFixture({ id: "nueva-2", estado: "BORRADOR" }));
    await fireEvent.press(screen.getByText("Confirmar"));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith("/donaciones", { body: expectedBody }),
    );
  });

  it("does not show a pickup window to the donor", async () => {
    await renderScreen(ReviewDonationScreen, readyDraft);

    expect(await screen.findByText("Punto general de recogida")).toBeOnTheScreen();
    expect(screen.queryByText(/Ventana:/)).toBeNull();
  });

  it("starts the window when the donor confirms, even late at night", async () => {
    mockApi.post.mockImplementation(async (path: string) => {
      if (path === "/donaciones") return detalleFixture({ id: "nueva-1", estado: "BORRADOR" });
      if (path === "/donaciones/nueva-1/publicar") return publicada("nueva-1");
      throw new Error(`unexpected POST ${path}`);
    });
    await renderScreen(ReviewDonationScreen, readyDraft);
    // 23:50 in Bogotá, after the screen opened.
    jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 17, 4, 50));

    await pressConfirm();

    expect(await screen.findByText("Esperando voluntario nueva-1")).toBeOnTheScreen();
    expect(mockApi.post).toHaveBeenNthCalledWith(1, "/donaciones", {
      body: {
        ...expectedBody,
        ventana_recogida_inicio: "2026-10-16T23:50:00-05:00",
        ventana_recogida_fin: "2026-10-17T23:50:00-05:00",
      },
    });
  });

  it("shows each product's photo, or that it has none", async () => {
    await renderScreen(ReviewDonationScreen, {
      ...readyDraft,
      products: [
        { ...readyDraft.products[0], rutaFoto: "productos/u/a.jpg", fotoUri: "file:///a.jpg" },
        { ...readyDraft.products[0], id: 2, name: "Arroz", rutaFoto: null, fotoUri: null },
      ],
    });

    expect(await screen.findByLabelText("Foto de Leche")).toBeOnTheScreen();
    expect(screen.getByText("Sin foto")).toBeOnTheScreen();
    expect(screen.queryByText("Fotografías pendientes")).toBeNull();
  });
});
