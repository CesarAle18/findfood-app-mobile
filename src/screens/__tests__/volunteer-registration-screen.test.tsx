/**
 * Registro voluntario (MOV-38): the request form sends `POST /voluntario/solicitud`, and the
 * state of the last request from `GET /me` replaces the form.
 */
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import { act, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";
import { Text } from "react-native";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { MeDto, MeVoluntarioDto } from "@/api/types";
import { VolunteerRegistrationScreen } from "@/screens/volunteer";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { catalogosFixture, meFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

// `useMe` reads the `/me` cache the test sets.
jest.mock("@/state/session", () => {
  const { useQuery } = jest.requireActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  const { queryKeys: keys } = jest.requireActual<typeof import("@/services/query-keys")>(
    "@/services/query-keys",
  );
  return {
    useMe: () => useQuery({ queryKey: keys.me, queryFn: () => new Promise(() => {}) }),
    useAccess: () => ({ canVolunteer: false, setActiveRole: () => {} }),
  };
});

jest.mock("@/components/findfood/motion", () => ({
  ...jest.requireActual<typeof import("@/components/findfood/motion")>(
    "@/components/findfood/motion",
  ),
  LayoutAnimationConfig: ({ children }: { children: React.ReactNode }) => children,
}));

// The real field needs the native picker and an upload; this one reports a path at once.
jest.mock("@/components/findfood/photo-field", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  const { Pressable, Text: RNText } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    PhotoField: ({
      label,
      proposito,
      onUploaded,
    }: {
      label: string;
      proposito: string;
      onUploaded?: (result: { ruta: string }) => void;
    }) =>
      createElement(
        Pressable,
        {
          accessibilityRole: "button",
          accessibilityLabel: `Subir ${label}`,
          onPress: () => onUploaded?.({ ruta: `${proposito}/${label.split(" ")[0]}.jpg` }),
        },
        createElement(RNText, null, label),
      ),
  };
});

/** The point the mocked map picks; a test may move it outside the service area. */
let mockBasePoint = { lat: 4.65, lng: -74.06 };

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

const mockApi = api as unknown as ApiMock;
let client: QueryClient;

async function renderRegistration(me: MeDto) {
  client = createTestQueryClient();
  client.setQueryData(queryKeys.me, me);
  function Layout() {
    return (
      <QueryClientProvider client={client}>
        <Slot />
      </QueryClientProvider>
    );
  }
  await renderRouter(
    {
      _layout: Layout,
      "donante/registro-voluntario": VolunteerRegistrationScreen,
      donante: () => <Text>Inicio</Text>,
    },
    { initialUrl: "/donante/registro-voluntario" },
  );
}

const withRequest = (voluntario: Partial<MeVoluntarioDto>) => {
  const base = meFixture({ roles: ["DONANTE"] });
  return { ...base, voluntario: { ...meFixture().voluntario!, ...voluntario } };
};

const press = (name: string) =>
  act(async () => fireEvent.press(screen.getByRole("button", { name })));
const type = (label: string, text: string) =>
  act(async () => fireEvent.changeText(screen.getByLabelText(label), text));

async function fillRequired() {
  await act(async () => fireEvent.press(await screen.findByLabelText("Tipo de vehículo *: Selecciona")));
  await act(async () => fireEvent.press(screen.getByText("Camioneta")));
  await type("Placa *", "abc 123");
  await type("Capacidad de carga (kg) *", "800");
  await type("Fecha de nacimiento *", "12/04/1995");
  await act(async () => fireEvent.press(screen.getByRole("radio", { name: "Sí, dispone" })));
  await press("Elegir ubicación");
  await press("Subir Vehículo");
  await press("Subir Documento (frente) *");
}

beforeEach(() => {
  mockBasePoint = { lat: 4.65, lng: -74.06 };
  resetApiMock(mockApi);
  mockApi.get.mockImplementation(async (path: string) => {
    if (path === "/catalogos") return catalogosFixture;
    throw new Error(`unexpected GET ${path}`);
  });
});

afterEach(() => {
  client.clear();
});

describe("VolunteerRegistrationScreen", () => {
  const donor = () => meFixture({ roles: ["DONANTE"], voluntario: null });

  it("offers the catalog vehicle types", async () => {
    await renderRegistration(donor());

    await act(async () => fireEvent.press(await screen.findByLabelText("Tipo de vehículo *: Selecciona")));
    expect(screen.getByText("Motocicleta")).toBeOnTheScreen();
    await act(async () => fireEvent.press(screen.getByText("Camioneta")));
    expect(screen.getByLabelText("Tipo de vehículo *: Camioneta")).toBeOnTheScreen();
  });

  it("sends the mapped request and then shows it in review", async () => {
    mockApi.post.mockResolvedValue({
      voluntario_id: "voluntario-9",
      verificacion: { id: "ver-1", estado: "PENDIENTE", created_at: "2026-10-16T13:00:00.000Z" },
    });
    await renderRegistration(donor());
    await fillRequired();

    await press("Enviar solicitud");

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith("/voluntario/solicitud", {
        body: {
          tipo_vehiculo_id: 32,
          placa_vehiculo: "ABC123",
          url_foto_vehiculo: "VEHICULO/Vehículo.jpg",
          capacidad_carga_kg: 800,
          tiene_refrigeracion: true,
          fecha_nacimiento: "1995-04-12",
          es_grupo: false,
          ubicacion_base: { lat: 4.65, lng: -74.06 },
          documento_frente: "DOCUMENTO_IDENTIDAD/Documento.jpg",
        },
      }),
    );
    expect(await screen.findByText("Tu solicitud está en revisión")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Enviar solicitud" })).toBeNull();
  });

  it("does not send an incomplete request and marks what is missing", async () => {
    await renderRegistration(donor());
    await screen.findByLabelText("Tipo de vehículo *: Selecciona");

    await press("Enviar solicitud");

    expect(mockApi.post).not.toHaveBeenCalled();
    expect(screen.getByText("Ingresa la placa del vehículo.")).toBeOnTheScreen();
    expect(screen.getByText("Sube la foto del vehículo.")).toBeOnTheScreen();
    expect(screen.getByText("Elige tu ubicación base en el mapa.")).toBeOnTheScreen();
  });

  it("does not send a base point outside Bogotá's service area", async () => {
    mockBasePoint = { lat: 6.24, lng: -75.58 };
    await renderRegistration(donor());
    await fillRequired();

    await press("Enviar solicitud");

    expect(mockApi.post).not.toHaveBeenCalled();
    expect(
      screen.getByText("Tu punto base debe estar en Bogotá o un municipio vecino."),
    ).toBeOnTheScreen();
  });

  it("explains a plate that is already registered", async () => {
    mockApi.post.mockRejectedValue(
      new ApiError({ type: "placa-registrada", status: 409, title: "Placa registrada" }),
    );
    await renderRegistration(donor());
    await fillRequired();

    await press("Enviar solicitud");

    expect(await screen.findByText("Esa placa ya está registrada.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Enviar solicitud" })).toBeOnTheScreen();
  });

  it("shows a rejected photo on its own field", async () => {
    mockApi.post.mockRejectedValue(
      new ApiError({
        type: "archivo-invalido",
        status: 422,
        title: "Archivo inválido",
        extensions: { campo: "selfie" },
      }),
    );
    await renderRegistration(donor());
    await fillRequired();

    await press("Enviar solicitud");

    expect(await screen.findAllByText("El archivo no es válido o está dañado.")).toHaveLength(1);
    // A field error, not a form one: a new selfie clears it.
    await press("Subir Selfie");
    expect(screen.queryByText("El archivo no es válido o está dañado.")).toBeNull();
  });

  it("shows a pending request instead of the form", async () => {
    await renderRegistration(withRequest({ estado_verificacion: "PENDIENTE" }));

    expect(await screen.findByText("Tu solicitud está en revisión")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Enviar solicitud" })).toBeNull();
  });

  it("shows why a request was rejected and allows a new one", async () => {
    await renderRegistration(
      withRequest({
        estado_verificacion: "RECHAZADA",
        verificacion: {
          estado: "RECHAZADA",
          observacion: "La foto del documento está borrosa.",
          motivo: "Documento ilegible",
          solicitada_at: "2026-10-01T13:00:00.000Z",
          revisada_at: "2026-10-02T13:00:00.000Z",
        },
      }),
    );

    expect(await screen.findByText("Motivo: Documento ilegible")).toBeOnTheScreen();
    expect(screen.getByText("La foto del documento está borrosa.")).toBeOnTheScreen();
    await press("Enviar una nueva solicitud");
    expect(screen.getByRole("button", { name: "Enviar solicitud" })).toBeOnTheScreen();
  });

  it("tells an approved volunteer the request is done", async () => {
    await renderRegistration(withRequest({ estado_verificacion: "APROBADA" }));

    expect(await screen.findByText("Ya eres voluntario")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Enviar solicitud" })).toBeNull();
  });
});
