/**
 * Entrega en banco (MOV-44): the delivery confirmation that closes the route and the
 * completed summary with the donors to rate, against the (mocked) API.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useLocalSearchParams } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { RutaDetalleDto } from "@/services/rutas";
import { DeliveryScreen } from "@/screens/donations";
import type { ApiMock } from "@/test-utils/api";
import { rutaDetalleFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockGetCurrentFix = jest.fn();

jest.mock("@/location/current-fix", () => ({
  ...jest.requireActual<typeof import("@/location/current-fix")>("@/location/current-fix"),
  getCurrentFix: (...args: unknown[]) => mockGetCurrentFix(...args),
}));

const mockApi = api as unknown as ApiMock;

const base = rutaDetalleFixture().paradas;

/** In progress: the first pickup collected, the second failed, at the bank. */
const atTheBank = () =>
  rutaDetalleFixture({
    estado: "EN_CURSO",
    paradas: [
      { ...base[0], estado: "COMPLETADA", peso_confirmado_kg: 40.5 },
      { ...base[1], estado: "FALLIDA" },
      { ...base[2], estado: "EN_SITIO" },
    ],
  });

const completed = (): RutaDetalleDto => ({
  ...atTheBank(),
  estado: "COMPLETADA",
  finalizada_at: "2026-10-13T22:30:00Z",
  duracion_real_min: 75,
  paradas: atTheBank().paradas.map((parada) =>
    parada.tipo === "ENTREGA" ? { ...parada, estado: "COMPLETADA" as const } : parada,
  ),
});

let rutas: RutaDetalleDto[];
let client: QueryClient;

function RatingParams() {
  const params = useLocalSearchParams();
  return <Text>{`calificar ${JSON.stringify(params)}`}</Text>;
}

async function renderDelivery(initialUrl = "/pantalla?paradaId=par-3&rutaId=ruta-1") {
  client = createTestQueryClient();
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <Slot />
      </QueryClientProvider>
    );
  }
  await renderRouter(
    {
      _layout: Layout,
      pantalla: DeliveryScreen,
      voluntario: () => <Text>Inicio</Text>,
      "voluntario/rutas": () => <Text>Mis rutas</Text>,
      "voluntario/calificar-donante": RatingParams,
    },
    { initialUrl },
  );
}

beforeEach(() => {
  // Each GET of the route answers the next state; the last one repeats.
  rutas = [atTheBank()];
  mockGetCurrentFix.mockReset().mockResolvedValue({
    ubicacion: { lat: 3.46, lng: -76.52 },
    precision_m: 8,
  });
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path.startsWith("/rutas/")) return rutas.length > 1 ? rutas.shift() : rutas[0];
    if (path === "/evidencias") return [{ id: "ev-1" }];
    throw new Error(`unexpected GET ${path}`);
  });
  mockApi.post.mockReset().mockResolvedValue({ id: "par-3", ruta_id: "ruta-1", donacion_id: null });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe("DeliveryScreen (MOV-44)", () => {
  it("explains how to open it without the stop params", async () => {
    await renderDelivery("/pantalla");

    expect(await screen.findByText("Abre la entrega desde tu ruta")).toBeOnTheScreen();
  });

  it("shows the warehouse, the pickup outcomes and the collected weight", async () => {
    await renderDelivery();

    expect(
      await screen.findByText("Bodega Norte · Carrera 1 # 40-10, Cali"),
    ).toBeOnTheScreen();
    expect(screen.getByText("Ruta R-045")).toBeOnTheScreen();
    expect(screen.getByText("1 completadas · 1 fallidas · 0 omitidas")).toBeOnTheScreen();
    expect(screen.getByText("40,5 kg")).toBeOnTheScreen();
  });

  it("confirms without pickup fields and shows the completed route with the donors to rate", async () => {
    rutas = [atTheBank(), completed()];

    await renderDelivery();

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar entrega" })).toBeEnabled());
    await fireEvent.changeText(screen.getByLabelText("Observaciones"), "Recibió Ana");
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar entrega" }));

    expect(mockApi.post).toHaveBeenCalledWith("/paradas/par-3/confirmar", {
      body: {
        confirmada_en_dispositivo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
        observaciones: "Recibió Ana",
        ubicacion: { lat: 3.46, lng: -76.52 },
        precision_m: 8,
      },
    });
    expect(await screen.findByText("Ruta R-045 completada")).toBeOnTheScreen();
    expect(screen.getByText("1 recogida · 40,5 kg entregados")).toBeOnTheScreen();
    expect(screen.getByText("Duración: 1 h 15 min")).toBeOnTheScreen();
    expect(screen.getByText("Laura Gómez")).toBeOnTheScreen();
    // The failed pickup has nothing to rate.
    expect(screen.queryByText("Panadería Delicias")).toBeNull();

    await fireEvent.press(screen.getByRole("link", { name: "Calificar a Laura Gómez" }));

    expect(await screen.findByText(/calificar .*7d4f6a1e/)).toBeOnTheScreen();
  });

  it("keeps the summary when the completed route is opened again", async () => {
    rutas = [completed()];

    await renderDelivery();

    expect(await screen.findByText("Ruta R-045 completada")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Confirmar entrega" })).toBeNull();
  });

  it("sends the volunteer back to the route while pickups are still open", async () => {
    mockApi.post.mockRejectedValue(
      new ApiError({ status: 409, type: "recogidas-pendientes", title: "Pendientes" }),
    );

    await renderDelivery();

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar entrega" })).toBeEnabled());
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar entrega" }));

    expect(
      await screen.findByText("Todavía hay recogidas pendientes en la ruta."),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("link", { name: "Volver a la ruta" }));
    expect(await screen.findByText("Mis rutas")).toBeOnTheScreen();
  });
});
