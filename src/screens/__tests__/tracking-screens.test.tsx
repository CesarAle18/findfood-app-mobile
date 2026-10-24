/**
 * Seguimiento, Detalle and Voluntario asignado (MOV-35/36): the state history timeline and
 * the "Contactar voluntario" call, only once the API shares the volunteer's phone.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Linking } from "react-native";

import { api } from "@/api";
import type { EstadoDonacion } from "@/api/types";
import { AssignedVolunteerScreen } from "@/screens/assigned-volunteer";
import {
  TRACKING_POLL_MS,
  pollWhileActive,
  useDonationTracking,
} from "@/screens/donation-queries";
import { DonationDetailScreen, TrackingScreen } from "@/screens/donor";
import type {
  DonacionDetalleDto,
  HistorialEstadoDto,
  SeguimientoDonacionDto,
} from "@/services/donaciones";
import { queryKeys } from "@/services/query-keys";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { DONATION_ID, asignacionFixture, detalleFixture } from "@/test-utils/fixtures";
import { seguimientoDonacionFixture } from "@/test-utils/fixtures/seguimiento";
import { createQueryWrapper, createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockApi = api as unknown as ApiMock;
const detailPath = `/donaciones/${DONATION_ID}`;

function historyRow(overrides: Partial<HistorialEstadoDto>): HistorialEstadoDto {
  return {
    id: 1,
    ambito: "DONACION",
    estado_anterior: null,
    estado_nuevo: "PUBLICADA",
    motivo: null,
    metadata: null,
    created_at: "2026-09-23T18:55:00.000Z",
    donacion_id: DONATION_ID,
    asignacion_id: null,
    parada_id: null,
    usuario_nombres: null,
    lat: null,
    lng: null,
    ...overrides,
  };
}

const HISTORY: HistorialEstadoDto[] = [
  // Out of order on purpose: the timeline sorts by time.
  historyRow({
    id: 2,
    ambito: "ASIGNACION",
    estado_anterior: "OFRECIDA",
    estado_nuevo: "ACEPTADA",
    created_at: "2026-09-23T19:12:00.000Z",
    asignacion_id: "asignacion-1",
    usuario_nombres: "Carlos",
  }),
  historyRow({ id: 1 }),
];

let client: QueryClient;

function answer(detail: DonacionDetalleDto, historial: HistorialEstadoDto[] = HISTORY) {
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === detailPath) return detail;
    if (path === `${detailPath}/historial`) return historial;
    throw new Error(`unexpected GET ${path}`);
  });
}

async function renderScreen(Component: React.ComponentType) {
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
    { _layout: Layout, pantalla: () => <Component /> },
    { initialUrl: `/pantalla?id=${DONATION_ID}` },
  );
}

// Accepted, but the API has not shared the phone yet.
const withoutPhone = detalleFixture({
  asignacion: asignacionFixture({
    voluntario: {
      nombres: "Carlos",
      apellidos: "Ruiz",
      telefono: null,
      placa_vehiculo: null,
      tipo_vehiculo: "Camioneta",
    },
  }),
});

let openURL: jest.SpyInstance;

beforeEach(() => {
  openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
});

afterEach(() => {
  openURL.mockRestore();
  client.clear();
});

describe("TrackingScreen", () => {
  it("calls the volunteer's phone with tel:", async () => {
    answer(detalleFixture());
    await renderScreen(TrackingScreen);

    await fireEvent.press(await screen.findByRole("button", { name: "Contactar voluntario" }));

    expect(openURL).toHaveBeenCalledWith("tel:+573001112233");
  });

  it("explains when the phone app cannot open", async () => {
    openURL.mockRejectedValueOnce(new Error("no handler"));
    answer(detalleFixture());
    await renderScreen(TrackingScreen);

    await fireEvent.press(await screen.findByRole("button", { name: "Contactar voluntario" }));

    expect(
      await screen.findByText("No pudimos abrir la app de llamadas. Marca al +573001112233."),
    ).toBeOnTheScreen();
  });

  it("hides the call until the API shares the phone", async () => {
    answer(withoutPhone);
    await renderScreen(TrackingScreen);

    expect(await screen.findByText("Voluntario: Carlos Ruiz")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Contactar voluntario" })).toBeNull();
  });

  it("shows the state history, oldest first, with who made each change", async () => {
    answer(detalleFixture());
    await renderScreen(TrackingScreen);

    const published = await screen.findByText("Buscando voluntario");
    const accepted = screen.getByText("Asignación: Aceptada");
    expect(published).toBeOnTheScreen();
    expect(screen.getByText("23/09/2026 · 14:12 · Carlos")).toBeOnTheScreen();
    const titles = screen
      .getAllByText(/^(Buscando voluntario|Asignación: Aceptada)$/)
      .map((node) => node.props.children as string);
    expect(titles).toEqual(["Buscando voluntario", "Asignación: Aceptada"]);
    expect(accepted).toBeOnTheScreen();
  });
});

describe("DonationDetailScreen", () => {
  it("shows the state history", async () => {
    answer(detalleFixture({ estado: "RECIBIDA" }));
    await renderScreen(DonationDetailScreen);

    expect(await screen.findByText("Asignación: Aceptada")).toBeOnTheScreen();
    expect(screen.getByText("Historial")).toBeOnTheScreen();
  });

  it("says when there is no history yet", async () => {
    answer(detalleFixture({ estado: "PUBLICADA", asignacion: null }), []);
    await renderScreen(DonationDetailScreen);

    expect(await screen.findByText("Aún no hay movimientos registrados.")).toBeOnTheScreen();
  });
});

describe("AssignedVolunteerScreen", () => {
  it("shows the volunteer, vehicle and plate, and calls them", async () => {
    answer(detalleFixture());
    await renderScreen(AssignedVolunteerScreen);

    expect(await screen.findByText("Camioneta · XYZ987")).toBeOnTheScreen();
    expect(screen.getByText("La ubicación en vivo del voluntario aún no está disponible.")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Contactar voluntario" }));

    expect(openURL).toHaveBeenCalledWith("tel:+573001112233");
  });

  it("hides the call without a phone", async () => {
    answer(withoutPhone);
    await renderScreen(AssignedVolunteerScreen);

    expect(await screen.findByText("Camioneta")).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Contactar voluntario" })).toBeNull(),
    );
  });
});

describe("useDonationTracking", () => {
  const trackingPath = `${detailPath}/seguimiento`;

  function answerTracking(...answers: SeguimientoDonacionDto[]) {
    const queue = [...answers];
    mockApi.get.mockReset().mockImplementation(async (path: string) => {
      if (path === trackingPath) return queue.length > 1 ? queue.shift() : queue[0];
      throw new Error(`unexpected GET ${path}`);
    });
  }

  async function renderTracking(estado: EstadoDonacion) {
    client = createTestQueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");
    const view = await renderHook(() => useDonationTracking(DONATION_ID, estado), {
      wrapper: createQueryWrapper(client),
    });
    return { ...view, invalidate };
  }

  it.each<EstadoDonacion>(["PUBLICADA", "ENTREGADA", "CANCELADA"])(
    "asks nothing while %s: no volunteer is on the way",
    async (estado) => {
      answerTracking(seguimientoDonacionFixture());
      const { result } = await renderTracking(estado);

      expect(result.current.fetchStatus).toBe("idle");
      expect(mockApi.get).not.toHaveBeenCalled();
    },
  );

  it("refreshes the detail and the history once the live window closes", async () => {
    answerTracking(
      seguimientoDonacionFixture(),
      seguimientoDonacionFixture({ activo: false, estado_donacion: "ENTREGADA", fase: null, ruta_id: null }),
    );
    const { result, invalidate } = await renderTracking("EN_RECOLECCION");
    await waitFor(() => expect(result.current.data?.activo).toBe(true));
    expect(mockApi.get).toHaveBeenCalledWith(trackingPath, { signal: expect.anything() });
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() =>
      expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
        queryKeys.donaciones.detail(DONATION_ID),
        queryKeys.donaciones.historial(DONATION_ID),
      ]),
    );
  });

  it("refreshes the detail when the volunteer picks the donation up (new state, still live)", async () => {
    answerTracking(
      seguimientoDonacionFixture(),
      seguimientoDonacionFixture({ estado_donacion: "EN_TRANSITO", fase: "HACIA_BANCO" }),
    );
    const { result, invalidate } = await renderTracking("EN_RECOLECCION");
    await waitFor(() => expect(result.current.data?.fase).toBe("HACIA_RECOGIDA"));

    await act(async () => {
      await result.current.refetch();
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.donaciones.detail(DONATION_ID),
      queryKeys.donaciones.historial(DONATION_ID),
    ]);
  });

  it("polls every 30 s only while active", () => {
    const poll = (activo?: boolean) =>
      pollWhileActive({
        state: { data: activo === undefined ? undefined : seguimientoDonacionFixture({ activo }) },
      });
    expect(TRACKING_POLL_MS).toBe(30_000);
    expect(poll(true)).toBe(TRACKING_POLL_MS);
    expect(poll(false)).toBe(false);
    expect(poll()).toBe(false);
  });
});
