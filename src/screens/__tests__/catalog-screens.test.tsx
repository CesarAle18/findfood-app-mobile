/**
 * Forms fed by `GET /catalogos`: their options come from the (mocked) API, never from code.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { NewDonationScreen, WaitingScreen } from "@/screens/donations";
import { OfferScreen, VolunteerRegistrationScreen } from "@/screens/volunteer";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { DONATION_ID, catalogosFixture, detalleFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

// The Jest build of Reanimated has no LayoutAnimationConfig: render its children as they are.
jest.mock("@/components/findfood/motion", () => ({
  ...jest.requireActual<typeof import("@/components/findfood/motion")>(
    "@/components/findfood/motion",
  ),
  LayoutAnimationConfig: ({ children }: { children: React.ReactNode }) => children,
}));

const mockApi = api as unknown as ApiMock;

let client: QueryClient;

async function renderScreen(Component: React.ComponentType, initialUrl = "/pantalla") {
  client = createTestQueryClient();
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <MobileProvider>
          <Slot />
        </MobileProvider>
      </QueryClientProvider>
    );
  }
  function Pantalla() {
    return <Component />;
  }
  // Where the cancel and reject flows go back to.
  const Home = () => <Text>Inicio</Text>;
  await renderRouter(
    { _layout: Layout, pantalla: Pantalla, donante: Home, voluntario: Home },
    { initialUrl },
  );
}

beforeEach(() => {
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === "/catalogos") return catalogosFixture;
    throw new Error(`unexpected GET ${path}`);
  });
  mockApi.post.mockReset().mockResolvedValue(detalleFixture());
});

afterEach(() => {
  client.clear();
});

describe("NewDonationScreen", () => {
  it("offers the catalog food types and units", async () => {
    await renderScreen(NewDonationScreen);

    expect(screen.getByRole("progressbar", { name: "Cargando productos" })).toBeOnTheScreen();
    await fireEvent.press(await screen.findByLabelText("Producto: Selecciona"));
    for (const nombre of ["Leche", "Arroz", "Pan"]) {
      expect(screen.getByText(nombre)).toBeOnTheScreen();
    }
    await fireEvent.press(screen.getByText("Cerrar"));

    await fireEvent.press(screen.getByLabelText("Unidad: KG"));
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByText("UN")).toBeNull();
  });

  it("prefills the unit and cold chain of the chosen food type", async () => {
    await renderScreen(NewDonationScreen);

    await fireEvent.press(await screen.findByLabelText("Producto: Selecciona"));
    await fireEvent.press(screen.getByText("Leche"));

    expect(screen.getByLabelText("Producto: Leche")).toBeOnTheScreen();
    expect(screen.getByLabelText("Unidad: L")).toBeOnTheScreen();
    expect(screen.getByLabelText("Cadena de frío: Refrigerado")).toBeOnTheScreen();
  });

  it("keeps a unit the donor already chose", async () => {
    await renderScreen(NewDonationScreen);

    await fireEvent.press(await screen.findByLabelText("Unidad: KG"));
    await fireEvent.press(screen.getByText("G"));
    await fireEvent.press(screen.getByLabelText("Producto: Selecciona"));
    await fireEvent.press(screen.getByText("Leche"));

    expect(screen.getByLabelText("Unidad: G")).toBeOnTheScreen();
  });

  it("shows the error state when the catalog fails", async () => {
    mockApi.get.mockRejectedValue(new Error("boom"));
    await renderScreen(NewDonationScreen);

    expect(await screen.findByText("No pudimos cargar los productos")).toBeOnTheScreen();
  });
});

describe("VolunteerRegistrationScreen", () => {
  it("offers the catalog vehicle types", async () => {
    await renderScreen(VolunteerRegistrationScreen);

    await fireEvent.press(await screen.findByLabelText("Tipo de vehículo *: Selecciona"));
    expect(screen.getByText("Motocicleta")).toBeOnTheScreen();
    expect(screen.getByText("Camioneta")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Camioneta"));
    expect(screen.getByLabelText("Tipo de vehículo *: Camioneta")).toBeOnTheScreen();
  });
});

describe("WaitingScreen", () => {
  it("cancels the donation with a catalog reason", async () => {
    await renderScreen(WaitingScreen, `/pantalla?id=${DONATION_ID}`);

    await fireEvent.press(screen.getByText("Cancelar donación"));
    await fireEvent.press(await screen.findByText("Confirmar cancelación"));
    expect(screen.getByText("Selecciona un motivo.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText("Motivo *: Selecciona"));
    await fireEvent.press(screen.getByText("Ya no está disponible"));
    await fireEvent.press(screen.getByText("Confirmar cancelación"));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(`/donaciones/${DONATION_ID}/cancelar`, {
        body: { motivo_id: 43 },
      }),
    );
    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
  });
});

describe("OfferScreen", () => {
  it("requires the comment of a reason that asks for one before rejecting", async () => {
    await renderScreen(OfferScreen, "/pantalla?asignacionId=asig-1");

    await fireEvent.press(screen.getByText("Rechazar"));
    await fireEvent.press(await screen.findByLabelText("Motivo *: Selecciona"));
    await fireEvent.press(screen.getByText("Otro"));
    await fireEvent.press(screen.getByText("Confirmar rechazo"));
    expect(screen.getByText("Escribe un comentario para este motivo.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Comentario *"), "Se dañó el carro");
    await fireEvent.press(screen.getByText("Confirmar rechazo"));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asig-1/rechazar", {
        body: { motivo_id: 42, observacion: "Se dañó el carro" },
      }),
    );
    expect(await screen.findByText("Inicio")).toBeOnTheScreen();
  });
});
