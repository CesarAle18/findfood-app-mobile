/**
 * Inicio voluntario (MOV-40): today's summary, the next route, the live offer banner and the
 * recent activity, each from its own (mocked) endpoint.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { MeDto } from "@/api/types";
import type { OfertaDto } from "@/services/asignaciones";
import type { RutaDetalleDto, RutaResumenDto } from "@/services/rutas";
import { HomeScreen } from "@/screens/home";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import {
  bandejaFixture,
  meFixture,
  notificacionFixture,
  ofertaAceptadaFixture,
  ofertaFixture,
  pageFixture,
  paradaFixture,
  rutaDetalleFixture,
  rutaResumenFixture,
} from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockMe = {
  data: undefined as MeDto | undefined,
  error: null as unknown,
  isFetching: false,
  refetch: jest.fn(async () => {}),
};

jest.mock("@/state/session", () => ({
  useMe: () => mockMe,
  useAccess: () => ({
    phase: "app",
    activeRole: "VOLUNTARIO",
    canDonor: false,
    canVolunteer: true,
    setActiveRole: () => {},
  }),
}));

const mockApi = api as unknown as ApiMock;

/** 13/10/2026 10:00 in Bogotá: one hour after the inbox fixture. */
const NOW = Date.UTC(2026, 9, 13, 15, 0);

type Query = { estado?: string } | undefined;

function answerGets({
  enCurso = [],
  planificadas = [],
  detalle = rutaDetalleFixture(),
  ofertas = [],
  bandeja = bandejaFixture([notificacionFixture()]),
}: {
  enCurso?: RutaResumenDto[];
  planificadas?: RutaResumenDto[];
  detalle?: RutaDetalleDto;
  ofertas?: OfertaDto[];
  bandeja?: unknown;
}) {
  mockApi.get.mockImplementation(async (path: string, options?: { query?: Query }) => {
    if (path === "/rutas") {
      return options?.query?.estado === "EN_CURSO" ? pageFixture(enCurso) : pageFixture(planificadas);
    }
    if (path.startsWith("/rutas/")) return detalle;
    if (path === "/asignaciones/ofertas") return ofertas;
    if (path === "/me/notificaciones") return bandeja;
    throw new Error(`unexpected GET ${path}`);
  });
}

let client: QueryClient;

async function renderHome() {
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
      pantalla: HomeScreen,
      "voluntario/rutas": () => <Text>Mis rutas</Text>,
      "voluntario/oferta": () => <Text>Pantalla de oferta</Text>,
    },
    { initialUrl: "/pantalla" },
  );
}

beforeEach(() => {
  jest.spyOn(Date, "now").mockReturnValue(NOW);
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue(undefined);
  mockMe.data = meFixture();
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
});

describe("HomeScreen (voluntario)", () => {
  it("summarizes today's routes and shows the next one", async () => {
    answerGets({
      enCurso: [rutaResumenFixture({ estado: "EN_CURSO" })],
      planificadas: [rutaResumenFixture({ id: "ruta-2", codigo: "R-046" })],
      detalle: rutaDetalleFixture({
        estado: "EN_CURSO",
        paradas: [
          paradaFixture({ id: "p1", orden: 1, estado: "COMPLETADA" }),
          paradaFixture({ id: "p2", orden: 2 }),
          paradaFixture({ id: "p3", orden: 3, tipo: "ENTREGA" }),
        ],
      }),
    });

    await renderHome();

    expect(await screen.findByText("R-045")).toBeOnTheScreen();
    expect(screen.getByText("En progreso")).toBeOnTheScreen();
    expect(screen.getByText("rutas activas")).toBeOnTheScreen();
    expect(await screen.findByLabelText("2 rutas activas")).toBeOnTheScreen();
    expect(screen.getByLabelText("2 paradas pendientes")).toBeOnTheScreen();
    expect(screen.getByText("13/10/2026 · 3 paradas")).toBeOnTheScreen();
    expect(screen.getByText("Peso estimado: 70 kg")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("link", { name: "Ver ruta" }));
    expect(await screen.findByText("Mis rutas")).toBeOnTheScreen();
  });

  it("invites to build a route from the accepted pickups", async () => {
    answerGets({
      ofertas: [ofertaAceptadaFixture(), ofertaAceptadaFixture({ id: "asg-9" })],
    });

    await renderHome();

    expect(await screen.findByText("Tienes 2 recogidas aceptadas")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Armar ruta" })).toBeOnTheScreen();
    expect(screen.getByLabelText("0 rutas activas")).toBeOnTheScreen();
    expect(screen.getByLabelText("0 paradas pendientes")).toBeOnTheScreen();
  });

  it("says when there is no route nor accepted pickup", async () => {
    answerGets({});

    await renderHome();

    expect(await screen.findByText("Sin rutas programadas")).toBeOnTheScreen();
    expect(screen.queryByText("Tienes una oferta nueva")).toBeNull();
  });

  it("announces live offers and opens them", async () => {
    answerGets({ ofertas: [ofertaFixture(), ofertaFixture({ id: "asg-10" })] });

    await renderHome();

    expect(await screen.findByText("Tienes 2 ofertas nuevas")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("link", { name: "Ver oferta" }));
    expect(await screen.findByText("Pantalla de oferta")).toBeOnTheScreen();
  });

  it("lists the five newest notifications and opens one", async () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      notificacionFixture({
        id: `n-${i}`,
        titulo: `Aviso ${i}`,
        tipo: "ASIGNACION_OFRECIDA",
        donacion_id: null,
        asignacion_id: "asg-7",
      }),
    );
    answerGets({ bandeja: bandejaFixture(rows) });

    await renderHome();

    expect(await screen.findByText("Aviso 0")).toBeOnTheScreen();
    expect(screen.getByText("Aviso 4")).toBeOnTheScreen();
    expect(screen.queryByText("Aviso 5")).toBeNull();

    await fireEvent.press(screen.getByText("Aviso 0"));

    expect(await screen.findByText("Pantalla de oferta")).toBeOnTheScreen();
    expect(mockApi.post).toHaveBeenCalledWith("/me/notificaciones/n-0/leer");
  });

  it("says when there is no activity yet", async () => {
    answerGets({ bandeja: bandejaFixture([]) });

    await renderHome();

    expect(await screen.findByText("Aún no tienes actividad")).toBeOnTheScreen();
  });

  it("reports an offers error instead of an empty schedule, and retries it", async () => {
    answerGets({});
    const answer = mockApi.get.getMockImplementation();
    let offersFail = true;
    mockApi.get.mockImplementation(async (path: string, options?: { query?: Query }) => {
      if (path === "/asignaciones/ofertas" && offersFail) {
        throw new ApiError({ status: 500, type: "error-interno", title: "Error" });
      }
      return answer?.(path, options);
    });

    await renderHome();

    expect(await screen.findByText("No pudimos cargar tus ofertas")).toBeOnTheScreen();
    expect(screen.queryByText("Sin rutas programadas")).toBeNull();

    offersFail = false;
    answerGets({ ofertas: [ofertaAceptadaFixture()] });
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByRole("link", { name: "Armar ruta" })).toBeOnTheScreen();
  });
});
