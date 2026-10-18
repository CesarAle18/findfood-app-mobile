/**
 * Nueva oferta (MOV-41): the live countdown, the expiry, the load against the volunteer's
 * capacity and the accepted state, against the (mocked) offers endpoint.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { act, renderRouter, screen } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import type { MeDto } from "@/api/types";
import type { OfertaDto } from "@/services/asignaciones";
import { queryKeys } from "@/services/query-keys";
import { OfferScreen } from "@/screens/volunteer";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import { meFixture, ofertaAceptadaFixture, ofertaFixture } from "@/test-utils/fixtures";
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

/** Ten minutes before the fixture offer lapses (20:10Z). */
const NOW = Date.parse("2026-10-13T20:00:00Z");

let ofertas: OfertaDto[];
let client: QueryClient;

async function renderOffer(initialUrl = "/pantalla?asignacionId=asg-7") {
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
      pantalla: OfferScreen,
      voluntario: () => <Text>Inicio</Text>,
      "voluntario/rutas": () => <Text>Mis rutas</Text>,
    },
    { initialUrl },
  );
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  ofertas = [ofertaFixture()];
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === "/asignaciones/ofertas") return ofertas;
    if (path === "/catalogos") return { motivos: [] };
    throw new Error(`unexpected GET ${path}`);
  });
  mockApi.post.mockReset().mockResolvedValue({ id: "asg-7", estado: "ACEPTADA" });
  mockMe.data = meFixture();
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
});

const offerRequests = () =>
  mockApi.get.mock.calls.filter(([path]) => path === "/asignaciones/ofertas").length;

describe("OfferScreen (MOV-41)", () => {
  it("counts down to the deadline in the header", async () => {
    await renderOffer();

    expect(await screen.findByText("Vence en 10:00")).toBeOnTheScreen();
    expect(screen.getByText("15:10")).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTimeAsync(5_000));
    expect(screen.getByText("Vence en 09:55")).toBeOnTheScreen();
  });

  it("disables Aceptar at the deadline and asks for the offers again", async () => {
    await renderOffer();
    await screen.findByText("Vence en 10:00");
    // The server already dropped the offer: the refetch at expiry must not race the copy.
    const invalidate = jest.spyOn(client, "invalidateQueries");

    await act(() => jest.advanceTimersByTimeAsync(10 * 60_000));

    expect(screen.getByText("Vencida")).toBeOnTheScreen();
    expect(screen.getByText("Esta oferta venció")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Aceptar" })).toBeDisabled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.asignaciones.ofertas() });
  });

  it("polls the offers every 15 s while one waits for an answer", async () => {
    await renderOffer();
    await screen.findByText("Vence en 10:00");
    const before = offerRequests();

    await act(() => jest.advanceTimersByTimeAsync(15_000));

    expect(offerRequests()).toBe(before + 1);
  });

  it("shows the load against the capacity", async () => {
    await renderOffer();

    expect(await screen.findByText("45 kg de tu capacidad de 500 kg")).toBeOnTheScreen();
    expect(
      screen.queryByText("Con tus recogidas aceptadas superarías tu capacidad para una sola ruta"),
    ).toBeNull();
    expect(
      screen.getByText("Al aceptar, podrás armar tu ruta con tus recogidas aceptadas."),
    ).toBeOnTheScreen();
  });

  it("warns when the accepted pickups plus this offer exceed the capacity", async () => {
    ofertas = [ofertaAceptadaFixture({ peso_estimado_kg: 470 }), ofertaFixture()];

    await renderOffer();

    expect(
      await screen.findByText(
        "Con tus recogidas aceptadas superarías tu capacidad para una sola ruta",
      ),
    ).toBeOnTheScreen();
  });

  it("once accepted, shows the donor contact instead of the answer buttons", async () => {
    ofertas = [ofertaAceptadaFixture()];

    await renderOffer("/pantalla?asignacionId=asg-8");

    expect(await screen.findByText("Laura Gómez")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Contactar al donante" })).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Ver mis rutas" })).toBeOnTheScreen();
    expect(screen.queryByText("Aceptar")).toBeNull();
    expect(screen.queryByText(/^Vence en/)).toBeNull();
  });
});
