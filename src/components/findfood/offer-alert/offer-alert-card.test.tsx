/**
 * The floating offer card: what it shows from the offer and the donation detail, its closed
 * states and its actions. The host (queue, accept request) is covered in its own test.
 */
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { api } from "@/api";
import { pendingOffers, type QueuedOffer } from "@/domain/offer-queue";
import type { DonacionDetalleDto } from "@/services/donaciones";
import type { ApiMock } from "@/test-utils/api";
import {
  DONATION_ID,
  detalleFixture,
  donacionItemFixture,
  ofertaFixture,
} from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

import { OfferAlertCard, type OfferAlertCardProps } from "./offer-alert-card";

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
    throw new Error(`unexpected GET ${path}`);
  });
});

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
    expect(screen.getByRole("button", { name: "Ahora no" })).toBeEnabled();
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
    expect(screen.getByLabelText(/^Foto de /)).toBeOnTheScreen();
    // The donor's name stays private until the offer is accepted.
    expect(screen.queryByText("María García")).toBeNull();
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
    await fireEvent.press(screen.getByRole("button", { name: "Ahora no" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar oferta" }));
    await fireEvent.press(screen.getByRole("link", { name: "Ver detalle" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(2);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it("holds the answer buttons while accepting", async () => {
    const { onDismiss } = await renderCard({ accepting: true });

    await fireEvent.press(screen.getByRole("button", { name: "Ahora no" }));
    await fireEvent.press(screen.getByRole("button", { name: "Cerrar oferta" }));

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Aceptar donación" })).toBeDisabled();
  });
});
