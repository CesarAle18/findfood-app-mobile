/**
 * Registrar recogida (MOV-43): the pickup confirmation with evidence, product condition,
 * per-item weights and the location or manual confirmation, against the (mocked) API.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Alert, Text } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { DonacionItemDto } from "@/services/donaciones";
import type { EvidenciaConUrlDto } from "@/services/evidencias";
import type { RutaDetalleDto } from "@/services/rutas";
import { CollectionScreen } from "@/screens/volunteer";
import type { ApiMock } from "@/test-utils/api";
import { detalleFixture, paradaFixture, rutaDetalleFixture } from "@/test-utils/fixtures";
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

function itemFixture(overrides: Partial<DonacionItemDto> = {}): DonacionItemDto {
  return {
    id: "item-1",
    descripcion: "Arroz",
    cantidad: 10,
    peso_estimado_kg: 12.5,
    peso_real_kg: null,
    fecha_vencimiento: null,
    requiere_refrigeracion: false,
    observaciones: null,
    tipo_alimento: { id: 1, codigo: "GRANOS", nombre: "Granos" },
    unidad_medida: { id: 1, codigo: "KG", nombre: "Kilogramo" },
    foto_url: null,
    ...overrides,
  };
}

const enSitio = () =>
  rutaDetalleFixture({
    estado: "EN_CURSO",
    paradas: rutaDetalleFixture().paradas.map((parada) =>
      parada.id === "par-1" ? { ...parada, estado: "EN_SITIO" as const } : parada,
    ),
  });

let ruta: RutaDetalleDto;
let evidencias: Partial<EvidenciaConUrlDto>[];
let client: QueryClient;

const ISO = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/);

async function renderCollection(initialUrl = "/pantalla?paradaId=par-1&rutaId=ruta-1") {
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
      pantalla: CollectionScreen,
      "voluntario/rutas": () => <Text>Mis rutas</Text>,
    },
    { initialUrl },
  );
}

/** Picks "Regular" in the product condition select. */
async function pickCondition() {
  await fireEvent.press(await screen.findByRole("button", { name: "Estado del producto *: Selecciona" }));
  await fireEvent.press(screen.getByRole("radio", { name: "Regular" }));
}

beforeEach(() => {
  ruta = enSitio();
  evidencias = [{ id: "ev-1" }];
  mockGetCurrentFix.mockReset().mockResolvedValue({
    ubicacion: { lat: 3.42, lng: -76.54 },
    precision_m: 12,
  });
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path.startsWith("/rutas/")) return ruta;
    if (path.startsWith("/donaciones/")) {
      return detalleFixture({
        items: [itemFixture(), itemFixture({ id: "item-2", descripcion: "Leche", peso_estimado_kg: 3 })],
      });
    }
    if (path === "/evidencias") return evidencias;
    throw new Error(`unexpected GET ${path}`);
  });
  mockApi.post.mockReset().mockResolvedValue({ id: "par-1", ruta_id: "ruta-1", donacion_id: null });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe("CollectionScreen (MOV-43)", () => {
  it("explains how to open it when the stop params are missing (legacy ?id=)", async () => {
    await renderCollection("/pantalla?id=don-1");

    expect(await screen.findByText("Abre la recogida desde tu ruta")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Ver mis rutas" })).toBeOnTheScreen();
  });

  it("says a completed pickup is already registered", async () => {
    ruta = rutaDetalleFixture({
      estado: "EN_CURSO",
      paradas: [paradaFixture({ estado: "COMPLETADA" })],
    });

    await renderCollection();

    expect(await screen.findByText("Recogida registrada")).toBeOnTheScreen();
  });

  it("refuses a pickup of a route that is not in progress", async () => {
    ruta = rutaDetalleFixture();

    await renderCollection();

    expect(await screen.findByText("Esta recogida no se puede registrar")).toBeOnTheScreen();
  });

  it("prefills the estimates, shows the stop position and the live total", async () => {
    await renderCollection();

    expect(await screen.findByDisplayValue("12,5")).toBeOnTheScreen();
    expect(screen.getByText("Parada 1 de 3")).toBeOnTheScreen();
    expect(screen.getByText("Total recogido: 15,5 kg")).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText("Peso real · Leche (kg)"), "4,25");

    expect(screen.getByText("Total recogido: 16,75 kg")).toBeOnTheScreen();
  });

  it("keeps the confirmation disabled until an evidence photo is registered", async () => {
    evidencias = [];

    await renderCollection();

    await screen.findByDisplayValue("12,5");
    expect(screen.getByRole("button", { name: "Confirmar recogida" })).toBeDisabled();
    expect(
      screen.getByText("Adjunta al menos una foto para confirmar la recogida."),
    ).toBeOnTheScreen();
  });

  it("requires the product condition before sending", async () => {
    await renderCollection();

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar recogida" })).toBeEnabled());
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar recogida" }));

    expect(await screen.findByText("Selecciona el estado del producto.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("confirms with exactly the pickup fields and the precise location, then goes to the routes", async () => {
    await renderCollection();

    await pickCondition();
    await fireEvent.changeText(screen.getByLabelText("Observaciones"), " Cajas selladas ");
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar recogida" }));

    expect(mockApi.post).toHaveBeenCalledWith("/paradas/par-1/confirmar", {
      body: {
        confirmada_en_dispositivo: ISO,
        peso_confirmado_kg: 15.5,
        estado_producto: "REGULAR",
        items: [
          { item_id: "item-1", peso_real_kg: 12.5 },
          { item_id: "item-2", peso_real_kg: 3 },
        ],
        observaciones: "Cajas selladas",
        ubicacion: { lat: 3.42, lng: -76.54 },
        precision_m: 12,
      },
    });
    expect(await screen.findByText("Mis rutas")).toBeOnTheScreen();
  });

  it("asks before confirming without a precise fix and sends a manual confirmation", async () => {
    mockGetCurrentFix.mockResolvedValue(null);
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.at(-1)?.onPress?.();
    });

    await renderCollection();

    await pickCondition();
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar recogida" }));

    expect(alert).toHaveBeenCalledWith(
      "Ubicación imprecisa",
      expect.stringContaining("La señal GPS es débil"),
      expect.arrayContaining([expect.objectContaining({ text: "Confirmar sin GPS preciso" })]),
    );
    expect(mockApi.post).toHaveBeenCalledWith("/paradas/par-1/confirmar", {
      body: {
        confirmada_en_dispositivo: ISO,
        peso_confirmado_kg: 15.5,
        estado_producto: "REGULAR",
        items: [
          { item_id: "item-1", peso_real_kg: 12.5 },
          { item_id: "item-2", peso_real_kg: 3 },
        ],
        confirmacion_manual: true,
      },
    });
  });

  it("offers the manual retry when the server finds the precision insufficient", async () => {
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      buttons?.at(-1)?.onPress?.();
    });
    mockApi.post.mockRejectedValueOnce(
      new ApiError({ status: 422, type: "precision-insuficiente", title: "Precisión" }),
    );

    await renderCollection();

    await pickCondition();
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar recogida" }));

    expect(mockApi.post).toHaveBeenCalledTimes(2);
    expect(mockApi.post.mock.calls[1][1]).toEqual({
      body: expect.objectContaining({ confirmacion_manual: true, precision_m: 12 }),
    });
    expect(await screen.findByText("Mis rutas")).toBeOnTheScreen();
  });

  it("shows the server's reason when the confirmation fails", async () => {
    mockApi.post.mockRejectedValue(
      new ApiError({ status: 422, type: "evidencia-requerida", title: "Evidencia" }),
    );

    await renderCollection();

    await pickCondition();
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar recogida" }));

    expect(
      await screen.findByText("Adjunta la evidencia fotográfica para continuar."),
    ).toBeOnTheScreen();
  });
});
