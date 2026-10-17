/**
 * Nueva donación → Revisar: the draft is validated before review, then created (or updated)
 * and published against the (mocked) API.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useLocalSearchParams } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import { initialDonationDraft, type DonationDraft } from "@/domain/donation-draft";
import { NewDonationScreen } from "@/screens/donations";
import { ReviewDonationScreen } from "@/screens/donor";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { catalogosFixture, detalleFixture } from "@/test-utils/fixtures";
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

describe("ReviewDonationScreen", () => {
  const expectedBody = {
    ventana_recogida_inicio: "2026-10-16T16:00:00-05:00",
    ventana_recogida_fin: "2026-10-16T18:00:00-05:00",
    direccion_recogida: "Cra 45 #12-30",
    ubicacion_recogida: { lat: 4.65, lng: -74.06 },
    items: [
      {
        tipo_alimento_id: 11,
        unidad_medida_id: 22,
        cantidad: 20,
        peso_estimado_kg: 20,
        requiere_refrigeracion: true,
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

  it("checks the window again before sending", async () => {
    // 17:50: the 16:00–18:00 window started long ago.
    jest.spyOn(Date, "now").mockReturnValue(Date.UTC(2026, 9, 16, 22, 50));
    await renderScreen(ReviewDonationScreen, readyDraft);

    await pressConfirm();

    expect(await screen.findByText("La recogida no puede empezar en el pasado.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("shows each product's photo, or that it has none", async () => {
    await renderScreen(ReviewDonationScreen, {
      ...readyDraft,
      products: [
        { ...readyDraft.products[0], rutaFoto: "productos/u/a.jpg", fotoUri: "file:///a.jpg" },
        { ...readyDraft.products[0], id: 2, name: "Arroz" },
      ],
    });

    expect(await screen.findByLabelText("Foto de Leche")).toBeOnTheScreen();
    expect(screen.getByText("Sin foto")).toBeOnTheScreen();
    expect(screen.queryByText("Fotografías pendientes")).toBeNull();
  });
});
