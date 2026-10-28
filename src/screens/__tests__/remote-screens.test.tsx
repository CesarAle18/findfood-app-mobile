/**
 * Screens wired to the real data layer: the service hooks run against a fake `api` client,
 * and `useMe()` is driven by a fake session. Each screen is mounted alone under
 * expo-router's testing library (its links need a navigator) with a fresh query client.
 */
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Alert, type AlertButton } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { MeDto } from "@/api/types";
import { UNKNOWN_PICKUP_WINDOW } from "@/domain/mappers/donations";
import { AccountScreen, ProfileScreen } from "@/screens/account";
import { AssignedVolunteerScreen } from "@/screens/assigned-volunteer";
import { DonationDetailScreen, DonationsScreen, TrackingScreen } from "@/screens/donor";
import { MobileProvider } from "@/state/mobile-context";
import type { ApiMock } from "@/test-utils/api";
import {
  DONATION_ID,
  detalleFixture,
  impactoFixture,
  meFixture,
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

const mockCerrarSesion = jest.fn<Promise<void>, []>();

jest.mock("@/state/session", () => ({
  useSessionActions: () => ({ cerrarSesion: mockCerrarSesion, setRecovering: async () => {} }),
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

/** Answers `GET` by path; a function answer is called (it may throw). */
function answerGets(answers: Record<string, unknown>) {
  mockApi.get.mockImplementation(async (path: string) => {
    if (!(path in answers)) throw new Error(`unexpected GET ${path}`);
    const answer = answers[path];
    return typeof answer === "function" ? answer() : answer;
  });
}

const getsTo = (path: string) => mockApi.get.mock.calls.filter(([p]) => p === path);

let client: QueryClient;

async function renderScreen(Component: React.ComponentType, initialUrl = "/pantalla") {
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
  function Pantalla() {
    return <Component />;
  }
  rendered = renderRouter({ _layout: Layout, pantalla: Pantalla }, { initialUrl });
  await rendered;
}

let rendered: ReturnType<typeof renderRouter> | undefined;

const withId = `/pantalla?id=${DONATION_ID}`;
const detailPath = `/donaciones/${DONATION_ID}`;

beforeEach(() => {
  mockApi.get.mockReset();
  mockMe.data = meFixture();
  mockMe.error = null;
  mockMe.refetch.mockClear();
});

afterEach(() => {
  client.clear();
});

describe("DonationsScreen", () => {
  const rows = [
    resumenFixture({ id: "uuid-1", codigo: "DON-1", estado: "PUBLICADA" }),
    resumenFixture({ id: "uuid-2", codigo: "DON-2", estado: "RECIBIDA" }),
    resumenFixture({ id: "uuid-3", codigo: "DON-3", estado: "ENTREGADA" }),
    resumenFixture({ id: "uuid-4", codigo: "DON-4", estado: "CANCELADA" }),
  ];

  it("loads the donor's donations and shows their codes, not their ids", async () => {
    answerGets({ "/donaciones": pageFixture(rows) });

    await renderScreen(DonationsScreen);

    expect(screen.getByRole("progressbar", { name: "Cargando tus donaciones" })).toBeOnTheScreen();
    expect(await screen.findByText("DON-1")).toBeOnTheScreen();
    expect(screen.getByText("4 donaciones")).toBeOnTheScreen();
    expect(screen.queryByText("uuid-1")).toBeNull();
    expect(mockApi.get).toHaveBeenCalledWith("/donaciones", {
      query: { limite: 20, desplazamiento: 0 },
      signal: expect.any(AbortSignal),
    });
  });

  it("filters by state, not by the label shown", async () => {
    answerGets({ "/donaciones": pageFixture(rows) });
    await renderScreen(DonationsScreen);
    await screen.findByText("DON-1");

    // RECIBIDA reads "Completada" and ENTREGADA "Entregada en el banco": both are delivered.
    await fireEvent.press(screen.getByRole("radio", { name: "Entregadas" }));
    expect(screen.getByText("DON-2")).toBeOnTheScreen();
    expect(screen.getByText("DON-3")).toBeOnTheScreen();
    expect(screen.queryByText("DON-1")).toBeNull();
    expect(screen.queryByText("DON-4")).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "En seguimiento" }));
    expect(screen.getByText("DON-1")).toBeOnTheScreen();
    expect(screen.queryByText("DON-2")).toBeNull();
    expect(screen.queryByText("DON-4")).toBeNull();
  });

  it("keeps a row whose pickup window cannot be read", async () => {
    answerGets({
      "/donaciones": pageFixture([
        resumenFixture({
          id: "uuid-bad",
          codigo: "DON-BAD",
          ventana_recogida_fin: "2026-09-23T20:00:00.000Z",
        }),
        rows[0],
      ]),
    });

    await renderScreen(DonationsScreen);

    expect(await screen.findByText("DON-BAD")).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(UNKNOWN_PICKUP_WINDOW))).toBeOnTheScreen();
    expect(screen.getByText("DON-1")).toBeOnTheScreen();
  });

  it("invites to donate when there are no donations", async () => {
    answerGets({ "/donaciones": pageFixture([]) });

    await renderScreen(DonationsScreen);

    expect(await screen.findByText("Aún no tienes donaciones")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Realiza una donación" })).toBeOnTheScreen();
  });

  it("explains a failed load and retries it", async () => {
    let fail = true;
    answerGets({
      "/donaciones": () => {
        if (fail) throw ApiError.network(new TypeError("Network request failed"));
        return pageFixture(rows);
      },
    });
    await renderScreen(DonationsScreen);
    expect(await screen.findByText("No pudimos cargar la información")).toBeOnTheScreen();

    fail = false;
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("DON-1")).toBeOnTheScreen();
    expect(getsTo("/donaciones")).toHaveLength(2);
  });

  describe("paging", () => {
    /** 25 donations: only the first one is delivered. */
    const history = Array.from({ length: 25 }, (_, i) =>
      resumenFixture({
        id: `uuid-p${i}`,
        codigo: `DON-P${i}`,
        estado: i === 0 ? "RECIBIDA" : "PUBLICADA",
      }),
    );
    let failNextPages = false;
    /** Rows the fake API returns per page, at most `limite`. */
    let servedPageSize = 20;

    /** Serves `history` by `limite`/`desplazamiento`; later pages fail while `failNextPages`. */
    function answerHistory() {
      mockApi.get.mockImplementation(
        async (path: string, { query }: { query: { limite: number; desplazamiento: number } }) => {
          if (path !== "/donaciones") throw new Error(`unexpected GET ${path}`);
          const { limite, desplazamiento } = query;
          if (desplazamiento > 0 && failNextPages) {
            throw ApiError.network(new TypeError("Network request failed"));
          }
          const end = desplazamiento + Math.min(limite, servedPageSize);
          return pageFixture(history.slice(desplazamiento, end), history.length, desplazamiento);
        },
      );
    }

    const offsets = () =>
      getsTo("/donaciones").map(([, options]) => options.query.desplazamiento as number);

    beforeEach(() => {
      failNextPages = false;
      servedPageSize = 20;
      answerHistory();
    });

    it("loads the next page on its own when the unfiltered list reaches its end", async () => {
      // Five rows are shorter than the screen, so the list starts at its end.
      servedPageSize = 5;

      await renderScreen(DonationsScreen);
      await screen.findByText("DON-P0");

      await waitFor(() => expect(offsets().slice(0, 2)).toEqual([0, 5]));
    });

    it("asks for the next page after the first 20 donations", async () => {
      await renderScreen(DonationsScreen);
      expect(await screen.findByText("DON-P0")).toBeOnTheScreen();
      expect(screen.getByText("25 donaciones")).toBeOnTheScreen();
      expect(offsets()).toEqual([0]);

      await fireEvent.press(screen.getByRole("button", { name: "Cargar más" }));

      await waitFor(() => expect(offsets()).toEqual([0, 20]));
      expect(mockApi.get).toHaveBeenLastCalledWith("/donaciones", {
        query: { limite: 20, desplazamiento: 20 },
        signal: expect.any(AbortSignal),
      });
      // The last page leaves nothing else to load.
      await waitFor(() => expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull());
    });

    it("does not page through the history on its own while a filter is active", async () => {
      await renderScreen(DonationsScreen);
      await screen.findByText("DON-P0");

      // One delivered row is far shorter than the screen: the list reaches its end at once.
      await fireEvent.press(screen.getByRole("radio", { name: "Entregadas" }));
      expect(screen.getByText("DON-P0")).toBeOnTheScreen();
      await act(async () => {});
      expect(offsets()).toEqual([0]);

      await fireEvent.press(screen.getByRole("button", { name: "Cargar más" }));

      await waitFor(() => expect(offsets()).toEqual([0, 20]));
    });

    it("explains a failed next page and retries it", async () => {
      failNextPages = true;
      await renderScreen(DonationsScreen);
      await screen.findByText("DON-P0");

      await fireEvent.press(screen.getByRole("button", { name: "Cargar más" }));

      expect(await screen.findByText("No pudimos cargar más donaciones")).toBeOnTheScreen();
      // The loaded rows stay on screen.
      expect(screen.getByText("DON-P0")).toBeOnTheScreen();

      failNextPages = false;
      await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

      await waitFor(() => expect(screen.queryByText("No pudimos cargar más donaciones")).toBeNull());
      expect(offsets()).toEqual([0, 20, 20]);
    });
  });
});

describe("DonationDetailScreen", () => {
  it("shows the donation and its assigned volunteer", async () => {
    answerGets({ [detailPath]: detalleFixture({ estado: "RECIBIDA" }) });

    await renderScreen(DonationDetailScreen, withId);

    expect(await screen.findByText("DON-1058")).toBeOnTheScreen();
    expect(screen.getByText("Carlos Ruiz")).toBeOnTheScreen();
    expect(screen.getByText("Camioneta · XYZ987")).toBeOnTheScreen();
    expect(screen.getByText("26/09/2026")).toBeOnTheScreen();
    expect(screen.getByRole("link", { name: "Calificar voluntario" })).toBeOnTheScreen();
  });

  it("hides the volunteer block while nobody holds the donation", async () => {
    answerGets({ [detailPath]: detalleFixture({ estado: "PUBLICADA", asignacion: null }) });

    await renderScreen(DonationDetailScreen, withId);

    expect(await screen.findByText("Buscando voluntario")).toBeOnTheScreen();
    expect(screen.queryByText("Voluntario asignado")).toBeNull();
    expect(screen.queryByText("Calificar voluntario")).toBeNull();
  });

  it("keeps a donation whose pickup window and expiry cannot be read", async () => {
    answerGets({
      [detailPath]: detalleFixture({
        ventana_recogida_fin: "2026-09-23T20:00:00.000Z",
        fecha_vencimiento_min: "2026-02-30",
      }),
    });

    await renderScreen(DonationDetailScreen, withId);

    expect(await screen.findByText("DON-1058")).toBeOnTheScreen();
    expect(screen.getByText(UNKNOWN_PICKUP_WINDOW)).toBeOnTheScreen();
    expect(screen.getByText("Sin fecha")).toBeOnTheScreen();
    expect(screen.getByText("Carlos Ruiz")).toBeOnTheScreen();
  });

  it("shows an empty state without an id, and requests nothing", async () => {
    await renderScreen(DonationDetailScreen);

    expect(screen.getByText("No encontramos la donación")).toBeOnTheScreen();
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it("explains a failed load and retries it", async () => {
    let fail = true;
    answerGets({
      [detailPath]: () => {
        if (fail) throw new ApiError({ type: "no-encontrado", status: 404, title: "Not Found" });
        return detalleFixture();
      },
    });
    await renderScreen(DonationDetailScreen, withId);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeOnTheScreen();

    fail = false;
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("DON-1058")).toBeOnTheScreen();
  });
});

describe("TrackingScreen", () => {
  it("dates each reached step and leaves the rest pending", async () => {
    answerGets({ [detailPath]: detalleFixture() });

    await renderScreen(TrackingScreen, withId);

    expect(await screen.findByText("Voluntario: Carlos Ruiz")).toBeOnTheScreen();
    expect(screen.getByText("23/09/2026 · 13:55")).toBeOnTheScreen();
    expect(screen.getByText("Carlos Ruiz · 23/09/2026 · 14:12")).toBeOnTheScreen();
    expect(screen.getAllByText("Pendiente")).toHaveLength(2);
  });
});

describe("AssignedVolunteerScreen", () => {
  it("names the volunteer of the donation", async () => {
    answerGets({ [detailPath]: detalleFixture() });

    await renderScreen(AssignedVolunteerScreen, withId);

    expect(await screen.findByText("Carlos Ruiz se encargará de recoger tus productos.")).toBeOnTheScreen();
  });

  it("says when nobody has accepted it yet", async () => {
    answerGets({ [detailPath]: detalleFixture({ estado: "PUBLICADA", asignacion: null }) });

    await renderScreen(AssignedVolunteerScreen, withId);

    expect(await screen.findByText("Aún no hay voluntario asignado")).toBeOnTheScreen();
  });
});

describe("ProfileScreen", () => {
  it("shows the donor's account and impact", async () => {
    answerGets({ "/me/impacto": impactoFixture() });

    await renderScreen(ProfileScreen);

    expect(screen.getByText("María García López")).toBeOnTheScreen();
    expect(screen.getByText("MG")).toBeOnTheScreen();
    expect(screen.getByText("4,5 / 5")).toBeOnTheScreen();
    expect(screen.getByText("+573001234567")).toBeOnTheScreen();
    expect(await screen.findByText("280 kg")).toBeOnTheScreen();
    expect(screen.getByText("entregadas")).toBeOnTheScreen();
  });

  it("shows the volunteer's vehicle, schedule and impact", async () => {
    answerGets({ "/me/impacto": impactoFixture() });

    await renderScreen(() => <ProfileScreen volunteer />);

    expect(screen.getByText("Voluntario verificado")).toBeOnTheScreen();
    expect(screen.getByText("ABC123")).toBeOnTheScreen();
    expect(screen.getByText("Lun 08:00–18:00")).toBeOnTheScreen();
    expect(await screen.findByText("1200 kg")).toBeOnTheScreen();
  });

  it("shows the volunteer's names and phone with the volunteer information", async () => {
    answerGets({ "/me/impacto": impactoFixture() });

    await renderScreen(() => <ProfileScreen volunteer />);

    expect(screen.getByText("Nombres")).toBeOnTheScreen();
    expect(screen.getByText("María")).toBeOnTheScreen();
    expect(screen.getByText("Apellidos")).toBeOnTheScreen();
    expect(screen.getByText("García López")).toBeOnTheScreen();
    expect(screen.getByText("Celular")).toBeOnTheScreen();
    expect(screen.getByText("+573001234567")).toBeOnTheScreen();
    await screen.findByText("1200 kg");
  });

  it("explains a failed account load and retries it", async () => {
    mockMe.data = undefined;
    mockMe.error = ApiError.network(new TypeError("Network request failed"));

    await renderScreen(ProfileScreen);

    expect(screen.getByText("No pudimos cargar tu perfil")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(mockMe.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner while the account loads", async () => {
    mockMe.data = undefined;

    await renderScreen(ProfileScreen);

    expect(screen.getByRole("progressbar", { name: "Cargando tu perfil" })).toBeOnTheScreen();
  });
});

describe("AccountScreen", () => {
  it("shows the signed-in account", async () => {
    await renderScreen(AccountScreen);

    expect(screen.getByText("María García López")).toBeOnTheScreen();
    expect(screen.getByText("maria@correo.com")).toBeOnTheScreen();
  });

  describe("sign-out", () => {
    let alert: jest.SpyInstance;

    beforeEach(() => {
      mockCerrarSesion.mockReset().mockResolvedValue(undefined);
      alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    });

    afterEach(() => {
      alert.mockRestore();
    });

    /** The buttons of the confirmation the last press opened. */
    function confirmation(): AlertButton[] {
      expect(alert).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alert.mock.calls[0] as [string, string, AlertButton[]];
      expect(title).toBe("Cerrar sesión");
      expect(message).toBe("¿Quieres cerrar la sesión en este teléfono?");
      return buttons;
    }

    const signOutButton = () => screen.getByRole("button", { name: "Cerrar sesión" });

    it("is an action that asks first, not a link to the login", async () => {
      await renderScreen(AccountScreen);

      expect(screen.queryByRole("link", { name: "Cerrar sesión" })).toBeNull();
      await fireEvent.press(signOutButton());

      const buttons = confirmation();
      expect(buttons.map(({ text, style }) => [text, style])).toEqual([
        ["Cancelar", "cancel"],
        ["Cerrar sesión", "destructive"],
      ]);
      expect(mockCerrarSesion).not.toHaveBeenCalled();
    });

    it("does nothing when cancelled", async () => {
      await renderScreen(AccountScreen);
      await fireEvent.press(signOutButton());

      const [cancel] = confirmation();
      await act(async () => cancel.onPress?.());

      expect(mockCerrarSesion).not.toHaveBeenCalled();
      expect(signOutButton()).not.toBeBusy();
    });

    it("signs out once confirmed, blocking the menu until it finishes", async () => {
      let finish: () => void = () => {};
      mockCerrarSesion.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      await renderScreen(AccountScreen);
      await fireEvent.press(signOutButton());

      const [, confirm] = confirmation();
      // A second tap on the confirmation must not start another sign-out.
      await act(async () => {
        confirm.onPress?.();
        confirm.onPress?.();
      });

      expect(mockCerrarSesion).toHaveBeenCalledTimes(1);
      expect(signOutButton()).toBeBusy();
      expect(signOutButton()).toBeDisabled();
      expect(screen.getByText("Cerrando sesión…")).toBeOnTheScreen();
      for (const view of screen.getAllByRole("radio")) expect(view).toBeDisabled();
      // The guards leave the screen once the session ends: it never navigates itself.
      expect(rendered?.getPathname()).toBe("/pantalla");

      await act(async () => finish());
      expect(signOutButton()).not.toBeBusy();
      expect(screen.queryByText("Cerrando sesión…")).toBeNull();
    });
  });
});
