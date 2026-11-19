/**
 * The floating offer card: what it shows from the offer and the donation detail, its closed
 * states, its actions and the reject panel with its reason. The host (queue, accept request)
 * is covered in its own test.
 */
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { StyleSheet } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import { pendingOffers, type QueuedOffer } from "@/domain/offer-queue";
import type { DonacionDetalleDto } from "@/services/donaciones";
import type { ApiMock } from "@/test-utils/api";
import {
  DONATION_ID,
  catalogosFixture,
  detalleFixture,
  donacionItemFixture,
  ofertaFixture,
} from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

import { MIN_CARD_HEIGHT, OfferAlertCard, type OfferAlertCardProps } from "./offer-alert-card";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockApi = api as unknown as ApiMock;
/** Five minutes into the fixture offer's ten (20:00Z → 20:10Z). */
const NOW = Date.parse("2026-10-13T20:05:00Z");

let detalle: DonacionDetalleDto;
let client: QueryClient;

function offerOf(overrides: Parameters<typeof ofertaFixture>[0] = {}): QueuedOffer {
  const offer = pendingOffers([ofertaFixture(overrides)], new Set(), NOW).current;
  if (!offer) throw new Error("the fixture offer is not live");
  return offer;
}

async function renderCard(props: Partial<OfferAlertCardProps> = {}) {
  const handlers = {
    onAccept: jest.fn(),
    onDismiss: jest.fn(),
    onOpenDetail: jest.fn(),
    onExpire: jest.fn(),
    onRejectStart: jest.fn(),
    onRejected: jest.fn(),
    onRejectFailed: jest.fn(),
  };
  client = createTestQueryClient();
  await render(
    <QueryClientProvider client={client}>
      <OfferAlertCard
        offer={offerOf()}
        remaining={0}
        closed={null}
        overCapacity={false}
        accepting={false}
        {...handlers}
        {...props}
      />
    </QueryClientProvider>,
  );
  return handlers;
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  detalle = detalleFixture({ estado: "PUBLICADA", items: [], publicada_at: null, fecha_vencimiento_min: null });
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === `/donaciones/${DONATION_ID}`) return detalle;
    if (path === "/catalogos") return catalogosFixture;
    throw new Error(`unexpected GET ${path}`);
  });
  mockApi.post.mockReset().mockResolvedValue({ id: "asg-7", estado: "RECHAZADA" });
});

/** Opens the reject panel and picks a reason from the RECHAZO_ASIGNACION catalog. */
async function chooseReason(name: string) {
  await fireEvent.press(screen.getByRole("button", { name: "Rechazar" }));
  await fireEvent.press(await screen.findByRole("button", { name: /^Motivo/ }));
  await fireEvent.press(screen.getByRole("radio", { name }));
}

afterEach(() => {
  client.clear();
  jest.useRealTimers();
});

describe("OfferAlertCard", () => {
  it("shows what to pick up, where, when and the time left", async () => {
    await renderCard();

    expect(screen.getByText("Nueva recogida")).toBeOnTheScreen();
    expect(screen.getByText("DON-1048")).toBeOnTheScreen();
    expect(screen.getByText("05:00")).toBeOnTheScreen();
    expect(screen.getByLabelText("Vence en 5 minutos")).toBeOnTheScreen();
    expect(screen.getByText("Supermercado La 14")).toBeOnTheScreen();
    expect(screen.getByText("45 kg")).toBeOnTheScreen();
    expect(screen.getByText("Lácteos · 20 L")).toBeOnTheScreen();
    expect(screen.getByText("Pan · 25 KG")).toBeOnTheScreen();
    expect(screen.getByText("Requiere refrigeración")).toBeOnTheScreen();
    expect(screen.getByText("A 2,8 km de ti")).toBeOnTheScreen();
    expect(screen.getByText("Calle 5 # 38-25, Cali")).toBeOnTheScreen();
    expect(screen.getByText("Indicaciones: Muelle de carga")).toBeOnTheScreen();
    expect(screen.getByText("13/10/2026 · 16:00–18:00")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Aceptar donación" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Ahora no" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ver detalle" })).toBeOnTheScreen();
    await act(async () => {});
  });

  it("draws the glass with a blur where the platform has one", async () => {
    await renderCard();
    expect(screen.getByTestId("offer-alert-blur")).toBeOnTheScreen();
    await act(async () => {});
  });

  it("counts the offers waiting behind this one", async () => {
    await renderCard({ remaining: 2 });
    expect(screen.getByText("+2 más")).toBeOnTheScreen();
    await act(async () => {});
  });

  it("leaves out the distance, the count and the cold chain when they do not apply", async () => {
    await renderCard({ offer: offerOf({ distancia_km: null, requiere_refrigeracion: false }) });

    expect(screen.queryByText(/de ti$/)).toBeNull();
    expect(screen.queryByText(/más$/)).toBeNull();
    expect(screen.queryByText("Requiere refrigeración")).toBeNull();
    await act(async () => {});
  });

  it("adds the photo, notes and dates from the donation detail, never the donor", async () => {
    detalle = detalleFixture({
      estado: "PUBLICADA",
      descripcion: "Excedente del día",
      fecha_vencimiento_min: "2026-10-20T00:00:00.000Z",
      publicada_at: "2026-10-13T19:58:00.000Z",
      items: [
        donacionItemFixture({ observaciones: "Traer neveras" }),
        donacionItemFixture({
          id: "item-2",
          foto_url: "https://storage.test/pan.jpg",
          observaciones: "Traer neveras",
        }),
      ],
    });

    await renderCard();

    expect(await screen.findByText("Excedente del día")).toBeOnTheScreen();
    expect(screen.getByText("Traer neveras")).toBeOnTheScreen();
    expect(screen.getByText("20/10/2026")).toBeOnTheScreen();
    expect(screen.getByText("a las 14:58")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Ver foto de / })).toBeOnTheScreen();
    // The donor's name stays private until the offer is accepted.
    expect(screen.queryByText("María García")).toBeNull();
  });

  it("opens the photos full screen from the thumbnail, like the donation detail", async () => {
    detalle = detalleFixture({
      estado: "PUBLICADA",
      items: [
        donacionItemFixture({ id: "item-1", descripcion: "Pan", foto_url: "https://storage.test/pan.jpg" }),
        donacionItemFixture({ id: "item-2", descripcion: "Leche", foto_url: "https://storage.test/leche.jpg" }),
      ],
    });

    await renderCard();
    await fireEvent.press(await screen.findByRole("button", { name: "Ver foto de Pan" }));

    expect(screen.getByText("Foto 1 de 2")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar foto" }));
    expect(screen.queryByText("Foto 1 de 2")).toBeNull();
  });

  it("warns about the capacity", async () => {
    await renderCard({ overCapacity: true });
    expect(
      screen.getByText("Con tus recogidas aceptadas superarías tu capacidad para una sola ruta"),
    ).toBeOnTheScreen();
    await act(async () => {});
  });

  it("says when another volunteer took it and only lets the card close", async () => {
    const { onDismiss } = await renderCard({ closed: "unavailable" });

    expect(screen.getByText("Ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByText("Otro voluntario tomó esta recogida")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Aceptar donación" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Ver detalle" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Cerrar" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("keeps the server's reason when the accept itself found the offer closed", async () => {
    await renderCard({ closed: "unavailable", error: "Esta donación ya no está disponible." });

    expect(screen.getByText("Ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByText("Esta donación ya no está disponible.")).toBeOnTheScreen();
    await act(async () => {});
  });

  it("says when the offer expired", async () => {
    await renderCard({ closed: "expired" });

    expect(screen.getByText("Esta oferta venció")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Aceptar donación" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Rechazar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeOnTheScreen();
    await act(async () => {});
  });

  it("reports the deadline once the countdown reaches it", async () => {
    const { onExpire } = await renderCard();

    await act(() => jest.advanceTimersByTimeAsync(5 * 60_000));

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Vencida")).toBeOnTheScreen();
  });

  it("shows a failed accept and keeps the card usable for a retry", async () => {
    await renderCard({ error: "No pudimos conectarnos." });

    expect(screen.getByText("No pudimos conectarnos.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Aceptar donación" })).toBeEnabled();
    await act(async () => {});
  });

  it("runs each action", async () => {
    const { onAccept, onDismiss, onOpenDetail } = await renderCard();

    await fireEvent.press(screen.getByRole("button", { name: "Aceptar donación" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar oferta" }));
    await fireEvent.press(screen.getByRole("link", { name: "Ver detalle" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it("holds the answer buttons while accepting", async () => {
    const { onDismiss } = await renderCard({ accepting: true });

    await fireEvent.press(screen.getByRole("button", { name: "Cerrar oferta" }));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Aceptar donación" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeDisabled();
  });

  it("opens the reject panel in place of the answer buttons, and Volver goes back", async () => {
    const { onDismiss } = await renderCard();

    await fireEvent.press(screen.getByRole("button", { name: "Rechazar" }));

    expect(await screen.findByText("¿Por qué la rechazas?")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: /^Motivo/ })).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Confirmar rechazo" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Aceptar donación" })).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Volver" }));

    expect(screen.queryByText("¿Por qué la rechazas?")).toBeNull();
    expect(screen.getByRole("button", { name: "Aceptar donación" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rechazar" })).toBeEnabled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("asks for a reason before rejecting, without a request", async () => {
    const { onRejectStart } = await renderCard();

    await fireEvent.press(screen.getByRole("button", { name: "Rechazar" }));
    await screen.findByRole("button", { name: /^Motivo/ });
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(screen.getByText("Selecciona un motivo.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(onRejectStart).not.toHaveBeenCalled();
  });

  it("asks for the comment of a reason that requires one", async () => {
    await renderCard();
    await chooseReason("Otro");

    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(screen.getByText("Escribe un comentario para este motivo.")).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Comentario *"), "Se dañó el carro");
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asg-7/rechazar", {
      body: { motivo_id: 42, observacion: "Se dañó el carro" },
    });
  });

  it("rejects with the chosen reason", async () => {
    const { onRejectStart, onRejected, onRejectFailed } = await renderCard();
    await chooseReason("Queda muy lejos");

    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(mockApi.post).toHaveBeenCalledWith("/asignaciones/asg-7/rechazar", {
      body: { motivo_id: 41 },
    });
    expect(onRejectStart).toHaveBeenCalledTimes(1);
    expect(onRejected).toHaveBeenCalledTimes(1);
    expect(onRejectFailed).not.toHaveBeenCalled();
  });

  it("holds the card while the reject is in flight", async () => {
    mockApi.post.mockReturnValue(new Promise(() => {}));
    const { onDismiss, onOpenDetail } = await renderCard();
    await chooseReason("Queda muy lejos");

    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar oferta" }));
    await fireEvent.press(screen.getByRole("link", { name: "Ver detalle" }));

    expect(screen.getByRole("button", { name: "Cerrar oferta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Volver" })).toBeDisabled();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it("shows a failed reject in the panel and reports why", async () => {
    mockApi.post.mockRejectedValue(
      new ApiError({ type: "oferta-ya-respondida", status: 409, title: "Conflict" }),
    );
    const { onRejected, onRejectFailed } = await renderCard();
    await chooseReason("Queda muy lejos");

    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));

    expect(screen.getByText("Ya respondiste a esta oferta.")).toBeOnTheScreen();
    expect(onRejectFailed).toHaveBeenCalledWith("unavailable");
    expect(onRejected).not.toHaveBeenCalled();
  });

  it("keeps the reject's reason when that reject found the offer closed", async () => {
    mockApi.post.mockRejectedValue(
      new ApiError({ type: "oferta-ya-respondida", status: 409, title: "Conflict" }),
    );
    const handlers = await renderCard();
    await chooseReason("Queda muy lejos");
    await fireEvent.press(screen.getByRole("button", { name: "Confirmar rechazo" }));

    // The host answers the failure by closing the card.
    await screen.rerender(
      <QueryClientProvider client={client}>
        <OfferAlertCard
          offer={offerOf()}
          remaining={0}
          closed="unavailable"
          overCapacity={false}
          accepting={false}
          {...handlers}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Ya no está disponible")).toBeOnTheScreen();
    expect(screen.getByText("Ya respondiste a esta oferta.")).toBeOnTheScreen();
    expect(screen.queryByText("¿Por qué la rechazas?")).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeEnabled();
  });

  it("keeps a usable height when the keyboard takes most of the window", async () => {
    const keyboard = jest.requireMock<typeof import("react-native-keyboard-controller")>(
      "react-native-keyboard-controller",
    );
    const state = jest
      .spyOn(keyboard, "useKeyboardState")
      .mockImplementation((selector) =>
        (selector as (s: { height: number }) => unknown)({ height: 10_000 }) as never,
      );
    try {
      await renderCard();
      const style = StyleSheet.flatten(screen.getByLabelText(/^Nueva recogida/).props.style);
      expect(style.maxHeight).toBeGreaterThanOrEqual(MIN_CARD_HEIGHT);
    } finally {
      state.mockRestore();
    }
  });
});
