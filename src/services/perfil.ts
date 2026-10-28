/**
 * Profile, push devices and volunteer self-service (`/me`, `/voluntario`).
 *
 * `GET /me` itself is read with `useMe()` from `@/state/session`: the session owns that
 * query (it gates navigation), so this module only invalidates `queryKeys.me`.
 */
import { queryOptions, useMutation, useQuery, type QueryClient } from "@tanstack/react-query";

import { api } from "@/api";
import type { Coordenada, EstadoVerificacion, FranjaDto, MeDto } from "@/api/types";
import { deviceIdStorage } from "@/state/device-storage";

import { invalidateKeys, invalidateOnSuccess, queryKeys, type Invalidation } from "./query-keys";

// --- DTOs ------------------------------------------------------------------------------

/** `PATCH /me`. An empty `apellidos` clears it; `acepto_terminos` only accepts `true`. */
export type ActualizarPerfilBody = {
  nombres?: string;
  apellidos?: string;
  /** 10 digits, `+57` optional. */
  telefono?: string;
  acepto_terminos?: true;
};

/**
 * `PATCH /voluntario/perfil`: at least one field. Vehicle type, plate and capacity cannot
 * change here (400).
 */
export type ActualizarPerfilVoluntarioBody = {
  tiene_refrigeracion?: boolean;
  /** Inside Bogotá or a neighbouring municipality. */
  ubicacion_base?: Coordenada;
  /** 1–100. */
  radio_cobertura_km?: number;
};

export interface ImpactoDonanteDto {
  id: string;
  total_donaciones: number;
  total_kg_donados: number;
  calificacion_promedio: number | null;
  total_calificaciones: number;
  donaciones_entregadas: number;
  kg_entregados: number;
  donaciones_canceladas: number;
  primera_donacion: string | null;
  ultima_donacion: string | null;
}

/** Only for approved volunteers. */
export interface ImpactoVoluntarioDto {
  id: string;
  total_entregas: number;
  total_kg_transportados: number;
  calificacion_promedio: number | null;
  estado_verificacion: EstadoVerificacion;
  recolecciones_completadas: number;
}

/** `GET /me/impacto`. */
export interface ImpactoDto {
  donante: ImpactoDonanteDto | null;
  voluntario: ImpactoVoluntarioDto | null;
}

export type PlataformaDispositivo = "ANDROID" | "IOS" | "WEB";

/** `POST /me/dispositivos`: re-registering a token moves it to this account. */
export type RegistrarDispositivoBody = {
  token_push: string;
  plataforma: PlataformaDispositivo;
  modelo?: string;
  version_app?: string;
};

export interface DispositivoDto {
  id: string;
  plataforma: PlataformaDispositivo;
  modelo: string | null;
  version_app: string | null;
  activo: boolean;
}

/** `POST /voluntario/solicitud`. File fields are paths from `POST /evidencias/upload-url`. */
export type SolicitudVoluntarioBody = {
  tipo_vehiculo_id: number;
  placa_vehiculo: string;
  /** Upload purpose VEHICULO. */
  url_foto_vehiculo: string;
  capacidad_carga_kg: number;
  capacidad_volumen_m3?: number;
  tiene_refrigeracion: boolean;
  /** `YYYY-MM-DD`; at least 18 years old. */
  fecha_nacimiento: string;
  es_grupo?: boolean;
  /** Required when `es_grupo`. */
  organizacion?: string;
  ubicacion_base: Coordenada;
  /** Default 10. */
  radio_cobertura_km?: number;
  /** Upload purpose DOCUMENTO_IDENTIDAD. */
  documento_frente: string;
  documento_reverso?: string;
  selfie?: string;
};

export interface SolicitudVoluntarioDto {
  voluntario_id: string;
  verificacion: { id: string; estado: EstadoVerificacion; created_at: string };
}

/** `PUT /voluntario/disponibilidad`: replaces every window (at most 42). */
export type DisponibilidadBody = { franjas: FranjaDto[] };

/** `PATCH /voluntario/estado`. */
export type EstadoVoluntarioBody = { disponible: boolean };

// --- Requests ----------------------------------------------------------------------------

export function getImpacto(signal?: AbortSignal): Promise<ImpactoDto> {
  return api.get<ImpactoDto>("/me/impacto", { signal });
}

/** Answers the updated `GET /me`. */
export function actualizarPerfil(body: ActualizarPerfilBody): Promise<MeDto> {
  return api.patch<MeDto>("/me", { body });
}

/** Cold chain and operation zone of the volunteer; answers the updated `GET /me` too. */
export function actualizarPerfilVoluntario(body: ActualizarPerfilVoluntarioBody): Promise<MeDto> {
  return api.patch<MeDto>("/voluntario/perfil", { body });
}

/**
 * Registers this install for push and stores its id, so sign-out can unregister it. If the
 * id cannot be stored the registration is deleted again and the error surfaces, so a later
 * attempt retries instead of leaving a device that sign-out cannot unregister.
 */
export async function registrarDispositivo(
  body: RegistrarDispositivoBody,
): Promise<DispositivoDto> {
  const device = await api.post<DispositivoDto>("/me/dispositivos", { body });
  try {
    await deviceIdStorage.save(device.id);
  } catch (error) {
    await api.delete(`/me/dispositivos/${encodeURIComponent(device.id)}`).catch(() => undefined);
    throw error;
  }
  return device;
}

/** Forgets the stored id too when it is this install's device. */
export async function eliminarDispositivo(id: string): Promise<void> {
  await api.delete(`/me/dispositivos/${encodeURIComponent(id)}`);
  if ((await deviceIdStorage.read()) === id) await deviceIdStorage.clear();
}

export function solicitarVoluntario(
  body: SolicitudVoluntarioBody,
): Promise<SolicitudVoluntarioDto> {
  return api.post<SolicitudVoluntarioDto>("/voluntario/solicitud", { body });
}

export function actualizarDisponibilidad(body: DisponibilidadBody): Promise<DisponibilidadBody> {
  return api.put<DisponibilidadBody>("/voluntario/disponibilidad", { body });
}

/** Turning it on fails without windows (`sin-horario`) or base location (`sin-ubicacion-base`). */
export function cambiarDisponible(body: EstadoVoluntarioBody): Promise<EstadoVoluntarioBody> {
  return api.patch<EstadoVoluntarioBody>("/voluntario/estado", { body });
}

/** Periodic sample of the volunteer's last position. */
export function registrarUbicacion(ubicacion: Coordenada): Promise<{ registrada: true }> {
  return api.post<{ registrada: true }>("/voluntario/ubicacion", { body: ubicacion });
}

// --- Queries -----------------------------------------------------------------------------

export function impactoQuery() {
  return queryOptions({
    queryKey: queryKeys.perfil.impacto(),
    queryFn: ({ signal }) => getImpacto(signal),
  });
}

export function useImpacto() {
  return useQuery(impactoQuery());
}

// --- Mutations ---------------------------------------------------------------------------

/** What each mutation leaves stale. */
const invalidates = {
  /** Name, phone, terms and the pending steps they clear. */
  actualizarPerfil: () => [queryKeys.me],
  /** `me.voluntario` cold chain, base point and radius. */
  actualizarPerfilVoluntario: () => [queryKeys.me],
  /** `me.voluntario` appears with its verification PENDIENTE. */
  solicitarVoluntario: () => [queryKeys.me],
  /** `me.voluntario.disponibilidad` (and `disponible` turns off with no windows). */
  actualizarDisponibilidad: () => [queryKeys.me],
  /** `me.voluntario.disponible`. */
  cambiarDisponible: () => [queryKeys.me],
  /** The last position is not part of any query. */
  registrarUbicacion: () => [],
  /** Devices are not listed by any query. */
  registrarDispositivo: () => [],
  eliminarDispositivo: () => [],
} satisfies Record<string, Invalidation<never, never>>;

export function useActualizarPerfilMutation() {
  return useMutation({
    mutationFn: actualizarPerfil,
    onSuccess: invalidateOnSuccess(invalidates.actualizarPerfil),
  });
}

export function useActualizarPerfilVoluntarioMutation() {
  return useMutation({
    mutationFn: actualizarPerfilVoluntario,
    onSuccess: invalidateOnSuccess(invalidates.actualizarPerfilVoluntario),
  });
}

export function useSolicitarVoluntarioMutation() {
  return useMutation({
    mutationFn: solicitarVoluntario,
    onSuccess: invalidateOnSuccess(invalidates.solicitarVoluntario),
  });
}

export function useActualizarDisponibilidadMutation() {
  return useMutation({
    mutationFn: actualizarDisponibilidad,
    onSuccess: invalidateOnSuccess(invalidates.actualizarDisponibilidad),
  });
}

/** Sets `me.voluntario.disponible` in the `/me` cache at once; returns the previous account. */
async function setDisponibleOptimistically(
  client: QueryClient,
  disponible: boolean,
): Promise<MeDto | undefined> {
  await client.cancelQueries({ queryKey: queryKeys.me });
  const previous = client.getQueryData<MeDto>(queryKeys.me);
  if (previous?.voluntario) {
    client.setQueryData<MeDto>(queryKeys.me, {
      ...previous,
      voluntario: { ...previous.voluntario, disponible },
    });
  }
  return previous;
}

/**
 * Optimistic: the toggle moves at once; a refusal (422 `sin-horario` / `sin-ubicacion-base`)
 * restores the cached account, and `/me` is fetched again either way.
 */
export function useCambiarDisponibleMutation() {
  return useMutation({
    mutationFn: cambiarDisponible,
    onMutate: ({ disponible }: EstadoVoluntarioBody, { client }) =>
      setDisponibleOptimistically(client, disponible),
    onError: (_error, _variables, previous, { client }) => {
      if (previous) client.setQueryData(queryKeys.me, previous);
    },
    onSettled: (_data, _error, _variables, _previous, { client }) =>
      invalidateKeys(client, invalidates.cambiarDisponible()),
  });
}

export function useRegistrarUbicacionMutation() {
  return useMutation({
    mutationFn: registrarUbicacion,
    onSuccess: invalidateOnSuccess(invalidates.registrarUbicacion),
  });
}

export function useRegistrarDispositivoMutation() {
  return useMutation({
    mutationFn: registrarDispositivo,
    onSuccess: invalidateOnSuccess(invalidates.registrarDispositivo),
  });
}

export function useEliminarDispositivoMutation() {
  return useMutation({
    mutationFn: eliminarDispositivo,
    onSuccess: invalidateOnSuccess(invalidates.eliminarDispositivo),
  });
}
