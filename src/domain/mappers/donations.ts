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

function baseView(
  dto: DonacionComun,
  category: string,
  expiresOn: string,
  now: number | undefined,
): DonationView {
  const { label, tone } = donacionStatus(dto.estado);
  return {
    id: dto.id,
    code: dto.codigo,
    estado: dto.estado,
    category: dto.titulo?.trim() || category,
    weightKg: dto.peso_estimado_kg,
    status: label,
    statusTone: tone,
    pickupWindow: fromPickupWindow(dto.ventana_recogida_inicio, dto.ventana_recogida_fin, now)
      .display,
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
  const count = dto.cantidad_productos;
  return baseView(dto, `${count} ${count === 1 ? "producto" : "productos"}`, "", now);
}

/**
 * `GET /donaciones/:id`.
 *
 * @param now Epoch milliseconds; when given, the window reads "Hoy"/"Mañana".
 */
export function donationFromDetalle(dto: DonacionDetalleDto, now?: number): DonationView {
  const foodTypes = [...new Set(dto.items.map((item) => item.tipo_alimento.nombre))];
  const expiresOn = dto.fecha_vencimiento_min
    ? fromFechaVencimiento(dto.fecha_vencimiento_min)
    : "";
  return baseView(dto, joinSpanish(foodTypes), expiresOn, now);
}
