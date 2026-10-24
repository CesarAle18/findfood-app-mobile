/**
 * Seguimiento, Detalle and Voluntario asignado (MOV-35/36): the state history timeline and
 * the "Contactar voluntario" call, only once the API shares the volunteer's phone. Seguimiento
 * also follows the volunteer live (API-06) while the donation is on its way.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Linking } from "react-native";

import { api } from "@/api";
import type { EstadoDonacion } from "@/api/types";
import * as auth from "@/auth/supabase";
import { AssignedVolunteerScreen } from "@/screens/assigned-volunteer";
import {
  TRACKING_IDLE_POLL_MS,
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

// No Realtime unless a test plugs in a fake client (`__esModule` lets `replaceProperty` reach
// the screen); the live map then shows the position the tracking poll returns.
jest.mock("@/auth/supabase", () => ({ __esModule: true, supabase: null }));

// A build with the Maps key, so the live map draws its markers instead of the placeholder.
jest.mock("@/config/maps", () => ({ hasGoogleMapsKey: () => true }));

const mockApi = api as unknown as ApiMock;
const detailPath = `/donaciones/${DONATION_ID}`;
const trackingPath = `${detailPath}/seguimiento`;

/** Assigned, but the volunteer has not started the route: outside the live window. */
const NOT_LIVE = seguimientoDonacionFixture({
  estado_donacion: "ASIGNADA",
  activo: false,
  fase: null,
  ruta_id: null,
  voluntario_posicion: null,
  tramo: null,
});

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

function answer(
  detail: DonacionDetalleDto,
  historial: HistorialEstadoDto[] = HISTORY,
  seguimiento: SeguimientoDonacionDto = NOT_LIVE,
) {
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === detailPath) return detail;
    if (path === `${detailPath}/historial`) return historial;
    if (path === trackingPath) return seguimiento;
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

describe("TrackingScreen · En vivo", () => {
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const onTheWay = detalleFixture({ estado: "EN_RECOLECCION" });
  const live = (overrides: Partial<SeguimientoDonacionDto> = {}) =>
    seguimientoDonacionFixture({
      voluntario_posicion: { lat: 4.67, lng: -74.05, at: minutesAgo(5), fuente: "ULTIMA_UBICACION" },
      ...overrides,
    });

  type Broadcast = (message: { payload: unknown }) => void;
  type StatusCallback = (status: string, error?: Error) => void;

  /** A Realtime client whose channel answers `onSubscribe` as soon as the screen joins. */
  function plugRealtime(onSubscribe: (emit: (payload: unknown) => void, report: StatusCallback) => void) {
    interface ChannelMock {
      on: jest.Mock<ChannelMock, [string, object, Broadcast]>;
      subscribe: jest.Mock<ChannelMock, [StatusCallback]>;
    }
    let broadcast: Broadcast = () => {};
    const channel: ChannelMock = {
      on: jest.fn((_type: string, _filter: object, handler: Broadcast) => {
        broadcast = handler;
        return channel;
      }),
      subscribe: jest.fn((callback: StatusCallback) => {
        onSubscribe((payload) => broadcast({ payload }), callback);
        return channel;
      }),
    };
    const fake = { channel: jest.fn(() => channel), removeChannel: jest.fn(async () => "ok") };
    return { fake, restore: jest.replaceProperty(auth, "supabase", fake as never).restore };
  }

  it("shows the map and when the volunteer reaches the pickup point", async () => {
    answer(onTheWay, HISTORY, live());
    await renderScreen(TrackingScreen);

    expect(
      await screen.findByText("Llega a tu punto de recogida hacia las 16:40 (~12 min)"),
    ).toBeOnTheScreen();
    expect(screen.getByText("En vivo")).toBeOnTheScreen();
    for (const testID of ["donor-map-volunteer", "donor-map-pickup", "donor-map-bank", "donor-map-leg"]) {
      expect(screen.getByTestId(testID)).toBeOnTheScreen();
    }
    expect(screen.getByTestId("donor-map-volunteer").props.coordinate).toEqual({
      latitude: 4.67,
      longitude: -74.05,
    });
    // Only the last stored sample: the donor sees how old it is.
    expect(screen.getByText("Última ubicación hace 5 min")).toBeOnTheScreen();
    expect(mockApi.get).toHaveBeenCalledWith(trackingPath, { signal: expect.anything() });
  });

  it("names the bank on the second leg and flags an estimate without traffic", async () => {
    const base = live();
    answer(
      detalleFixture({ estado: "EN_TRANSITO" }),
      HISTORY,
      live({
        estado_donacion: "EN_TRANSITO",
        fase: "HACIA_BANCO",
        tramo: { ...base.tramo!, proveedor: "ESTIMADO" },
      }),
    );
    await renderScreen(TrackingScreen);

    expect(
      await screen.findByText("Lleva tu donación a Bodega Norte · llega hacia las 16:40 aprox. (~12 min)"),
    ).toBeOnTheScreen();
  });

  it("only counts the stops before the donor's, without an arrival time", async () => {
    answer(onTheWay, HISTORY, live({ paradas_antes: 2, tramo: null }));
    await renderScreen(TrackingScreen);

    expect(await screen.findByText("Tiene 2 paradas antes de tu punto")).toBeOnTheScreen();
    expect(screen.queryByText(/hacia las/)).toBeNull();
    expect(screen.queryByTestId("donor-map-leg")).toBeNull();
  });

  it("waits for the volunteer's position when there is none yet", async () => {
    answer(onTheWay, HISTORY, live({ voluntario_posicion: null, tramo: null }));
    await renderScreen(TrackingScreen);

    expect(await screen.findByText("Esperando la ubicación del voluntario")).toBeOnTheScreen();
    expect(screen.getByTestId("donor-map-pickup")).toBeOnTheScreen();
    expect(screen.queryByTestId("donor-map-volunteer")).toBeNull();
  });

  it("moves the marker with the live position when it is newer than the stored one", async () => {
    const realtime = plugRealtime((emit, report) => {
      report("SUBSCRIBED");
      emit({ lat: 4.66, lng: -74.055, rumbo: 200, velocidad_kmh: 25, precision_m: 5, at: minutesAgo(0) });
    });
    try {
      answer(onTheWay, HISTORY, live());
      await renderScreen(TrackingScreen);

      await screen.findByText("En vivo");
      expect(realtime.fake.channel).toHaveBeenCalledWith("ruta:ruta-1", { config: { private: true } });
      await waitFor(
        () =>
          expect(screen.getByTestId("donor-map-volunteer").props.coordinate).toEqual({
            latitude: 4.66,
            longitude: -74.055,
          }),
        { timeout: 3000 },
      );
      expect(screen.getByTestId("donor-map-volunteer").props.rotation).toBe(200);
      expect(screen.queryByText(/Última ubicación/)).toBeNull();
    } finally {
      realtime.restore();
    }
  });

  it("says quietly when live updates are unavailable", async () => {
    const realtime = plugRealtime((_emit, report) => {
      report("CHANNEL_ERROR", new Error("Unauthorized"));
    });
    try {
      answer(onTheWay, HISTORY, live());
      await renderScreen(TrackingScreen);

      expect(
        await screen.findByText(
          "La ubicación en vivo no está disponible por ahora; se actualiza cada 30 s.",
        ),
      ).toBeOnTheScreen();
    } finally {
      realtime.restore();
    }
  });

  it("hides the section outside the live window", async () => {
    answer(detalleFixture(), HISTORY, NOT_LIVE);
    await renderScreen(TrackingScreen);

    expect(await screen.findByText("Voluntario: Carlos Ruiz")).toBeOnTheScreen();
    await waitFor(() =>
      expect(mockApi.get).toHaveBeenCalledWith(trackingPath, { signal: expect.anything() }),
    );
    expect(screen.queryByText("En vivo")).toBeNull();
    expect(screen.queryByTestId("donor-map")).toBeNull();
  });

  it("does not ask for the live tracking while the donation waits for a volunteer", async () => {
    answer(detalleFixture({ estado: "PUBLICADA", asignacion: null }), []);
    await renderScreen(TrackingScreen);

    expect(await screen.findByText("Voluntario: Por asignar")).toBeOnTheScreen();
    expect(mockApi.get).not.toHaveBeenCalledWith(trackingPath, expect.anything());
    expect(screen.queryByText("En vivo")).toBeNull();
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

  it("polls every 30 s while active and every 60 s until the route starts", () => {
    const poll = (activo?: boolean) =>
      pollWhileActive({
        state: { data: activo === undefined ? undefined : seguimientoDonacionFixture({ activo }) },
      });
    expect(TRACKING_POLL_MS).toBe(30_000);
    expect(TRACKING_IDLE_POLL_MS).toBe(60_000);
    expect(poll(true)).toBe(TRACKING_POLL_MS);
    expect(poll(false)).toBe(TRACKING_IDLE_POLL_MS);
    expect(poll()).toBe(TRACKING_IDLE_POLL_MS);
  });
});
