/**
 * Donación entregada (MOV-39): the route opened by the DONACION_ENTREGADA push, with the real
 * delivery data and "Calificar voluntario" while the donor has not rated yet.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { renderRouter, screen, waitFor } from "expo-router/testing-library";

import { api } from "@/api";
import DonorDeliveryRoute from "@/app/donante/entrega-donacion";
import type { DonacionDetalleDto } from "@/services/donaciones";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { DONATION_ID, asignacionFixture, detalleFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockApi = api as unknown as ApiMock;
const detailPath = `/donaciones/${DONATION_ID}`;

const delivered = detalleFixture({
  estado: "ENTREGADA",
  recogida_at: "2026-09-23T21:30:00.000Z",
  entregada_at: "2026-09-23T22:10:00.000Z",
  peso_recogido_kg: 33.5,
  almacen_destino: {
    id: "almacen-1",
    nombre: "Bodega Central",
    direccion: "Av. 68 #10-20, Bogotá",
    tipo: "SECO",
  },
  asignacion: asignacionFixture({ estado: "COMPLETADA" }),
});

let client: QueryClient;

function answer(detail: DonacionDetalleDto) {
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === detailPath) return detail;
    throw new Error(`unexpected GET ${path}`);
  });
}

async function renderDelivery(initialUrl = `/donante/entrega-donacion?id=${DONATION_ID}`) {
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
    { _layout: Layout, "donante/entrega-donacion": DonorDeliveryRoute },
    { initialUrl },
  );
}

const rateLink = () => screen.queryByRole("link", { name: "Calificar voluntario" });

afterEach(() => {
  client.clear();
});

describe("DonorDeliveryScreen", () => {
  it("shows when, where and how much was delivered, and who carried it", async () => {
    answer(delivered);
    await renderDelivery();

    expect(await screen.findByText("Tu donación fue entregada")).toBeOnTheScreen();
    expect(screen.getByText("DON-1058")).toBeOnTheScreen();
    expect(screen.getByText("23/09/2026 · 17:10")).toBeOnTheScreen();
    expect(screen.getByText("Bodega Central")).toBeOnTheScreen();
    expect(screen.getByText("Av. 68 #10-20, Bogotá")).toBeOnTheScreen();
    expect(screen.getByText("33,5 kg")).toBeOnTheScreen();
    expect(screen.getByText("Carlos Ruiz")).toBeOnTheScreen();
    // Not received by the bank yet.
    expect(screen.getByText("Pendiente de confirmación del banco")).toBeOnTheScreen();
    expect(rateLink()).toBeOnTheScreen();
    expect(rateLink()).toHaveProp("href", `/donante/calificar-voluntario?id=${DONATION_ID}`);
  });

  it("shows the bank's reception and its weight", async () => {
    answer({
      ...delivered,
      estado: "RECIBIDA",
      recibida_at: "2026-09-24T13:00:00.000Z",
      peso_recibido_kg: 32,
    });
    await renderDelivery();

    expect(await screen.findByText("24/09/2026 · 08:00")).toBeOnTheScreen();
    expect(screen.getByText("32 kg")).toBeOnTheScreen();
  });

  it("hides the rating once the donor rated the volunteer", async () => {
    answer({
      ...delivered,
      asignacion: asignacionFixture({ estado: "COMPLETADA", calificada_por_mi: true }),
    });
    await renderDelivery();

    expect(await screen.findByText("Ya calificaste a este voluntario.")).toBeOnTheScreen();
    expect(rateLink()).toBeNull();
  });

  it("hides the rating when the bank's fleet carried it", async () => {
    answer({
      ...delivered,
      asignacion: asignacionFixture({ flota_banco: true, voluntario: null }),
    });
    await renderDelivery();

    expect(await screen.findByText("Bodega Central")).toBeOnTheScreen();
    expect(rateLink()).toBeNull();
  });

  it("points to tracking while the donation is not delivered yet", async () => {
    answer(detalleFixture({ estado: "EN_TRANSITO" }));
    await renderDelivery();

    expect(await screen.findByText("Tu donación aún no llega al banco")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Ver seguimiento" })).toBeOnTheScreen();
    expect(rateLink()).toBeNull();
  });

  it("shows an empty state without an id", async () => {
    answer(delivered);
    await renderDelivery("/donante/entrega-donacion");

    await waitFor(() => expect(screen.getByText("No encontramos la donación")).toBeOnTheScreen());
    expect(mockApi.get).not.toHaveBeenCalled();
  });
});
