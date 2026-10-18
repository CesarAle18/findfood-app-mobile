/**
 * Rutas (MOV-42): build a route from the accepted pickups, start or cancel the planned one,
 * and drive the next stop of the route in progress, each against the (mocked) API.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useLocalSearchParams } from "expo-router";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Alert, Text } from "react-native";

import { api } from "@/api";
import type { OfertaDto } from "@/services/asignaciones";
import type { RutaDetalleDto, RutaResumenDto } from "@/services/rutas";
import { ActiveRouteScreen } from "@/screens/route";
import type { ApiMock } from "@/test-utils/api";
import {
  catalogosFixture,
  detalleFixture,
  ofertaAceptadaFixture,
  ofertaFixture,
  pageFixture,
  rutaDetalleFixture,
  rutaResumenFixture,
} from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockGetCurrentFix = jest.fn();

jest.mock("@/location/current-fix", () => ({
  getCurrentFix: (...args: unknown[]) => mockGetCurrentFix(...args),
}));

const mockApi = api as unknown as ApiMock;

type Query = { estado?: string } | undefined;

function answerGets({
  enCurso = [],
  planificadas = [],
  detalle = rutaDetalleFixture(),
  ofertas = [],
}: {
  enCurso?: RutaResumenDto[];
  planificadas?: RutaResumenDto[];
  detalle?: RutaDetalleDto;
  ofertas?: OfertaDto[];
}) {
  mockApi.get.mockImplementation(async (path: string, options?: { query?: Query }) => {
    if (path === "/rutas") {
      return options?.query?.estado === "EN_CURSO" ? pageFixture(enCurso) : pageFixture(planificadas);
    }
    if (path.startsWith("/rutas/")) return detalle;
    if (path === "/asignaciones/ofertas") return ofertas;
    if (path === "/catalogos") return catalogosFixture;
    if (path.startsWith("/donaciones/")) return detalleFixture();
    throw new Error(`unexpected GET ${path}`);
  });
}

/** Shows the params a stop action navigated with. */
function ParamsScreen({ name }: { name: string }) {
  const params = useLocalSearchParams();
  return <Text>{`${name} ${JSON.stringify(params)}`}</Text>;
}

let client: QueryClient;

async function renderRoutes() {
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
      pantalla: ActiveRouteScreen,
      "voluntario/oferta": () => <Text>Pantalla de oferta</Text>,
      "voluntario/registrar-recogida": () => <ParamsScreen name="recogida" />,
      "voluntario/entrega-voluntario": () => <ParamsScreen name="entrega" />,
      "voluntario/detalle-donacion": () => <ParamsScreen name="detalle" />,
    },
    { initialUrl: "/pantalla" },
  );
}

/** Answers every native confirmation with its last (confirming) button. */
function autoConfirm() {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });
}

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue(rutaDetalleFixture());
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe("ActiveRouteScreen · build a route", () => {
  const accepted = [
    ofertaAceptadaFixture({ id: "asg-8", donacion_id: "don-a", codigo: "DON-1" }),
    ofertaAceptadaFixture({ id: "asg-9", donacion_id: "don-b", codigo: "DON-2" }),
  ];

  it("preselects the accepted pickups and creates the route with exactly their ids", async () => {
    answerGets({ ofertas: [...accepted, ofertaFixture({ id: "asg-1" })] });

    await renderRoutes();

    expect(await screen.findByText("DON-1")).toBeOnTheScreen();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(2);
    for (const box of boxes) expect(box).toBeChecked();

    await fireEvent.press(screen.getByRole("button", { name: "Crear ruta (2)" }));

    expect(mockApi.post).toHaveBeenCalledWith("/rutas", {
      body: { donacion_ids: ["don-a", "don-b"] },
    });
  });

  it("leaves out a pickup the volunteer unchecks", async () => {
    answerGets({ ofertas: accepted });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("checkbox", { name: /DON-1/ }));
    expect(screen.getByRole("checkbox", { name: /DON-1/ })).not.toBeChecked();
    await fireEvent.press(screen.getByRole("button", { name: "Crear ruta (1)" }));

    expect(mockApi.post).toHaveBeenCalledWith("/rutas", { body: { donacion_ids: ["don-b"] } });
  });

  it("blocks more than five pickups before calling the API", async () => {
    answerGets({
      ofertas: Array.from({ length: 6 }, (_, i) =>
        ofertaAceptadaFixture({ id: `asg-${i}`, donacion_id: `don-${i}`, codigo: `DON-${i}` }),
      ),
    });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("button", { name: "Crear ruta (6)" }));

    expect(screen.getByText("Una ruta admite como máximo 5 recogidas.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("blocks pickups bound to different warehouses", async () => {
    answerGets({
      ofertas: [accepted[0], { ...accepted[1], almacen_id: "alm-2" }],
    });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("button", { name: "Crear ruta (2)" }));

    expect(screen.getByText(/van a almacenes distintos/)).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("sends the volunteer to the offers without accepted pickups", async () => {
    answerGets({ ofertas: [ofertaFixture()] });

    await renderRoutes();

    expect(await screen.findByText("No tienes recogidas aceptadas")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("link", { name: "Ver ofertas" }));
    expect(await screen.findByText("Pantalla de oferta")).toBeOnTheScreen();
  });
});

describe("ActiveRouteScreen · planned route", () => {
  it("shows the route and its stops, and starts it", async () => {
    answerGets({ planificadas: [rutaResumenFixture()] });

    await renderRoutes();

    expect(await screen.findByText("R-045")).toBeOnTheScreen();
    expect(screen.getByText("Planificada")).toBeOnTheScreen();
    expect(screen.getByText("Bodega Norte")).toBeOnTheScreen();
    expect(screen.getAllByText("Pendiente")).toHaveLength(3);

    await fireEvent.press(screen.getByRole("button", { name: "Iniciar ruta" }));

    expect(mockApi.post).toHaveBeenCalledWith("/rutas/ruta-1/iniciar");
  });

  it("cancels it after a native confirmation", async () => {
    const alert = autoConfirm();
    answerGets({ planificadas: [rutaResumenFixture()] });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("button", { name: "Cancelar ruta" }));

    expect(alert).toHaveBeenCalled();
    expect(mockApi.post).toHaveBeenCalledWith("/rutas/ruta-1/cancelar");
  });

  it("lists the accepted pickups still without a route below it", async () => {
    answerGets({
      planificadas: [rutaResumenFixture()],
      ofertas: [ofertaAceptadaFixture({ codigo: "DON-7" })],
    });

    await renderRoutes();

    expect(await screen.findByText("Aceptadas sin ruta")).toBeOnTheScreen();
    expect(screen.getByText("DON-7")).toBeOnTheScreen();
  });
});

describe("ActiveRouteScreen · route in progress", () => {
  const enCurso = [rutaResumenFixture({ estado: "EN_CURSO" })];
  const withStops = (...paradas: RutaDetalleDto["paradas"]) =>
    rutaDetalleFixture({ estado: "EN_CURSO", paradas });
  const [first, second, entrega] = rutaDetalleFixture().paradas;

  it("registers the arrival at a pending pickup with the current position", async () => {
    mockGetCurrentFix.mockResolvedValue({ ubicacion: { lat: 3.42, lng: -76.54 }, precision_m: 12 });
    answerGets({ enCurso, detalle: withStops(first, second, entrega) });

    await renderRoutes();

    expect(await screen.findByText("Próxima parada")).toBeOnTheScreen();
    expect(screen.getByText("1 de 3")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Contactar al donante" })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Llegué al punto" }));

    expect(mockApi.post).toHaveBeenCalledWith("/paradas/par-1/llegada", {
      body: { ubicacion: { lat: 3.42, lng: -76.54 } },
    });
  });

  it("registers the arrival without a position when there is no fix", async () => {
    mockGetCurrentFix.mockResolvedValue(null);
    answerGets({ enCurso, detalle: withStops(first, second, entrega) });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("button", { name: "Llegué al punto" }));

    expect(mockApi.post).toHaveBeenCalledWith("/paradas/par-1/llegada", { body: {} });
  });

  it("opens the pickup registration once on site", async () => {
    answerGets({ enCurso, detalle: withStops({ ...first, estado: "EN_SITIO" }, second, entrega) });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("link", { name: "Registrar recogida" }));

    expect(
      await screen.findByText('recogida {"paradaId":"par-1","rutaId":"ruta-1"}'),
    ).toBeOnTheScreen();
  });

  it("opens the donation detail of the pickup", async () => {
    answerGets({ enCurso, detalle: withStops(first, second, entrega) });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("link", { name: "Ver detalle" }));

    expect(await screen.findByText(/^detalle .*7d4f6a1e/)).toBeOnTheScreen();
  });

  it("drives the delivery once every pickup is closed", async () => {
    mockGetCurrentFix.mockResolvedValue(null);
    const done = { estado: "COMPLETADA" } as const;
    answerGets({ enCurso, detalle: withStops({ ...first, ...done }, { ...second, ...done }, entrega) });

    await renderRoutes();

    expect(screen.queryByRole("button", { name: "Reportar problema" })).toBeNull();
    await fireEvent.press(await screen.findByRole("button", { name: "Llegué al banco" }));
    expect(mockApi.post).toHaveBeenCalledWith("/paradas/par-3/llegada", { body: {} });
  });

  it("opens the delivery registration once at the bank", async () => {
    const done = { estado: "COMPLETADA" } as const;
    answerGets({
      enCurso,
      detalle: withStops({ ...first, ...done }, { ...second, ...done }, { ...entrega, estado: "EN_SITIO" }),
    });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("link", { name: "Registrar entrega" }));

    expect(
      await screen.findByText('entrega {"paradaId":"par-3","rutaId":"ruta-1"}'),
    ).toBeOnTheScreen();
  });

  it("reports a failed pickup with a valid description only", async () => {
    const alert = autoConfirm();
    answerGets({ enCurso, detalle: withStops(first, second, entrega) });

    await renderRoutes();

    await fireEvent.press(await screen.findByRole("button", { name: "Reportar problema" }));
    await fireEvent.press(await screen.findByRole("button", { name: /^Tipo de problema/ }));
    await fireEvent.press(screen.getByRole("radio", { name: "El donante no estaba" }));
    await fireEvent.changeText(screen.getByLabelText(/^Descripción/), "Nada");
    await fireEvent.press(screen.getByRole("button", { name: "Reportar parada fallida" }));

    expect(screen.getByText("Describe el problema con al menos 5 caracteres.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText(/^Descripción/), " No abrió la puerta ");
    await fireEvent.press(screen.getByRole("button", { name: "Reportar parada fallida" }));

    expect(alert).toHaveBeenCalled();
    expect(mockApi.post).toHaveBeenCalledWith("/paradas/par-1/fallida", {
      body: { tipo_incidencia_id: 61, descripcion: "No abrió la puerta" },
    });
  });
});
