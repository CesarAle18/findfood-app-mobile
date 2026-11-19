/**
 * The floating offer alert over the app: when it shows, the queue, closing it, accepting,
 * rejecting with a reason, losing the offer to another volunteer, expiry, and when it stays
 * away (donor mode, the offer screen). The API is mocked; the router is the real expo-router.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import { Text, View } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { MeDto } from "@/api/types";
import { setOfferAlertActive } from "@/notifications/push";
import type { OfertaDto } from "@/services/asignaciones";
import { queryKeys } from "@/services/query-keys";
import type { ApiMock } from "@/test-utils/api";
import {
  DONATION_ID,
  catalogosFixture,
  detalleFixture,
  meFixture,
  ofertaFixture,
} from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

import { CLOSED_CARD_MS, OfferAlertHost } from "./offer-alert-host";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

jest.mock("@/notifications/push", () => ({ setOfferAlertActive: jest.fn() }));

const mockAccess = {
  phase: "app",
  activeRole: "VOLUNTARIO" as "VOLUNTARIO" | "DONANTE",
  canDonor: true,
  canVolunteer: true,
  setActiveRole: () => {},
};
const mockMe = { data: undefined as MeDto | undefined };

jest.mock("@/state/session", () => ({
  useAccess: () => mockAccess,
  useMe: () => mockMe,
}));

const mockApi = api as unknown as ApiMock;

/** Ten minutes before the fixture offer lapses (20:10Z). */
const NOW = Date.parse("2026-10-13T20:00:00Z");

let ofertas: OfertaDto[];
let client: QueryClient;

async function renderApp(initialUrl = "/") {
  client = createTestQueryClient();
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <View style={{ flex: 1 }}>
          <Slot />
          <OfferAlertHost />
        </View>
      </QueryClientProvider>
    );
  }
  await renderRouter(
    {
      _layout: Layout,
      index: () => <Text>Inicio</Text>,
      "voluntario/rutas": () => <Text>Mis rutas</Text>,
      "voluntario/oferta": () => <Text>Pantalla de oferta</Text>,
    },
    { initialUrl },
  );
  await settle();
}

/**
 * Lets the queries answer: TanStack notifies observers on a zero-delay timer, which the fake
 * timers hold until they advance (the offers, then the card's donation detail).
 */
async function settle() {
  await act(() => jest.advanceTimersByTimeAsync(10));
}

/** A push or the Realtime sync refreshes the offers. */
async function offersChanged(next: OfertaDto[]) {
  ofertas = next;
  await act(() => client.invalidateQueries({ queryKey: queryKeys.asignaciones.ofertas() }));
  await settle();
}

const accept = () => screen.getByRole("button", { name: "Aceptar donación" });
const closeButton = () => screen.getByRole("button", { name: "Cerrar oferta" });

/** Rejects the shown offer with "Queda muy lejos" (RECHAZO_ASIGNACION 41). */
async function rejectWithReason() {
  await fireEvent.press(screen.getByRole("button", { name: "Rechazar" }));
  await fireEvent.press(await screen.findByRole("button", { name: /^Motivo/ }));
  await fireEvent.press(screen.getByRole("radio", { name: "Queda muy lejos" }));
  await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  ofertas = [ofertaFixture()];
  mockAccess.phase = "app";
  mockAccess.activeRole = "VOLUNTARIO";
  mockAccess.canVolunteer = true;
  mockMe.data = meFixture();
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === "/asignaciones/ofertas") return ofertas;
    if (path === `/donaciones/${DONATION_ID}`) return detalleFixture({ estado: "PUBLICADA", items: [] });
    if (path === "/catalogos") return catalogosFixture;
    throw new Error(`unexpected GET ${path}`);
  });
  mockApi.post.mockReset().mockResolvedValue({ id: "asg-7", estado: "ACEPTADA" });
  jest.mocked(Haptics.notificationAsync).mockClear();
  jest.mocked(Haptics.impactAsync).mockClear();
  jest.mocked(setOfferAlertActive).mockClear();
});

afterEach(() => {
  client.clear();
  jest.useRealTimers();
});

describe("OfferAlertHost", () => {
  it("shows a new offer over the current screen", async () => {
    ofertas = [];
    await renderApp();
    expect(screen.queryByText("Nueva recogida")).toBeNull();

    await offersChanged([ofertaFixture()]);

    expect(await screen.findByText("Nueva recogida")).toBeOnTheScreen();
    expect(screen.getByText("Inicio")).toBeOnTheScreen();
    expect(screen.getByText("DON-1048")).toBeOnTheScreen();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it("shows a repeated offer once", async () => {
    ofertas = [ofertaFixture(), ofertaFixture()];
    await renderApp();

    expect(screen.getAllByText("Nueva recogida")).toHaveLength(1);
    expect(screen.queryByText(/más$/)).toBeNull();
  });

  it("shows the offer closest to lapsing and counts the rest", async () => {
    ofertas = [
      ofertaFixture({ id: "asg-late", codigo: "DON-3", expira_at: "2026-10-13T20:20:00Z" }),
      ofertaFixture({ id: "asg-soon", codigo: "DON-1", expira_at: "2026-10-13T20:05:00Z" }),
      ofertaFixture({ id: "asg-mid", codigo: "DON-2", expira_at: "2026-10-13T20:10:00Z" }),
    ];
    await renderApp();

    expect(screen.getByText("DON-1")).toBeOnTheScreen();
    expect(screen.getByText("+2 más")).toBeOnTheScreen();

    await fireEvent.press(closeButton());

    expect(screen.getByText("DON-2")).toBeOnTheScreen();
    expect(screen.getByText("+1 más")).toBeOnTheScreen();
  });

  it("keeps the shown offer when a sooner one arrives, and counts it", async () => {
    await renderApp();
    expect(screen.getByText("DON-1048")).toBeOnTheScreen();

    await offersChanged([
      ofertaFixture(),
      ofertaFixture({ id: "asg-9", codigo: "DON-9", expira_at: "2026-10-13T20:05:00Z" }),
    ]);

    expect(screen.getByText("DON-1048")).toBeOnTheScreen();
    expect(screen.getByText("+1 más")).toBeOnTheScreen();
  });

  it("sets the offer aside with the close button, without answering it", async () => {
    await renderApp();

    await fireEvent.press(closeButton());

    expect(screen.queryByText("Nueva recogida")).toBeNull();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    // Still live: the next refresh lists it again, and the card stays closed.
    await offersChanged([ofertaFixture()]);
    expect(screen.queryByText("Nueva recogida")).toBeNull();
  });

  it("closes with a tap outside the card, like the close button", async () => {
    await renderApp();

    await fireEvent.press(screen.getByTestId("offer-alert-scrim"));

    expect(screen.queryByText("Nueva recogida")).toBeNull();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("asks for a reason before rejecting, and sends nothing without one", async () => {
    await renderApp();

    await fireEvent.press(screen.getByRole("button", { name: "Rechazar" }));
    expect(await screen.findByText("¿Por qué la rechazas?")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(screen.getByText("Selecciona un motivo.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole("button", { name: "Volver" }));
    expect(accept()).toBeEnabled();
  });

  it("rejects the offer with a reason, then shows the next one", async () => {
    let answer: (value: unknown) => void = () => {};
    mockApi.post.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    ofertas = [
      ofertaFixture({ id: "asg-soon", codigo: "DON-1", expira_at: "2026-10-13T20:05:00Z" }),
      ofertaFixture({ id: "asg-late", codigo: "DON-2", expira_at: "2026-10-13T20:10:00Z" }),
    ];
    await renderApp();

    await rejectWithReason();
    expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asg-soon/rechazar", {
      body: { motivo_id: 41 },
    });
    // The refresh of this very reject drops the offer before the POST answers: not "taken".
    await offersChanged([ofertas[1]!]);
    expect(screen.queryByText("Ya no está disponible")).toBeNull();
    expect(screen.getByText("DON-1")).toBeOnTheScreen();

    await act(async () => answer({ id: "asg-soon", estado: "RECHAZADA" }));
    await settle();

    expect(screen.queryByText("DON-1")).toBeNull();
    expect(screen.getByText("DON-2")).toBeOnTheScreen();
    expect(screen.queryByText("Ya no está disponible")).toBeNull();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(screen.getByText("Inicio")).toBeOnTheScreen();
  });

  it("closes the card once the reject lands, without navigating", async () => {
    await renderApp();

    await rejectWithReason();
    await settle();

    expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asg-7/rechazar", {
      body: { motivo_id: 41 },
    });
    expect(screen.queryByText("Nueva recogida")).toBeNull();
    expect(screen.queryByText("Ya no está disponible")).toBeNull();
    expect(screen.getByText("Inicio")).toBeOnTheScreen();
  });

  it("stays open while rejecting, so the close button and a tap outside cannot hide the answer", async () => {
    let fail: (reason: unknown) => void = () => {};
    mockApi.post.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    await renderApp();

    await rejectWithReason();
    expect(closeButton()).toBeDisabled();
    await fireEvent.press(closeButton());
    await fireEvent.press(screen.getByTestId("offer-alert-scrim"));
    expect(screen.getByText("Nueva recogida")).toBeOnTheScreen();

    await act(async () =>
      fail(new ApiError({ type: "oferta-ya-respondida", status: 409, title: "Conflict" })),
    );

    expect(await screen.findByText("Ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByText("Ya respondiste a esta oferta.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeEnabled();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );

    await act(() => jest.advanceTimersByTimeAsync(CLOSED_CARD_MS));
    expect(screen.queryByText("Nueva recogida")).toBeNull();
  });

  it("keeps the reject panel open after a network failure so the volunteer can retry", async () => {
    mockApi.post.mockRejectedValueOnce(ApiError.network(new TypeError("offline")));
    await renderApp();

    await rejectWithReason();

    expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirmar rechazo" })).toBeEnabled();
    expect(screen.queryByText("Ya no está disponible")).toBeNull();
    expect(closeButton()).toBeEnabled();
  });

  it("accepts the offer and goes to the routes", async () => {
    await renderApp();

    await fireEvent.press(accept());

    expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asg-7/aceptar");
    expect(await screen.findByText("Mis rutas")).toBeOnTheScreen();
    expect(screen.queryByText("Nueva recogida")).toBeNull();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it("does not call its own accept a lost offer when the list refreshes first", async () => {
    let answer: (value: unknown) => void = () => {};
    mockApi.post.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await renderApp();

    await fireEvent.press(accept());
    // The Realtime sync of this very accept lands before the POST answers.
    await offersChanged([ofertaFixture({ estado: "ACEPTADA" })]);
    expect(screen.queryByText("Ya no está disponible")).toBeNull();

    await act(async () => answer({ id: "asg-7", estado: "ACEPTADA" }));

    expect(await screen.findByText("Mis rutas")).toBeOnTheScreen();
    expect(screen.queryByText("Nueva recogida")).toBeNull();
  });

  it("stays open while accepting, so a tap outside cannot hide the answer", async () => {
    let fail: (reason: unknown) => void = () => {};
    mockApi.post.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    await renderApp();

    await fireEvent.press(accept());
    await fireEvent.press(screen.getByTestId("offer-alert-scrim"));
    expect(screen.getByText("Nueva recogida")).toBeOnTheScreen();

    await act(async () => fail(new ApiError({ type: "oferta-tomada", status: 409, title: "Conflict" })));

    expect(await screen.findByText("Ya no está disponible")).toBeOnTheScreen();
  });

  it("says the offer is no longer available when another volunteer won it", async () => {
    mockApi.post.mockRejectedValue(
      new ApiError({ type: "oferta-tomada", status: 409, title: "Conflict" }),
    );
    await renderApp();

    await fireEvent.press(accept());

    expect(await screen.findByText("Ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByText("Otro voluntario ya aceptó esta donación.")).toBeOnTheScreen();
    expect(accept()).toBeDisabled();
    expect(screen.queryByText("Mis rutas")).toBeNull();
    expect(Haptics.notificationAsync).toHaveBeenLastCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );

    await act(() => jest.advanceTimersByTimeAsync(CLOSED_CARD_MS));
    expect(screen.queryByText("Nueva recogida")).toBeNull();
  });

  it("keeps the card open after a network failure so the volunteer can retry", async () => {
    mockApi.post.mockRejectedValueOnce(ApiError.network(new TypeError("offline")));
    await renderApp();

    await fireEvent.press(accept());

    expect(await screen.findByText(/No pudimos conectarnos/)).toBeOnTheScreen();
    expect(accept()).toBeEnabled();
    await act(() => jest.advanceTimersByTimeAsync(CLOSED_CARD_MS));
    expect(screen.getByText("Nueva recogida")).toBeOnTheScreen();
  });

  it("turns unavailable when the offer leaves the list while on screen, then closes", async () => {
    await renderApp();

    await offersChanged([]);

    expect(screen.getByText("Ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByText("Otro voluntario tomó esta recogida")).toBeOnTheScreen();
    expect(accept()).toBeDisabled();

    await act(() => jest.advanceTimersByTimeAsync(CLOSED_CARD_MS));
    expect(screen.queryByText("Nueva recogida")).toBeNull();
  });

  it("disables accepting once the countdown runs out", async () => {
    await renderApp();

    await act(() => jest.advanceTimersByTimeAsync(10 * 60_000));

    expect(screen.getByText("Esta oferta venció")).toBeOnTheScreen();
    expect(accept()).toBeDisabled();
  });

  it("opens the full offer from Ver detalle and stays away there", async () => {
    await renderApp();

    await fireEvent.press(screen.getByRole("link", { name: "Ver detalle" }));

    expect(await screen.findByText("Pantalla de oferta")).toBeOnTheScreen();
    expect(screen.queryByText("Nueva recogida")).toBeNull();
  });

  it("shows nothing in donor mode", async () => {
    mockAccess.activeRole = "DONANTE";
    await renderApp();

    expect(screen.queryByText("Nueva recogida")).toBeNull();
    expect(setOfferAlertActive).not.toHaveBeenCalledWith(true);
  });

  it("shows nothing on the offer screen, which already shows the offer", async () => {
    await renderApp("/voluntario/oferta?asignacionId=asg-7");

    expect(screen.getByText("Pantalla de oferta")).toBeOnTheScreen();
    expect(screen.queryByText("Nueva recogida")).toBeNull();
  });

  it("tells the push handler while it is on screen", async () => {
    await renderApp();
    expect(setOfferAlertActive).toHaveBeenLastCalledWith(true);

    await fireEvent.press(screen.getByRole("link", { name: "Ver detalle" }));

    expect(await screen.findByText("Pantalla de oferta")).toBeOnTheScreen();
    expect(setOfferAlertActive).toHaveBeenLastCalledWith(false);
  });
});
