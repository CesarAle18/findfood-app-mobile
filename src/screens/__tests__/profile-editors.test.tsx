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

/** The role the fake session reports as active. */
let mockActiveRole: "DONANTE" | "VOLUNTARIO" = "DONANTE";

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
    useAccess: () => ({ activeRole: mockActiveRole }),
  };
});

/** The point the mocked map picks; a test may move it outside the service area. */
let mockBasePoint = { lat: 4.7, lng: -74.05 };

// react-native-maps needs its native module: a button picks the base point.
jest.mock("@/components/findfood/map", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    LocationPicker: ({ onChange }: { onChange: (point: { lat: number; lng: number }) => void }) =>
      createElement(
        Pressable,
        { accessibilityRole: "button", onPress: () => onChange(mockBasePoint) },
        createElement(RNText, null, "Elegir ubicación"),
      ),
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
  mockActiveRole = "DONANTE";
  mockBasePoint = { lat: 4.7, lng: -74.05 };
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

describe("EditProfileScreen for the volunteer view", () => {
  const volunteer = (voluntario: Partial<NonNullable<MeDto["voluntario"]>> = {}): MeDto => {
    const base = meFixture();
    return { ...base, voluntario: { ...base.voluntario!, ...voluntario } };
  };
  const radius = () => screen.getByLabelText("Radio de cobertura (km)");

  beforeEach(() => {
    mockActiveRole = "VOLUNTARIO";
  });

  it("groups the contact fields and shows the vehicle read-only", async () => {
    await renderAt("/editar-perfil", volunteer());

    expect(screen.getByText("Información de voluntario")).toBeOnTheScreen();
    expect(screen.getByLabelText("Nombres").props.value).toBe("María");
    expect(screen.getByLabelText("Celular").props.value).toBe("+573001234567");
    expect(screen.getByText("Vehículo y zona")).toBeOnTheScreen();
    expect(screen.getByText("Camioneta")).toBeOnTheScreen();
    expect(screen.getByText("ABC123")).toBeOnTheScreen();
    expect(screen.getByText("500 kg")).toBeOnTheScreen();
    // Vehicle, plate and capacity are not inputs.
    expect(screen.queryByDisplayValue("ABC123")).toBeNull();
    expect(screen.queryByDisplayValue("500")).toBeNull();
    expect(screen.queryByLabelText(/^Placa/)).toBeNull();
    expect(screen.getByRole("radio", { name: "Sí, dispone" })).toBeChecked();
    expect(radius().props.value).toBe("10");
  });

  it("sends only the changed cold chain and radius to PATCH /voluntario/perfil", async () => {
    const updated = volunteer({ tiene_refrigeracion: false, radio_cobertura_km: 25 });
    mockedApi.patch.mockResolvedValue(updated);
    await renderAt("/editar-perfil", volunteer());

    await act(async () => fireEvent.press(screen.getByRole("radio", { name: "No dispone" })));
    await type("Radio de cobertura (km)", "25");
    await press("Guardar cambios");

    expect(mockedApi.patch).toHaveBeenCalledTimes(1);
    expect(mockedApi.patch).toHaveBeenCalledWith("/voluntario/perfil", {
      body: { tiene_refrigeracion: false, radio_cobertura_km: 25 },
    });
    expect(cachedMe()).toEqual(updated);
    await waitFor(() => expect(pathname()).toBe("/perfil"));
  });

  it("sends a moved base point", async () => {
    mockedApi.patch.mockResolvedValue(volunteer({ ubicacion_base: mockBasePoint }));
    await renderAt("/editar-perfil", volunteer());

    await press("Elegir ubicación");
    await press("Guardar cambios");

    expect(mockedApi.patch).toHaveBeenCalledTimes(1);
    expect(mockedApi.patch).toHaveBeenCalledWith("/voluntario/perfil", {
      body: { ubicacion_base: { lat: 4.7, lng: -74.05 } },
    });
  });

  it("sends changed names only to PATCH /me", async () => {
    const updated = volunteer();
    mockedApi.patch.mockResolvedValue({ ...updated, nombres: "Ana" });
    await renderAt("/editar-perfil", volunteer());

    await type("Nombres", "Ana");
    await press("Guardar cambios");

    expect(mockedApi.patch).toHaveBeenCalledTimes(1);
    expect(mockedApi.patch).toHaveBeenCalledWith("/me", { body: { nombres: "Ana" } });
    await waitFor(() => expect(pathname()).toBe("/perfil"));
  });

  it("sends both requests one after another and keeps the last account", async () => {
    const afterMe = { ...volunteer(), nombres: "Ana" };
    const afterVolunteer = { ...volunteer({ radio_cobertura_km: 30 }), nombres: "Ana" };
    mockedApi.patch.mockResolvedValueOnce(afterMe).mockResolvedValueOnce(afterVolunteer);
    await renderAt("/editar-perfil", volunteer());

    await type("Nombres", "Ana");
    await type("Radio de cobertura (km)", "30");
    await press("Guardar cambios");

    expect(mockedApi.patch.mock.calls).toEqual([
      ["/me", { body: { nombres: "Ana" } }],
      ["/voluntario/perfil", { body: { radio_cobertura_km: 30 } }],
    ]);
    expect(cachedMe()).toEqual(afterVolunteer);
    await waitFor(() => expect(pathname()).toBe("/perfil"));
  });

  it("goes back without requests when nothing changed", async () => {
    await renderAt("/editar-perfil", volunteer());

    await press("Guardar cambios");

    expect(mockedApi.patch).not.toHaveBeenCalled();
    await waitFor(() => expect(pathname()).toBe("/perfil"));
  });

  it("does not require a base point the account never had", async () => {
    mockedApi.patch.mockResolvedValue(volunteer({ ubicacion_base: null, radio_cobertura_km: 20 }));
    await renderAt("/editar-perfil", volunteer({ ubicacion_base: null }));

    await type("Radio de cobertura (km)", "20");
    await press("Guardar cambios");

    expect(mockedApi.patch).toHaveBeenCalledWith("/voluntario/perfil", {
      body: { radio_cobertura_km: 20 },
    });
  });

  it("validates the radius and the base point on the client", async () => {
    mockBasePoint = { lat: 6.24, lng: -75.58 };
    await renderAt("/editar-perfil", volunteer());

    await type("Radio de cobertura (km)", "150");
    await press("Elegir ubicación");
    await press("Guardar cambios");

    expect(screen.getByText("El radio debe estar entre 1 y 100 km.")).toBeOnTheScreen();
    expect(
      screen.getByText("Tu punto base debe estar en Bogotá o un municipio vecino."),
    ).toBeOnTheScreen();
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  it("puts a 400 radius error from the API on the radius field and stays", async () => {
    mockedApi.patch.mockRejectedValue(
      new ApiError({
        type: "validacion",
        status: 400,
        title: "Bad Request",
        fields: { radio_cobertura_km: ["must not be greater than 100"] },
      }),
    );
    await renderAt("/editar-perfil", volunteer());

    await type("Radio de cobertura (km)", "50");
    await press("Guardar cambios");

    expect(await screen.findByText("Debe ser menor o igual a 100.")).toBeOnTheScreen();
    expect(radius().props.accessibilityHint).toContain("Debe ser menor o igual a 100.");
    expect(pathname()).toBe("/editar-perfil");
  });

  it("keeps the contact-only form for a volunteer acting as donor", async () => {
    mockActiveRole = "DONANTE";
    await renderAt("/editar-perfil", volunteer());

    expect(screen.getByLabelText("Nombres")).toBeOnTheScreen();
    expect(screen.queryByText("Información de voluntario")).toBeNull();
    expect(screen.queryByText("Vehículo y zona")).toBeNull();
    expect(screen.queryByLabelText("Radio de cobertura (km)")).toBeNull();
  });

  it("keeps the contact-only form for an account without a volunteer profile", async () => {
    await renderAt("/editar-perfil", meFixture({ roles: ["DONANTE"], voluntario: null }));

    expect(screen.getByLabelText("Nombres")).toBeOnTheScreen();
    expect(screen.queryByText("Vehículo y zona")).toBeNull();
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
