/**
 * Spanish labels and badge tones of the API state enums.
 *
 * Each table is checked with `satisfies Record<Estado…, StatusView>`, so adding a value to
 * an enum in `@/api/types` fails the typecheck until it gets a label here. Labels reuse the
 * strings the screens already show ("Buscando voluntario", "Voluntario asignado",
 * "Completada", "En progreso"…) so wiring real data changes no copy.
 */
import type { EstadoAsignacion, EstadoDonacion, EstadoParada, EstadoRuta } from "@/api/types";
import { colors } from "@/design/tokens";

/** Named after the color token each tone is drawn with. */
export const STATUS_TONES = ["primary", "warning", "danger", "neutral"] as const;

export type StatusTone = (typeof STATUS_TONES)[number];

export interface StatusView {
  label: string;
  tone: StatusTone;
}

export interface ToneColors {
  text: string;
  background: string;
}

const TONE_COLORS = {
  // The default Badge: in-flow and successful states.
  primary: { text: colors.primary, background: colors.soft },
  // The warning Badge: live or waiting on someone.
  warning: { text: colors.warning, background: colors.warningSoft },
  danger: { text: colors.danger, background: colors.muted },
  neutral: { text: colors.secondary, background: colors.muted },
} satisfies Record<StatusTone, ToneColors>;

/** The color tokens of a tone; the same object on every call. */
export function toneColor(tone: StatusTone): ToneColors {
  return TONE_COLORS[tone];
}

export const estadosDonacion = {
  BORRADOR: { label: "Borrador", tone: "neutral" },
  PUBLICADA: { label: "Buscando voluntario", tone: "primary" },
  ASIGNADA: { label: "Voluntario asignado", tone: "primary" },
  EN_RECOLECCION: { label: "En camino a la recogida", tone: "primary" },
  EN_TRANSITO: { label: "En camino al banco", tone: "primary" },
  ENTREGADA: { label: "Entregada en el banco", tone: "primary" },
  RECIBIDA: { label: "Completada", tone: "primary" },
  RECHAZADA: { label: "Rechazada", tone: "danger" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
  EXPIRADA: { label: "Expirada", tone: "warning" },
} satisfies Record<EstadoDonacion, StatusView>;

export const estadosAsignacion = {
  OFRECIDA: { label: "Oferta pendiente", tone: "warning" },
  ACEPTADA: { label: "Aceptada", tone: "primary" },
  RECHAZADA: { label: "Rechazada", tone: "neutral" },
  EXPIRADA: { label: "Expirada", tone: "neutral" },
  ABANDONADA: { label: "Abandonada", tone: "danger" },
  COMPLETADA: { label: "Completada", tone: "primary" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
} satisfies Record<EstadoAsignacion, StatusView>;

export const estadosRuta = {
  PLANIFICADA: { label: "Planificada", tone: "primary" },
  EN_CURSO: { label: "En progreso", tone: "warning" },
  COMPLETADA: { label: "Completada", tone: "primary" },
  CANCELADA: { label: "Cancelada", tone: "neutral" },
} satisfies Record<EstadoRuta, StatusView>;

export const estadosParada = {
  PENDIENTE: { label: "Pendiente", tone: "neutral" },
  EN_SITIO: { label: "En el sitio", tone: "warning" },
  COMPLETADA: { label: "Completada", tone: "primary" },
  FALLIDA: { label: "Fallida", tone: "danger" },
  OMITIDA: { label: "Omitida", tone: "neutral" },
} satisfies Record<EstadoParada, StatusView>;

/**
 * The entry of `estado`, or a neutral one built from the raw value: the API may add a
 * state before the app ships its label, and that must not break a screen.
 */
function lookup<E extends string>(table: Record<E, StatusView>, estado: E): StatusView {
  if (Object.prototype.hasOwnProperty.call(table, estado)) return table[estado];
  const words = String(estado).toLowerCase().replace(/_/g, " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: "neutral" };
}

export const donacionStatus = (estado: EstadoDonacion) => lookup(estadosDonacion, estado);
export const asignacionStatus = (estado: EstadoAsignacion) => lookup(estadosAsignacion, estado);
export const rutaStatus = (estado: EstadoRuta) => lookup(estadosRuta, estado);
export const paradaStatus = (estado: EstadoParada) => lookup(estadosParada, estado);
