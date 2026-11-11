/**
 * The inbox against a fake `api` client and a fake session, mounted under expo-router's
 * testing library with stub screens for the routes a notification opens.
 */
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { api } from "@/api";
import { NotificationsScreen } from "@/screens/notifications";
import type { ApiMock } from "@/test-utils/api";
import { DONATION_ID, bandejaFixture, notificacionFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockSetActiveRole = jest.fn();

jest.mock("@/state/session", () => ({
  useAccess: () => ({
    phase: "app",
    activeRole: "DONANTE",
    canDonor: true,
    canVolunteer: true,
    setActiveRole: mockSetActiveRole,
  }),
}));

const mockApi = api as unknown as ApiMock;

const received = notificacionFixture({ id: "n-1", titulo: "Donación recibida" });
const offer = notificacionFixture({
  id: "n-2",
  tipo: "ASIGNACION_OFRECIDA",
  titulo: "Nueva oferta de recogida",
  donacion_id: null,
  asignacion_id: "asg-7",
  leida_at: "2026-10-13T10:00:00Z",
});
const delivered = notificacionFixture({
  id: "n-3",
  tipo: "DONACION_ENTREGADA",
  titulo: "Donación entregada",
  leida_at: "2026-10-12T10:00:00Z",
});

let client: QueryClient;

async function renderInbox() {
  client = createTestQueryClient();
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <Slot />
      </QueryClientProvider>
    );
  }
  const Stub = () => null;
  // RNTL 14: the route getters live on the promise renderRouter returns, not on its result.
  const rendered = renderRouter(
    {
      _layout: Layout,
      alertas: NotificationsScreen,
      "donante/entrega-donacion": Stub,
      "voluntario/oferta": Stub,
    },
    { initialUrl: "/alertas" },
  );
  await rendered;
  return { getPathname: rendered.getPathname, getSearchParams: rendered.getSearchParams };
}

const inboxQueries = () =>
  mockApi.get.mock.calls
    .filter(([path]) => path === "/me/notificaciones")
    .map(([, options]) => options.query);

beforeEach(() => {
  mockApi.get.mockReset().mockResolvedValue(bandejaFixture([received, offer, delivered]));
  mockApi.post.mockReset().mockResolvedValue(undefined);
  mockApi.delete.mockReset().mockResolvedValue(undefined);
  mockSetActiveRole.mockClear();
});

afterEach(() => {
  client.clear();
});

it("lists the inbox from the API with its unread count", async () => {
  await renderInbox();

  expect(await screen.findByText("Donación recibida")).toBeOnTheScreen();
  expect(screen.getByText("Nueva oferta de recogida")).toBeOnTheScreen();
  expect(screen.getByText("1 sin leer")).toBeOnTheScreen();
  expect(screen.getByText("Marcar todas como leídas")).toBeOnTheScreen();
  expect(inboxQueries()).toEqual([{ solo_no_leidas: false, limite: 20, desplazamiento: 0 }]);
});

it("asks the API for unread rows only on Sin leer, and filters Importantes locally", async () => {
  await renderInbox();
  await screen.findByText("Donación recibida");

  await fireEvent.press(screen.getByRole("radio", { name: "Importantes" }));
  expect(screen.getByText("Nueva oferta de recogida")).toBeOnTheScreen();
  expect(screen.queryByText("Donación recibida")).toBeNull();
  expect(inboxQueries()).toHaveLength(1);

  mockApi.get.mockResolvedValue(bandejaFixture([received]));
  await fireEvent.press(screen.getByRole("radio", { name: "Sin leer" }));

  await waitFor(() =>
    expect(inboxQueries()).toContainEqual({ solo_no_leidas: true, limite: 20, desplazamiento: 0 }),
  );
  expect(await screen.findByText("Donación recibida")).toBeOnTheScreen();
});

it("animates every empty tab", async () => {
  mockApi.get.mockReset().mockResolvedValue(bandejaFixture([]));
  const animation = () =>
    screen.getByTestId("caught-up-animation", { includeHiddenElements: true });
  await renderInbox();

  expect(await screen.findByText("No tienes notificaciones")).toBeOnTheScreen();
  expect(animation()).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("radio", { name: "Importantes" }));
  expect(await screen.findByText("No hay notificaciones importantes")).toBeOnTheScreen();
  expect(animation()).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole("radio", { name: "Sin leer" }));
  expect(await screen.findByText("Estás al día")).toBeOnTheScreen();
  expect(animation()).toBeOnTheScreen();
});

it("marks an unread row read and opens its donation", async () => {
  const rendered = await renderInbox();

  await fireEvent.press(await screen.findByRole("button", { name: "Donación recibida, sin leer" }));

  await waitFor(() => expect(rendered.getPathname()).toBe("/donante/entrega-donacion"));
  expect(rendered.getSearchParams()).toEqual({ id: DONATION_ID });
  expect(mockApi.post).toHaveBeenCalledWith("/me/notificaciones/n-1/leer");
  expect(mockSetActiveRole).not.toHaveBeenCalled();
});

it("opens a read offer in the volunteer view without marking it again", async () => {
  const rendered = await renderInbox();

  await fireEvent.press(await screen.findByRole("button", { name: "Nueva oferta de recogida" }));

  await waitFor(() => expect(rendered.getPathname()).toBe("/voluntario/oferta"));
  expect(rendered.getSearchParams()).toEqual({ asignacionId: "asg-7" });
  expect(mockSetActiveRole).toHaveBeenCalledWith("VOLUNTARIO");
  expect(mockApi.post).not.toHaveBeenCalled();
});

it("marks every notification read from the header action", async () => {
  await renderInbox();

  await fireEvent.press(await screen.findByText("Marcar todas como leídas"));

  await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/me/notificaciones/leer-todas"));
});

describe("deleting a notification", () => {
  /** The gesture's accessible alternative: the row's "delete" action. */
  const deleteRow = (name: string) =>
    fireEvent(screen.getByRole("button", { name }), "accessibilityAction", {
      nativeEvent: { actionName: "delete" },
    });

  it("offers Eliminar as an accessibility action on each row", async () => {
    await renderInbox();

    const row = await screen.findByRole("button", { name: "Nueva oferta de recogida" });
    expect(row.props.accessibilityActions).toEqual([{ name: "delete", label: "Eliminar" }]);
  });

  it("removes an unread row at once and lowers the unread count", async () => {
    await renderInbox();
    await screen.findByText("Donación recibida");
    // The server no longer lists it once the DELETE lands.
    mockApi.get.mockResolvedValue(bandejaFixture([offer, delivered]));

    await deleteRow("Donación recibida, sin leer");

    await waitFor(() => expect(screen.queryByText("Donación recibida")).toBeNull());
    expect(mockApi.delete).toHaveBeenCalledWith("/me/notificaciones/n-1");
    expect(screen.queryByText("1 sin leer")).toBeNull();
    expect(screen.getByText("Nueva oferta de recogida")).toBeOnTheScreen();
  });

  it("puts the row back when the DELETE fails", async () => {
    let fail!: (error: unknown) => void;
    mockApi.delete.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    await renderInbox();
    await screen.findByText("Nueva oferta de recogida");

    await deleteRow("Nueva oferta de recogida");
    await waitFor(() => expect(screen.queryByText("Nueva oferta de recogida")).toBeNull());
    await act(async () => fail(new Error("offline")));

    expect(await screen.findByText("Nueva oferta de recogida")).toBeOnTheScreen();
    expect(mockApi.delete).toHaveBeenCalledWith("/me/notificaciones/n-2");
  });
});
