/**
 * Donación publicada: the live donation (detail + history) drives the steps and the actions
 * the donor has in each state, against the (mocked) API.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useLocalSearchParams } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { DonacionDetalleDto } from "@/services/donaciones";
import { WaitingScreen } from "@/screens/donations";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { DONATION_ID, catalogosFixture, detalleFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockApi = api as unknown as ApiMock;

const detailPath = `/donaciones/${DONATION_ID}`;

const published = detalleFixture({
  estado: "PUBLICADA",
  asignada_at: null,
  asignacion: null,
  expira_publicacion_at: "2026-09-23T20:55:00.000Z",
  items: [
    {
      id: "item-1",
      descripcion: null,
      cantidad: 20,
      peso_estimado_kg: 20,
      peso_real_kg: null,
      fecha_vencimiento: null,
      requiere_refrigeracion: true,
      observaciones: null,
      tipo_alimento: { id: 11, codigo: "LECHE", nombre: "Leche" },
      unidad_medida: { id: 3, codigo: "L", nombre: "Litros" },
      foto_url: null,
    },
  ],
});

let client: QueryClient;

function AssignedVolunteer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Voluntario de {id}</Text>;
}

function answer(detail: DonacionDetalleDto) {
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === "/catalogos") return catalogosFixture;
    if (path === detailPath) return detail;
    if (path === `${detailPath}/historial`) return [];
    throw new Error(`unexpected GET ${path}`);
  });
}

async function renderWaiting(initialUrl = `/pantalla?id=${DONATION_ID}`) {
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
  await renderRouter(
    {
      _layout: Layout,
      pantalla: WaitingScreen,
      donante: () => <Text>Inicio</Text>,
      "donante/voluntario-asignado": AssignedVolunteer,
    },
    { initialUrl },
  );
}

beforeEach(() => {
  mockApi.post.mockReset();
});

afterEach(() => {
  client.clear();
});

describe("WaitingScreen", () => {
  it("shows the published donation, its steps and its deadline", async () => {
    answer(published);

    await renderWaiting();

    expect(await screen.findByText("Estamos buscando un voluntario")).toBeOnTheScreen();
    expect(screen.getByText("DON-1058")).toBeOnTheScreen();
    expect(screen.getByText("Leche")).toBeOnTheScreen();
    expect(screen.getByText("20 Litros · Refrigerado")).toBeOnTheScreen();
    expect(screen.getByText("La publicación vence a las 15:55")).toBeOnTheScreen();
    // The screen title and the first step.
    expect(screen.getAllByText("Donación publicada")).toHaveLength(2);
    expect(screen.getByText("23/09/2026 · 13:55")).toBeOnTheScreen();
    expect(screen.getByText("Voluntario asignado")).toBeOnTheScreen();
    expect(screen.getByText("Cancelar donación")).toBeOnTheScreen();
    expect(screen.queryByText("Ver voluntario asignado")).toBeNull();
    expect(screen.queryByText(/15–30 minutos/)).toBeNull();
    expect(mockApi.get).toHaveBeenCalledWith(`${detailPath}/historial`, {
      signal: expect.any(AbortSignal),
    });
  });

  it("opens the assigned volunteer once a volunteer accepted", async () => {
    answer(detalleFixture({ estado: "ASIGNADA" }));

    await renderWaiting();

    await fireEvent.press(await screen.findByText("Ver voluntario asignado"));

    expect(await screen.findByText(`Voluntario de ${DONATION_ID}`)).toBeOnTheScreen();
  });

  it("republishes an expired donation and shows why it failed", async () => {
    answer(detalleFixture({ estado: "EXPIRADA", asignada_at: null, asignacion: null }));
    mockApi.post.mockRejectedValueOnce(
      new ApiError({ status: 422, type: "ventana-en-el-pasado", title: "Ventana en el pasado" }),
    );

    await renderWaiting();

    await fireEvent.press(await screen.findByText("Volver a publicar"));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(`/donaciones/${DONATION_ID}/publicar`),
    );
    expect(
      await screen.findByText("La ventana de recogida no puede estar en el pasado."),
    ).toBeOnTheScreen();
    expect(screen.getByText("Cancelar donación")).toBeOnTheScreen();
  });

  it("shows the reason of a cancelled donation, without cancel", async () => {
    answer(
      detalleFixture({
        estado: "CANCELADA",
        asignada_at: null,
        asignacion: null,
        motivo_cancelacion: { codigo: "NO_DISPONIBLE", nombre: "Ya no está disponible" },
        observacion_cancelacion: "Se donó en el barrio",
      }),
    );

    await renderWaiting();

    expect(await screen.findByText("Ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByText("Se donó en el barrio")).toBeOnTheScreen();
    expect(screen.queryByText("Cancelar donación")).toBeNull();
  });

  it("cancels the donation with a catalog reason", async () => {
    answer(published);
    mockApi.post.mockResolvedValue(detalleFixture({ estado: "CANCELADA" }));
    await renderWaiting();

    await fireEvent.press(await screen.findByText("Cancelar donación"));
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

  it("asks to open the donation again without an id", async () => {
    answer(published);

    await renderWaiting("/pantalla");

    expect(screen.getByText("No encontramos la donación")).toBeOnTheScreen();
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});
