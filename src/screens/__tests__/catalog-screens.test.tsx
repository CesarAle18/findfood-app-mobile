/**
 * Forms fed by `GET /catalogos`: their options come from the (mocked) API, never from code.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { NewDonationScreen } from "@/screens/donations";
import { OfferScreen } from "@/screens/volunteer";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import {
  catalogosFixture,
  detalleFixture,
  ofertaFixture,
} from "@/test-utils/fixtures";
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

// The offer reads the volunteer's capacity; no profile here, so it shows the weight alone.
jest.mock("@/state/session", () => ({
  useMe: () => ({ data: undefined }),
  useAccess: () => ({ phase: "app", activeRole: "VOLUNTARIO", canDonor: false, canVolunteer: true }),
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
  // Where the reject flows go back to.
  const Home = () => <Text>Inicio</Text>;
  const Routes = () => <Text>Mis rutas</Text>;
  await renderRouter(
    {
      _layout: Layout,
      pantalla: Pantalla,
      donante: Home,
      voluntario: Home,
      "voluntario/rutas": Routes,
    },
    { initialUrl },
  );
}

beforeEach(() => {
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === "/catalogos") return catalogosFixture;
    if (path === "/asignaciones/ofertas") {
      return [ofertaFixture({ id: "asig-0", estado: "ACEPTADA" }), ofertaFixture({ id: "asig-1" })];
    }
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

describe("OfferScreen", () => {
  beforeEach(() => {
    // Ten minutes before the fixture offer lapses: the countdown keeps "Aceptar" enabled.
    jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-13T20:00:00Z"));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the assignment of the link, with its pickup and deadline", async () => {
    await renderScreen(OfferScreen, "/pantalla?asignacionId=asig-1");

    expect(await screen.findByText("DON-1048")).toBeOnTheScreen();
    expect(screen.getByText("Supermercado La 14")).toBeOnTheScreen();
    expect(screen.getByText("45 kg · Refrigeración requerida")).toBeOnTheScreen();
    expect(screen.getByText("Calle 5 # 38-25, Cali · Muelle de carga")).toBeOnTheScreen();
    expect(screen.getByText("Vence en 10:00")).toBeOnTheScreen();
    expect(screen.getByText("15:10")).toBeOnTheScreen();
    expect(screen.getByText("Lácteos · 20 L")).toBeOnTheScreen();
  });

  it("accepts the offer and opens the routes", async () => {
    await renderScreen(OfferScreen, "/pantalla?asignacionId=asig-1");

    await fireEvent.press(await screen.findByText("Aceptar"));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asig-1/aceptar"));
    expect(await screen.findByText("Mis rutas")).toBeOnTheScreen();
  });

  it("says so when the linked offer is no longer listed", async () => {
    await renderScreen(OfferScreen, "/pantalla?asignacionId=expirada");

    expect(await screen.findByText("Esta oferta ya no está disponible")).toBeOnTheScreen();
    expect(screen.queryByText("Aceptar")).toBeNull();
  });

  it("without a link, shows the first offer waiting for an answer", async () => {
    await renderScreen(OfferScreen);

    expect(await screen.findByText("DON-1048")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Aceptar"));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asig-1/aceptar"));
  });

  it("requires the comment of a reason that asks for one before rejecting", async () => {
    await renderScreen(OfferScreen, "/pantalla?asignacionId=asig-1");

    await fireEvent.press(await screen.findByText("Rechazar"));
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
