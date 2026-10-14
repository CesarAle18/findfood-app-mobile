import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Alert, Text, type AlertButton } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { FranjaDto, MeDto } from "@/api/types";
import { EditAvailabilityScreen } from "@/screens/edit-availability";
import { EditProfileScreen } from "@/screens/edit-profile";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { meFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

// `useMe` reads the `/me` cache, so what the editors store there shows on screen.
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

// The reanimated mock has no LayoutAnimationConfig.
jest.mock("@/components/findfood/motion", () => ({
  ...jest.requireActual<typeof import("@/components/findfood/motion")>(
    "@/components/findfood/motion",
  ),
  LayoutAnimationConfig: ({ children }: { children: React.ReactNode }) => children,
}));

const mockedApi = api as unknown as ApiMock;
let client: QueryClient;
let rendered: ReturnType<typeof renderRouter> | undefined;

/** Opens `url` above a `/perfil` screen, so saving goes back to it. */
async function renderAt(url: string, me: MeDto) {
  client = createTestQueryClient();
  client.setQueryData(queryKeys.me, me);
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <Slot />
      </QueryClientProvider>
    );
  }
  rendered = renderRouter(
    {
      _layout: Layout,
      perfil: () => <Text>route:perfil</Text>,
      "editar-perfil": EditProfileScreen,
      "voluntario/editar-disponibilidad": EditAvailabilityScreen,
    },
    { initialUrl: "/perfil" },
  );
  await rendered;
  const { router } = jest.requireActual<typeof import("expo-router")>("expo-router");
  await act(async () => router.push(url as never));
}

const pathname = () => rendered!.getPathname();
const type = (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text);
const press = (name: string) => act(async () => fireEvent.press(screen.getByRole("button", { name })));
const cachedMe = () => client.getQueryData<MeDto>(queryKeys.me);

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("EditProfileScreen", () => {
  const account = () => meFixture({ nombres: "Ana", apellidos: "Ruiz", telefono: "+573001234567" });

  it("prefills the account's names and phone", async () => {
    await renderAt("/editar-perfil", account());

    expect(screen.getByLabelText("Nombres").props.value).toBe("Ana");
    expect(screen.getByLabelText("Apellidos").props.value).toBe("Ruiz");
    expect(screen.getByLabelText("Celular").props.value).toBe("+573001234567");
  });

  it("sends only the changed fields, stores the answer as /me and goes back", async () => {
    const updated = meFixture({ nombres: "Ana María", apellidos: "Ruiz", telefono: "+573109876543" });
    mockedApi.patch.mockResolvedValue(updated);
    await renderAt("/editar-perfil", account());

    await type("Nombres", "Ana María");
    await type("Celular", "310 987 6543");
    await press("Guardar cambios");

    expect(mockedApi.patch).toHaveBeenCalledTimes(1);
    expect(mockedApi.patch).toHaveBeenCalledWith("/me", {
      body: { nombres: "Ana María", telefono: "+573109876543" },
    });
    expect(cachedMe()).toEqual(updated);
    await waitFor(() => expect(pathname()).toBe("/perfil"));
  });

  it("validates on the client before sending", async () => {
    await renderAt("/editar-perfil", account());

    await type("Celular", "12345");
    await press("Guardar cambios");

    expect(
      screen.getByText("Ingresa un celular colombiano de 10 dígitos que empiece por 3."),
    ).toBeOnTheScreen();
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  it("puts a 422 field error on its field and stays", async () => {
    mockedApi.patch.mockRejectedValue(
      new ApiError({
        type: "validacion",
        status: 422,
        title: "Unprocessable",
        fields: { telefono: ["debe ser un celular de 10 dígitos, con +57 opcional"] },
      }),
    );
    await renderAt("/editar-perfil", account());

    await type("Celular", "3109876543");
    await press("Guardar cambios");

    expect(
      await screen.findByText("Debe ser un celular de 10 dígitos, con +57 opcional."),
    ).toBeOnTheScreen();
    expect(pathname()).toBe("/editar-perfil");
    expect(cachedMe()).toEqual(account());
  });
});

describe("EditAvailabilityScreen", () => {
  const withWindows = (disponibilidad: FranjaDto[], disponible = true): MeDto => {
    const base = meFixture();
    return { ...base, voluntario: { ...base.voluntario!, disponibilidad, disponible } };
  };

  it("sends the saved windows as HH:mm, by day and start, and merges them into /me", async () => {
    mockedApi.put.mockImplementation(async (_path: string, { body }: { body: unknown }) => body);
    await renderAt(
      "/voluntario/editar-disponibilidad",
      withWindows([
        { dia_semana: 3, hora_inicio: "14:00:00", hora_fin: "18:00:00" },
        { dia_semana: 0, hora_inicio: "09:00:00", hora_fin: "12:00:00" },
      ]),
    );

    await press("Guardar disponibilidad");

    const franjas = [
      { dia_semana: 0, hora_inicio: "09:00", hora_fin: "12:00" },
      { dia_semana: 3, hora_inicio: "14:00", hora_fin: "18:00" },
    ];
    expect(mockedApi.put).toHaveBeenCalledWith("/voluntario/disponibilidad", { body: { franjas } });
    expect(cachedMe()?.voluntario?.disponibilidad).toEqual(franjas);
    expect(cachedMe()?.voluntario?.disponible).toBe(true);
    await waitFor(() => expect(pathname()).toBe("/perfil"));
  });

  describe("with no window left", () => {
    let alert: jest.SpyInstance;

    beforeEach(() => {
      alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    });

    afterEach(() => alert.mockRestore());

    const confirmation = () => alert.mock.calls[0][2] as AlertButton[];

    it("asks first, then saves the empty list and turns Disponible off", async () => {
      mockedApi.put.mockResolvedValue({ franjas: [] });
      await renderAt(
        "/voluntario/editar-disponibilidad",
        withWindows([{ dia_semana: 1, hora_inicio: "08:00", hora_fin: "18:00" }]),
      );

      await press("Quitar franja 1 (Lunes)");
      await press("Guardar disponibilidad");

      expect(alert).toHaveBeenCalledTimes(1);
      expect(mockedApi.put).not.toHaveBeenCalled();
      await act(async () => confirmation().find((b) => b.style === "destructive")!.onPress!());

      expect(mockedApi.put).toHaveBeenCalledWith("/voluntario/disponibilidad", {
        body: { franjas: [] },
      });
      expect(cachedMe()?.voluntario?.disponible).toBe(false);
    });

    it("sends nothing when cancelled", async () => {
      await renderAt(
        "/voluntario/editar-disponibilidad",
        withWindows([{ dia_semana: 1, hora_inicio: "08:00", hora_fin: "18:00" }]),
      );

      await press("Quitar franja 1 (Lunes)");
      await press("Guardar disponibilidad");
      await act(async () => confirmation().find((b) => b.style === "cancel")?.onPress?.());

      expect(mockedApi.put).not.toHaveBeenCalled();
    });
  });

  it("explains a 422 franjas-solapadas and keeps the cache", async () => {
    mockedApi.put.mockRejectedValue(
      new ApiError({ status: 422, type: "franjas-solapadas", title: "Franjas solapadas" }),
    );
    const me = withWindows([{ dia_semana: 1, hora_inicio: "08:00", hora_fin: "12:00" }]);
    await renderAt("/voluntario/editar-disponibilidad", me);

    await press("Guardar disponibilidad");

    await waitFor(() =>
      expect(screen.getByText("Hay franjas horarias que se cruzan entre sí.")).toBeVisible(),
    );
    expect(pathname()).toBe("/voluntario/editar-disponibilidad");
    expect(cachedMe()).toEqual(me);
  });

  it("shows crossing windows on the client and does not send them", async () => {
    await renderAt(
      "/voluntario/editar-disponibilidad",
      withWindows([
        { dia_semana: 1, hora_inicio: "08:00", hora_fin: "12:00" },
        { dia_semana: 1, hora_inicio: "11:00", hora_fin: "14:00" },
      ]),
    );

    expect(
      screen.getByText("Las franjas del lunes se cruzan: 08:00–12:00 y 11:00–14:00."),
    ).toBeVisible();
    await press("Guardar disponibilidad");

    expect(mockedApi.put).not.toHaveBeenCalled();
  });
});
