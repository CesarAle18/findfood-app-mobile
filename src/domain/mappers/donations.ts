/**
 * Donation DTOs of `GET /donaciones` and `GET /donaciones/:id` → the presentation model the
 * donor screens already render (`Donation`), so wiring real data changes no layout.
 *
 * Gaps against `Donation`, as the API sends them today:
 * - `id` is the UUID (for navigation and requests); the human code the screens show
 *   (`DON-1058`) moves to the new `code` field.
 * - `category`: the list has no food types, so it shows the donor's title or the product
 *   count; the detail falls back to its food type names.
 * - `expiresOn`: the list has no expiry date, so it is empty there; the detail shows the
 *   earliest one (`fecha_vencimiento_min`). Empty means "no data": screens pick the
 *   placeholder.
 */
import type { EstadoDonacion } from "@/api/types";
import type { Donation } from "@/domain/models";
import type { DonacionDetalleDto, DonacionResumenDto } from "@/services/donaciones";

import { fromFechaVencimiento, fromPickupWindow } from "./dates";
import { MappingError } from "./errors";
import { donacionStatus, type StatusTone } from "./statuses";

/** `Donation` plus the fields real data needs and the fixtures never had. */
export interface DonationView extends Donation {
  /** Human code shown to people (`DON-1058`). */
  code: string;
  /** The raw state, for filters and flow decisions (never compare `status` labels). */
  estado: EstadoDonacion;
  statusTone: StatusTone;
}

type DonacionComun = Pick<
  DonacionResumenDto,
  | "id"
  | "codigo"
  | "estado"
  | "titulo"
  | "peso_estimado_kg"
  | "requiere_refrigeracion"
  | "ventana_recogida_inicio"
  | "ventana_recogida_fin"
  | "direccion_recogida"
>;

/** Shown instead of a pickup window the app cannot read. */
export const UNKNOWN_PICKUP_WINDOW = "Ventana por confirmar";

function pickupDisplay(dto: DonacionComun, now: number | undefined): string {
  return fromPickupWindow(dto.ventana_recogida_inicio, dto.ventana_recogida_fin, now).display;
}

function baseView(
  dto: DonacionComun,
  fallbackCategory: string,
  expiresOn: string,
  pickupWindow: string,
): DonationView {
  const { label, tone } = donacionStatus(dto.estado);
  return {
    id: dto.id,
    code: dto.codigo,
    estado: dto.estado,
    category: dto.titulo?.trim() || fallbackCategory,
    weightKg: dto.peso_estimado_kg,
    status: label,
    statusTone: tone,
    pickupWindow,
    expiresOn,
    address: dto.direccion_recogida,
    refrigerated: dto.requiere_refrigeracion,
  };
}

/** "A", "A y B", "A, B y C". */
function joinSpanish(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * A row of `GET /donaciones`.
 *
 * @param now Epoch milliseconds; when given, the window reads "Hoy"/"Mañana".
 */
export function donationFromResumen(dto: DonacionResumenDto, now?: number): DonationView {
  return resumenView(dto, pickupDisplay(dto, now));
}

/**
 * A row of `GET /donaciones` for a list: like `donationFromResumen`, but a window the app
 * cannot read (a MappingError) shows `UNKNOWN_PICKUP_WINDOW` instead of failing the whole
 * list. Other errors still throw.
 */
export function donationRowFromResumen(dto: DonacionResumenDto, now?: number): DonationView {
  return resumenView(dto, orIfUnreadable(() => pickupDisplay(dto, now), UNKNOWN_PICKUP_WINDOW));
}

/** `read()`, or `fallback` when the value cannot be read (a MappingError); other errors throw. */
function orIfUnreadable(read: () => string, fallback: string): string {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof MappingError)) throw error;
    return fallback;
  }
}

function resumenView(dto: DonacionResumenDto, pickupWindow: string): DonationView {
  const count = dto.cantidad_productos;
  return baseView(dto, `${count} ${count === 1 ? "producto" : "productos"}`, "", pickupWindow);
}

export interface AssignedVolunteerView {
  name: string;
  /** Vehicle type, plus the plate once the API shares it (`Camioneta · ABC123`). */
  vehicle: string;
  phone: string | null;
}

/** The volunteer of a donation's assignment, or null while nobody holds it. */
export function assignedVolunteerFromDetalle(
  dto: Pick<DonacionDetalleDto, "asignacion">,
): AssignedVolunteerView | null {
  const voluntario = dto.asignacion?.voluntario;
  if (!voluntario) return null;
  return {
    name: [voluntario.nombres, voluntario.apellidos].filter(Boolean).join(" "),
    vehicle: [voluntario.tipo_vehiculo, voluntario.placa_vehiculo].filter(Boolean).join(" · "),
    phone: voluntario.telefono,
  };
}

/**
 * `GET /donaciones/:id`.
 *
 * @param now Epoch milliseconds; when given, the window reads "Hoy"/"Mañana".
 */
export function donationFromDetalle(dto: DonacionDetalleDto, now?: number): DonationView {
  return detalleView(dto, expiryDisplay(dto), pickupDisplay(dto, now));
}

/**
 * `GET /donaciones/:id` for the detail screens: like `donationFromDetalle`, but each field
 * the app cannot read (a MappingError) falls back on its own instead of failing the screen,
 * as the list row does. The window shows `UNKNOWN_PICKUP_WINDOW` and the expiry is left
 * empty (screens show their placeholder). Other errors still throw.
 */
export function tolerantDonationFromDetalle(dto: DonacionDetalleDto, now?: number): DonationView {
  return detalleView(
    dto,
    orIfUnreadable(() => expiryDisplay(dto), ""),
    orIfUnreadable(() => pickupDisplay(dto, now), UNKNOWN_PICKUP_WINDOW),
  );
}

/** The earliest expiry, or empty when no product declares one. */
function expiryDisplay(dto: Pick<DonacionDetalleDto, "fecha_vencimiento_min">): string {
  return dto.fecha_vencimiento_min ? fromFechaVencimiento(dto.fecha_vencimiento_min) : "";
}

function detalleView(
  dto: DonacionDetalleDto,
  expiresOn: string,
  pickupWindow: string,
): DonationView {
  const foodTypes = [...new Set(dto.items.map((item) => item.tipo_alimento.nombre))];
  return baseView(dto, joinSpanish(foodTypes), expiresOn, pickupWindow);
}
