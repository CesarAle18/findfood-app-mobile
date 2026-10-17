/**
 * Calificar voluntario (MOV-37): aspects from the catalog, `POST /asignaciones/:id/calificacion`
 * once the donation is delivered and not rated yet. The volunteer side (MOV-46) stays local.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import { RatingScreen, type Rater } from "@/screens/account";
import type { DonacionDetalleDto } from "@/services/donaciones";
import { queryKeys } from "@/services/query-keys";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import {
  DONATION_ID,
  asignacionFixture,
  catalogosFixture,
  detalleFixture,
} from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockApi = api as unknown as ApiMock;
const detailPath = `/donaciones/${DONATION_ID}`;
const ratingPath = "/asignaciones/asignacion-1/calificacion";

const delivered = detalleFixture({
  estado: "ENTREGADA",
  asignacion: asignacionFixture({ estado: "COMPLETADA" }),
});

let client: QueryClient;

function answer(detail: DonacionDetalleDto) {
  mockApi.get.mockReset().mockImplementation(async (path: string) => {
    if (path === "/catalogos") return catalogosFixture;
    if (path === detailPath) return detail;
    throw new Error(`unexpected GET ${path}`);
  });
}

async function renderRating(rater: Rater = "DONANTE", initialUrl = `/pantalla?id=${DONATION_ID}`) {
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
    { _layout: Layout, pantalla: () => <RatingScreen rater={rater} /> },
    { initialUrl },
  );
}

const submit = () => screen.getByRole("button", { name: "Enviar calificación" });

beforeEach(() => {
  mockApi.post.mockReset();
});

afterEach(() => {
  client.clear();
});

describe("RatingScreen", () => {
  it.each<[Rater, string, string]>([
    ["DONANTE", "Calificar voluntario", "Carlos Ruiz"],
    ["VOLUNTARIO", "Calificar donante", "María García"],
  ])("as %s names the other party of the donation", async (rater, title, name) => {
    answer(detalleFixture({ estado: "RECIBIDA" }));

    await renderRating(rater);

    expect(await screen.findByText(name)).toBeOnTheScreen();
    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByText(/DON-1058/)).toBeOnTheScreen();
  });

  it("offers the catalog aspects of the volunteer role", async () => {
    answer(delivered);
    await renderRating();

    expect(await screen.findByRole("checkbox", { name: "Puntualidad" })).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Amabilidad" })).toBeOnTheScreen();
    // A donor aspect never shows up when rating a volunteer.
    expect(screen.queryByRole("checkbox", { name: "Claridad" })).toBeNull();
  });

  it("sends the score, comment and aspect codes to the assignment", async () => {
    answer(delivered);
    mockApi.post.mockResolvedValue({
      id: "c-1",
      puntaje: 3,
      comentario: "Llegó tarde",
      aspectos: [{ codigo: "PUNTUALIDAD", nombre: "Puntualidad" }],
      created_at: "2026-09-24T10:00:00.000Z",
    });
    await renderRating();
    const invalidate = jest.spyOn(client, "invalidateQueries");

    await fireEvent.press(await screen.findByRole("radio", { name: "3 estrellas" }));
    await fireEvent.press(screen.getByRole("checkbox", { name: "Puntualidad" }));
    await fireEvent.changeText(screen.getByLabelText("Comentario adicional"), "  Llegó tarde ");
    await fireEvent.press(submit());

    expect(await screen.findByText("¡Gracias! Registramos tu calificación.")).toBeOnTheScreen();
    expect(mockApi.post).toHaveBeenCalledWith(ratingPath, {
      body: { puntaje: 3, comentario: "Llegó tarde", aspectos: ["PUNTUALIDAD"] },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.donaciones.details() });
  });

  it("sends no aspects with five stars", async () => {
    answer(delivered);
    mockApi.post.mockResolvedValue({ id: "c-1", puntaje: 5, comentario: null, aspectos: [], created_at: "" });
    await renderRating();

    await fireEvent.press(await screen.findByRole("checkbox", { name: "Puntualidad" }));
    await fireEvent.press(screen.getByRole("radio", { name: "5 estrellas" }));
    await fireEvent.press(submit());

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith(ratingPath, { body: { puntaje: 5 } }),
    );
  });

  it("explains a refused rating", async () => {
    answer(delivered);
    mockApi.post.mockRejectedValue(
      new ApiError({ type: "asignacion-no-completada", status: 409, title: "Conflict" }),
    );
    await renderRating();

    await fireEvent.press(await screen.findByRole("button", { name: "Enviar calificación" }));

    expect(
      await screen.findByText("La asignación todavía no se ha completado."),
    ).toBeOnTheScreen();
  });

  it("is disabled once this donor already rated the volunteer", async () => {
    answer(
      detalleFixture({
        estado: "RECIBIDA",
        asignacion: asignacionFixture({ estado: "COMPLETADA", calificada_por_mi: true }),
      }),
    );
    await renderRating();

    expect(await screen.findByText("Ya calificaste a este voluntario.")).toBeOnTheScreen();
    expect(submit()).toBeDisabled();
    await fireEvent.press(submit());
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("is disabled until the donation is delivered", async () => {
    answer(detalleFixture({ estado: "EN_TRANSITO" }));
    await renderRating();

    expect(
      await screen.findByText("Podrás calificar cuando la donación se entregue en el banco."),
    ).toBeOnTheScreen();
    expect(submit()).toBeDisabled();
  });

  it("keeps the volunteer side local for now", async () => {
    answer(detalleFixture({ estado: "RECIBIDA" }));
    await renderRating("VOLUNTARIO");
    await screen.findByText("María García");

    await fireEvent.press(submit());

    expect(
      screen.getByText("El envío de calificaciones estará disponible próximamente."),
    ).toBeOnTheScreen();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it("cannot rate a donation without a volunteer", async () => {
    answer(detalleFixture({ asignacion: asignacionFixture({ voluntario: null }) }));

    await renderRating();

    expect(await screen.findByText("Aún no puedes calificar")).toBeOnTheScreen();
  });

  it("shows an empty state without an id", async () => {
    answer(delivered);
    await renderRating("VOLUNTARIO", "/pantalla");

    await waitFor(() => expect(screen.getByText("No encontramos la donación")).toBeOnTheScreen());
    expect(mockApi.get).not.toHaveBeenCalledWith(detailPath, expect.anything());
  });
});
