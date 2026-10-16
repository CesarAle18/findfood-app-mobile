import { act, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import { api } from "@/api";
import { ApiError } from "@/api/errors";
import type { MeDto } from "@/api/types";
import { queryKeys } from "@/services/query-keys";
import { resetApiMock, sentRequests, type ApiMock, type SentRequest } from "@/test-utils/api";
import { meFixture } from "@/test-utils/fixtures";
import { mutationCase, renderWithClient } from "@/test-utils/query";

import {
  actualizarDisponibilidad,
  actualizarPerfil,
  cambiarDisponible,
  eliminarDispositivo,
  getImpacto,
  registrarDispositivo,
  registrarUbicacion,
  solicitarVoluntario,
  useActualizarDisponibilidadMutation,
  useActualizarPerfilMutation,
  useCambiarDisponibleMutation,
  useEliminarDispositivoMutation,
  useImpacto,
  useRegistrarDispositivoMutation,
  useRegistrarUbicacionMutation,
  useSolicitarVoluntarioMutation,
  type DispositivoDto,
  type ImpactoDto,
  type SolicitudVoluntarioBody,
} from "./perfil";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

// The device id helpers live in the session module, which imports the Supabase client.
jest.mock("@/auth/supabase", () => ({
  supabase: null,
  refreshAccessToken: jest.fn(),
  signOutLocally: jest.fn(),
}));

const mockSecureValues = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureValues.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureValues.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureValues.delete(key);
  }),
}));

const mockedApi = api as unknown as ApiMock;
const signal = new AbortController().signal;
const DEVICE_ID_KEY = "findfood.deviceId";

const solicitud: SolicitudVoluntarioBody = {
  tipo_vehiculo_id: 2,
  placa_vehiculo: "ABC123",
  url_foto_vehiculo: "documentos-identidad/u-1/vehiculo.jpg",
  capacidad_carga_kg: 120,
  tiene_refrigeracion: false,
  fecha_nacimiento: "1995-04-12",
  ubicacion_base: { lat: 4.65, lng: -74.06 },
  documento_frente: "documentos-identidad/u-1/frente.jpg",
};
const franjas = [{ dia_semana: 1, hora_inicio: "08:00", hora_fin: "12:00" }];
const device: DispositivoDto = {
  id: "dev-1",
  plataforma: "ANDROID",
  modelo: "Pixel 8",
  version_app: "1.0.0",
  activo: true,
};

beforeEach(() => {
  resetApiMock(mockedApi);
  mockSecureValues.clear();
});

describe("requests", () => {
  it.each<[string, () => Promise<unknown>, SentRequest]>([
    ["getImpacto", () => getImpacto(signal), { method: "get", path: "/me/impacto", options: { signal } }],
    [
      "actualizarPerfil",
      () => actualizarPerfil({ telefono: "3001234567", acepto_terminos: true }),
      {
        method: "patch",
        path: "/me",
        options: { body: { telefono: "3001234567", acepto_terminos: true } },
      },
    ],
    [
      "solicitarVoluntario",
      () => solicitarVoluntario(solicitud),
      { method: "post", path: "/voluntario/solicitud", options: { body: solicitud } },
    ],
    [
      "actualizarDisponibilidad",
      () => actualizarDisponibilidad({ franjas }),
      { method: "put", path: "/voluntario/disponibilidad", options: { body: { franjas } } },
    ],
    [
      "cambiarDisponible",
      () => cambiarDisponible({ disponible: true }),
      { method: "patch", path: "/voluntario/estado", options: { body: { disponible: true } } },
    ],
    [
      "registrarUbicacion",
      () => registrarUbicacion({ lat: 4.6, lng: -74.08 }),
      { method: "post", path: "/voluntario/ubicacion", options: { body: { lat: 4.6, lng: -74.08 } } },
    ],
  ])("%s", async (_name, call, request) => {
    await call();
    expect(sentRequests(mockedApi)).toEqual([request]);
  });
});

describe("push device", () => {
  it("registers the device and stores its id for sign-out", async () => {
    mockedApi.post.mockResolvedValueOnce(device);

    await expect(
      registrarDispositivo({ token_push: "ExponentPushToken[abc]", plataforma: "ANDROID" }),
    ).resolves.toEqual(device);

    expect(sentRequests(mockedApi)).toEqual([
      {
        method: "post",
        path: "/me/dispositivos",
        options: { body: { token_push: "ExponentPushToken[abc]", plataforma: "ANDROID" } },
      },
    ]);
    expect(mockSecureValues.get(DEVICE_ID_KEY)).toBe("dev-1");
  });

  it("rolls the registration back when its id cannot be stored", async () => {
    mockedApi.post.mockResolvedValueOnce(device);
    jest
      .mocked(SecureStore.setItemAsync)
      .mockRejectedValueOnce(new Error("keychain unavailable"));

    await expect(
      registrarDispositivo({ token_push: "ExponentPushToken[abc]", plataforma: "ANDROID" }),
    ).rejects.toThrow("keychain unavailable");

    // Without the stored id sign-out could not unregister it, so the device is deleted now.
    expect(sentRequests(mockedApi)).toEqual([
      {
        method: "post",
        path: "/me/dispositivos",
        options: { body: { token_push: "ExponentPushToken[abc]", plataforma: "ANDROID" } },
      },
      { method: "delete", path: "/me/dispositivos/dev-1" },
    ]);
    expect(mockSecureValues.has(DEVICE_ID_KEY)).toBe(false);
  });

  it("forgets the stored id when that device is deleted", async () => {
    mockSecureValues.set(DEVICE_ID_KEY, "dev-1");

    await eliminarDispositivo("dev-1");

    expect(sentRequests(mockedApi)).toEqual([{ method: "delete", path: "/me/dispositivos/dev-1" }]);
    expect(mockSecureValues.has(DEVICE_ID_KEY)).toBe(false);
  });

  it("keeps the stored id when another device is deleted", async () => {
    mockSecureValues.set(DEVICE_ID_KEY, "dev-2");

    await eliminarDispositivo("dev-1");

    expect(mockSecureValues.get(DEVICE_ID_KEY)).toBe("dev-2");
  });

  it("keeps the stored id when the delete fails", async () => {
    mockSecureValues.set(DEVICE_ID_KEY, "dev-1");
    mockedApi.delete.mockRejectedValueOnce(new Error("offline"));

    await expect(eliminarDispositivo("dev-1")).rejects.toThrow("offline");

    expect(mockSecureValues.get(DEVICE_ID_KEY)).toBe("dev-1");
  });
});

describe("queries", () => {
  it("useImpacto caches GET /me/impacto under perfil.impacto()", async () => {
    const impacto: ImpactoDto = { donante: null, voluntario: null };
    mockedApi.get.mockResolvedValueOnce(impacto);

    const { result, client } = await renderWithClient(() => useImpacto());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(queryKeys.perfil.impacto())).toEqual(impacto);
    expect(sentRequests(mockedApi)).toEqual([
      { method: "get", path: "/me/impacto", options: { signal: expect.any(AbortSignal) } },
    ]);
  });
});

describe("mutations invalidate exactly the queries they change", () => {
  beforeEach(() => {
    mockedApi.post.mockResolvedValue(device);
  });

  it.each([
    mutationCase("PATCH /me", useActualizarPerfilMutation, { nombres: "Ana" }, [queryKeys.me]),
    mutationCase("POST /voluntario/solicitud", useSolicitarVoluntarioMutation, solicitud, [
      queryKeys.me,
    ]),
    mutationCase("PUT /voluntario/disponibilidad", useActualizarDisponibilidadMutation, { franjas }, [
      queryKeys.me,
    ]),
    mutationCase("PATCH /voluntario/estado", useCambiarDisponibleMutation, { disponible: false }, [
      queryKeys.me,
    ]),
    mutationCase("POST /voluntario/ubicacion", useRegistrarUbicacionMutation, { lat: 4.6, lng: -74.1 }, []),
    mutationCase(
      "POST /me/dispositivos",
      useRegistrarDispositivoMutation,
      { token_push: "ExponentPushToken[abc]", plataforma: "IOS" },
      [],
    ),
    mutationCase("DELETE /me/dispositivos/:id", useEliminarDispositivoMutation, "dev-1", []),
  ])("$name", async ({ invalidated, expected }) => {
    expect(await invalidated()).toEqual(expected);
  });
});

describe("useCambiarDisponibleMutation is optimistic", () => {
  async function toggle(reply: () => Promise<unknown>) {
    mockedApi.patch.mockImplementationOnce(reply);
    const { result, client } = await renderWithClient(useCambiarDisponibleMutation);
    client.setQueryData(queryKeys.me, meFixture());
    const seen: (boolean | undefined)[] = [];
    client.getQueryCache().subscribe(() => {
      seen.push(client.getQueryData<MeDto>(queryKeys.me)?.voluntario?.disponible);
    });
    await act(async () => {
      await result.current.mutateAsync({ disponible: false }).catch(() => undefined);
    });
    return { client, seen };
  }

  it("turns the toggle off at once", async () => {
    const { seen } = await toggle(async () => ({ disponible: false }));
    expect(seen).toContain(false);
  });

  it("rolls back when the API refuses (422 sin-horario)", async () => {
    const { client, seen } = await toggle(() =>
      Promise.reject(new ApiError({ status: 422, type: "sin-horario", title: "Sin horario" })),
    );

    expect(seen).toContain(false);
    expect(client.getQueryData<MeDto>(queryKeys.me)?.voluntario?.disponible).toBe(true);
  });
});
