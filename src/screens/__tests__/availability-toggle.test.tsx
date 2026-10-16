import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { MeDto } from "@/api/types";
import { AvailabilityToggle } from "@/location/availability-toggle";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { meFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

// `useMe` reads the `/me` cache, so the optimistic update and its rollback show on screen.
jest.mock("@/state/session", () => {
  const { useQuery } = jest.requireActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  const { queryKeys: keys } = jest.requireActual<typeof import("@/services/query-keys")>(
    "@/services/query-keys",
  );
  return {
    useMe: () => useQuery({ queryKey: keys.me, queryFn: () => new Promise(() => {}) }),
  };
});

const mockedApi = api as unknown as ApiMock;
let client: QueryClient;

function me(disponible: boolean): MeDto {
  const base = meFixture();
  return { ...base, voluntario: { ...base.voluntario!, disponible } };
}

async function renderToggle(disponible: boolean) {
  client = createTestQueryClient();
  client.setQueryData(queryKeys.me, me(disponible));
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <Slot />
      </QueryClientProvider>
    );
  }
  function Pantalla() {
    return <AvailabilityToggle setupHref="/voluntario/perfil" />;
  }
  await renderRouter({ _layout: Layout, pantalla: Pantalla, "voluntario/perfil": () => null }, {
    initialUrl: "/pantalla",
  });
}

const cachedDisponible = () => client.getQueryData<MeDto>(queryKeys.me)?.voluntario?.disponible;

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("AvailabilityToggle", () => {
  it("sends PATCH /voluntario/estado with the new value", async () => {
    mockedApi.patch.mockResolvedValue({ disponible: false });
    await renderToggle(true);

    await act(async () => fireEvent.press(screen.getByText("No disponible")));

    expect(mockedApi.patch).toHaveBeenCalledWith("/voluntario/estado", {
      body: { disponible: false },
    });
  });

  it("rolls back and explains a missing schedule, linking to where to fix it", async () => {
    mockedApi.patch.mockRejectedValue(
      new ApiError({ status: 422, type: "sin-horario", title: "Sin horario" }),
    );
    await renderToggle(false);

    await act(async () => fireEvent.press(screen.getByText("Disponible")));

    await waitFor(() =>
      expect(screen.getByText("Agrega al menos una franja de disponibilidad.")).toBeVisible(),
    );
    expect(cachedDisponible()).toBe(false);
    expect(screen.getByText("Completar mi disponibilidad")).toBeVisible();
  });

  it("does not offer the setup link for other errors", async () => {
    mockedApi.patch.mockRejectedValue(new ApiError({ status: 500, type: "x", title: "x" }));
    await renderToggle(false);

    await act(async () => fireEvent.press(screen.getByText("Disponible")));

    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalled());
    expect(screen.queryByText("Completar mi disponibilidad")).toBeNull();
  });
});
