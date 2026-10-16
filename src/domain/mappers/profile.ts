/**
 * `GET /me` and `GET /me/impacto` → the display strings of the profile and account screens.
 * Numbers use a decimal comma; no Intl formatter is needed (Hermes support varies).
 */
import type { FranjaDto, MeDto } from "@/api/types";
import { normalizeColombianMobile } from "@/domain/validation/auth";

export interface ProfileView {
  /** Given names and surnames, or the email while the profile has no names. */
  name: string;
  /** One or two capital letters for the avatar. */
  initials: string;
  email: string;
  /** The phone, or "Sin registrar". */
  phone: string;
}

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function words(value: string | null): string[] {
  return value?.trim().split(/\s+/).filter(Boolean) ?? [];
}

const initial = (word: string | undefined) => word?.charAt(0).toUpperCase() ?? "";

export function profileFromMe(
  me: Pick<MeDto, "email" | "nombres" | "apellidos" | "telefono">,
): ProfileView {
  const given = words(me.nombres);
  const surnames = words(me.apellidos);
  const name = [...given, ...surnames].join(" ");
  const initials = surnames.length
    ? initial(given[0]) + initial(surnames[0])
    : initial(given[0]) + initial(given[1]);
  return {
    name: name || me.email,
    initials: initials || initial(me.email),
    email: me.email,
    phone: me.telefono ?? "Sin registrar",
  };
}

/** One decimal at most: `280 kg`, `12,5 kg`. */
export function formatKg(kg: number): string {
  return `${String(Math.round(kg * 10) / 10).replace(".", ",")} kg`;
}

/** `4,5 / 5`, or "Sin calificaciones" when the average is null. */
export function formatRating(average: number | null): string {
  if (average === null) return "Sin calificaciones";
  return `${(Math.round(average * 10) / 10).toFixed(1).replace(".", ",")} / 5`;
}

/** `Lun 08:00–12:00 · Mar 14:00–18:00`, in the order the API sends them. */
export function formatFranjas(franjas: readonly FranjaDto[]): string {
  if (franjas.length === 0) return "Sin horario registrado";
  return franjas
    .map(
      ({ dia_semana, hora_inicio, hora_fin }) =>
        `${WEEKDAYS[dia_semana] ?? "?"} ${hora_inicio.slice(0, 5)}–${hora_fin.slice(0, 5)}`,
    )
    .join(" · ");
}

/** The profile editor's validated values (the phone already as `+57XXXXXXXXXX`). */
export interface ProfileValues {
  nombres: string;
  apellidos: string;
  telefono: string;
}

/**
 * The `PATCH /me` body of the profile editor: only the fields that differ from the account,
 * so nothing else is rewritten. The stored phone is compared normalized.
 */
export function profileChanges(
  me: Pick<MeDto, "nombres" | "apellidos" | "telefono">,
  data: ProfileValues,
): Partial<ProfileValues> {
  const body: Partial<ProfileValues> = {};
  if (data.nombres !== (me.nombres ?? "")) body.nombres = data.nombres;
  if (data.apellidos !== (me.apellidos ?? "")) body.apellidos = data.apellidos;
  const currentPhone = me.telefono === null ? null : normalizeColombianMobile(me.telefono);
  if (data.telefono !== currentPhone) body.telefono = data.telefono;
  return body;
}
