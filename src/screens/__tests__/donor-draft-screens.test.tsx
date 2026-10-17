/**
 * Nueva donación → Revisar: the draft is validated before review, then created (or updated)
 * and published against the (mocked) API.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { initialDonationDraft, type DonationDraft } from "@/domain/donation-draft";
import { NewDonationScreen } from "@/screens/donations";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { catalogosFixture } from "@/test-utils/fixtures";
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
    },
  ],
  pickupDate: "16/10/2026",
  pickupFrom: "16:00",
  pickupUntil: "18:00",
  direccion: "Cra 45 #12-30",
  ubicacionRecogida: { lat: 4.65, lng: -74.06 },
};

let client: QueryClient;

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
      "donante/espera-voluntario": () => <Text>Esperando voluntario</Text>,
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
    await renderScreen(NewDonationScreen, { ...initialDonationDraft, pickupDate: "16/10/2026" });

    await fireEvent.press(await screen.findByText("Continuar"));

    expect(screen.getByText("Selecciona el producto.")).toBeOnTheScreen();
    expect(
      screen.getByText("Ingresa una cantidad mayor que 0, con máximo 2 decimales."),
    ).toBeOnTheScreen();
    expect(screen.getByText("Ingresa una dirección de al menos 5 caracteres.")).toBeOnTheScreen();
    expect(screen.getByText("Elige el punto de recogida en el mapa.")).toBeOnTheScreen();
    expect(screen.getByText("Revisa los campos marcados antes de continuar.")).toBeOnTheScreen();
    expect(screen.queryByText("Revisión")).toBeNull();
  });

  it("refuses a window that already ended", async () => {
    await renderScreen(NewDonationScreen, { ...readyDraft, pickupFrom: "08:00", pickupUntil: "09:00" });

    await fireEvent.press(await screen.findByText("Continuar"));

    expect(screen.getByText("La recogida no puede empezar en el pasado.")).toBeOnTheScreen();
    expect(
      screen.getByText("La recogida debe terminar al menos 15 minutos después de ahora."),
    ).toBeOnTheScreen();
  });

  it("opens the review when the draft is valid", async () => {
    await renderScreen(NewDonationScreen, readyDraft);

    expect(await screen.findByLabelText("Fecha de recogida: 16/10/2026")).toBeOnTheScreen();
    await fireEvent.press(screen.getByText("Continuar"));

    expect(await screen.findByText("Revisión")).toBeOnTheScreen();
  });
});
