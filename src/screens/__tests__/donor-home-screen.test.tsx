/**
 * Inicio donante: impact metrics, the latest donation, the tracking count and the recent
 * activity, each from its own (mocked) endpoint.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useLocalSearchParams } from "expo-router";
import { fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import type { MeDto } from "@/api/types";
import { DonorHomeScreen } from "@/screens/donor";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import {
  DONATION_ID,
  bandejaFixture,
  impactoFixture,
  meFixture,
  notificacionFixture,
  pageFixture,
  resumenFixture,
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
    activeRole: "DONANTE",
    canDonor: true,
    canVolunteer: true,
    setActiveRole: () => {},
  }),
}));

const mockApi = api as unknown as ApiMock;

/** 13/10/2026 10:00 in Bogotá: one hour after the inbox fixture. */
const NOW = Date.UTC(2026, 9, 13, 15, 0);

type Query = { limite?: number; desplazamiento?: number } | undefined;

/** `/donaciones` answers the latest (limite 1) and the paged list alike. */
function answerGets({
  donaciones,
  impacto = impactoFixture(),
  bandeja = bandejaFixture([notificacionFixture()]),
}: {
  donaciones: ReturnType<typeof pageFixture>;
  impacto?: unknown;
  bandeja?: unknown;
}) {
  mockApi.get.mockImplementation(async (path: string, options?: { query?: Query }) => {
    if (path === "/donaciones") {
      return options?.query?.limite === 1
        ? { ...donaciones, datos: donaciones.datos.slice(0, 1) }
        : donaciones;
    }
    if (path === "/me/impacto") {
      if (impacto instanceof Error) throw impacto;
      return impacto;
    }
    if (path === "/me/notificaciones") return bandeja;
    if (path.startsWith("/me/notificaciones/")) return undefined;
    throw new Error(`unexpected GET ${path}`);
  });
}

let client: QueryClient;

function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Detalle {id}</Text>;
}

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
    { _layout: Layout, pantalla: DonorHomeScreen, "donante/entrega-donacion": Detail },
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

const donations = pageFixture(
  [
    resumenFixture(),
    resumenFixture({ id: "uuid-2", codigo: "DON-1057", estado: "PUBLICADA" }),
    resumenFixture({ id: "uuid-3", codigo: "DON-1051", estado: "RECIBIDA" }),
  ],
  12,
);

describe("DonorHomeScreen", () => {
  it("shows the impact, the tracking count and the latest donation", async () => {
    answerGets({ donaciones: donations });

    await renderHome();

    expect(await screen.findByText("4")).toBeOnTheScreen();
    expect(screen.getByText("entregadas")).toBeOnTheScreen();
    expect(screen.getByText("12")).toBeOnTheScreen();
    expect(screen.getByText("280 kg")).toBeOnTheScreen();
    // ASIGNADA and PUBLICADA of the loaded list.
    expect(await screen.findByText("2")).toBeOnTheScreen();
    expect(screen.getByText("en seguimiento")).toBeOnTheScreen();
    expect(await screen.findByText("DON-1058")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Hacer seguimiento" })).toBeOnTheScreen();
    expect(mockApi.get).toHaveBeenCalledWith("/donaciones", {
      query: { limite: 1 },
      signal: expect.any(AbortSignal),
    });
  });

  it("falls back to the account totals while the impact cannot load", async () => {
    answerGets({ donaciones: donations, impacto: new Error("offline") });
    mockMe.data = meFixture({
      donante: {
        id: "donante-1",
        activo: true,
        total_donaciones: 7,
        total_kg_donados: 90,
        calificacion_promedio: null,
      },
    });

    await renderHome();

    expect(await screen.findByText("7")).toBeOnTheScreen();
    expect(screen.getByText("90 kg")).toBeOnTheScreen();
  });

  it("lists the five newest notifications and opens one", async () => {
    const rows = Array.from({ length: 7 }, (_, i) =>
      notificacionFixture({ id: `n-${i}`, titulo: `Aviso ${i}` }),
    );
    answerGets({ donaciones: donations, bandeja: bandejaFixture(rows) });

    await renderHome();

    expect(await screen.findByText("Aviso 0")).toBeOnTheScreen();
    expect(screen.getByText("Aviso 4")).toBeOnTheScreen();
    expect(screen.queryByText("Aviso 5")).toBeNull();
    expect(
      screen.getAllByText("El banco de alimentos recibió tu donación. · Hace 1 h"),
    ).toHaveLength(5);

    await fireEvent.press(screen.getByText("Aviso 0"));

    expect(await screen.findByText(`Detalle ${DONATION_ID}`)).toBeOnTheScreen();
    expect(mockApi.post).toHaveBeenCalledWith("/me/notificaciones/n-0/leer");
  });

  it("hides the volunteer invitation once the volunteer profile is approved", async () => {
    answerGets({ donaciones: donations });

    await renderHome();

    expect(await screen.findByText("DON-1058")).toBeOnTheScreen();
    expect(screen.queryByText("¿Quieres ser voluntario?")).toBeNull();
  });

  it.each(["PENDIENTE", "RECHAZADA"] as const)(
    "invites to volunteer while the request is %s",
    async (estado) => {
      answerGets({ donaciones: donations });
      const me = meFixture();
      mockMe.data = { ...me, voluntario: { ...me.voluntario!, estado_verificacion: estado } };

      await renderHome();

      expect(await screen.findByText("¿Quieres ser voluntario?")).toBeOnTheScreen();
    },
  );

  it("invites to volunteer without a volunteer profile", async () => {
    answerGets({ donaciones: donations });
    mockMe.data = meFixture({ roles: ["DONANTE"], voluntario: null });

    await renderHome();

    expect(await screen.findByText("¿Quieres ser voluntario?")).toBeOnTheScreen();
  });

  it("invites to donate without donations nor activity", async () => {
    answerGets({ donaciones: pageFixture([]), bandeja: bandejaFixture([]) });

    await renderHome();

    expect(await screen.findByText("Aún no tienes donaciones")).toBeOnTheScreen();
    expect(await screen.findByText("Aún no tienes actividad reciente.")).toBeOnTheScreen();
  });
});
