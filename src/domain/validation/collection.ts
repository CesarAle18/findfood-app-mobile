/**
 * Client validation for registering a pickup (`POST /paradas/:id/confirmar` on a RECOGIDA):
 * product condition, the actual weight per item (typed with a decimal comma or dot) and the
 * observations. Limits mirror the API: weights above 0 with at most 2 decimals, observations
 * up to 1000 characters.
 */
import { z } from "zod";

import type { EstadoProducto } from "@/api/types";

/** The largest weight the API column holds (numeric(10,2)). */
export const MAX_WEIGHT_KG = 99_999_999;

/** Mirrors the API limit of `observaciones`. */
export const OBSERVACIONES_MAX = 1000;

const DECIMAL = /^\d+(?:\.\d+)?$/;
const TWO_DECIMALS = /^\d+(?:\.\d{1,2})?$/;

/** "12,5" or "12.5" as text with a dot, trimmed. */
const normalized = (text: string) => text.trim().replace(",", ".");

/** The weight in a field, or null while it is not a (non-negative) number. */
export function parseWeightInput(text: string): number | null {
  const value = normalized(text);
  return DECIMAL.test(value) ? Number(value) : null;
}

/** The estimate as a field's starting text, with a decimal comma. */
export function formatWeightInput(kg: number): string {
  return String(kg).replace(".", ",");
}

/** Rounded to cents, so 0.1 + 0.2 reads 0.3. */
const roundKg = (kg: number) => Math.round(kg * 100) / 100;

/** The kilograms the readable fields add up to, for the live total. */
export function liveTotalKg(pesos: readonly WeightRow[]): number {
  return roundKg(pesos.reduce((total, row) => total + (parseWeightInput(row.value) ?? 0), 0));
}

const weight = z
  .string()
  .transform(normalized)
  .pipe(
    z
      .string()
      .min(1, "Ingresa el peso recogido.")
      .regex(DECIMAL, "Ingresa un peso válido, por ejemplo 12,5.")
      .regex(TWO_DECIMALS, "Usa como máximo 2 decimales."),
  )
  .transform(Number)
  .pipe(
    z
      .number()
      .positive("El peso debe ser mayor que 0.")
      .max(MAX_WEIGHT_KG, "El peso es demasiado alto."),
  );

const TOTAL_REQUIRED = "El total recogido debe ser mayor que 0.";
const TOTAL_TOO_HIGH = "El total recogido supera el máximo permitido.";

const collectionSchema = z.object({
  estado: z.enum(["BUENO", "REGULAR", "MALO"], "Selecciona el estado del producto."),
  pesos: z.array(z.object({ itemId: z.string().nullable(), value: weight })).min(1, TOTAL_REQUIRED),
  observaciones: z
    .string()
    .trim()
    .max(OBSERVACIONES_MAX, `Las observaciones admiten hasta ${OBSERVACIONES_MAX} caracteres.`),
});

/** One weight field: a donation item, or the whole pickup when the donation lists none. */
export interface WeightRow {
  itemId: string | null;
  value: string;
}

/** The form as typed. `estado` is empty until the volunteer picks one. */
export interface CollectionValues {
  estado: EstadoProducto | "";
  pesos: WeightRow[];
  observaciones: string;
}

/** The pickup's part of the confirmation body. */
export interface CollectionData {
  estado_producto: EstadoProducto;
  items: { item_id: string; peso_real_kg: number }[];
  peso_confirmado_kg: number;
  observaciones?: string;
}

export interface CollectionErrors {
  estado?: string;
  /** By the row's index. */
  pesos: Record<number, string>;
  observaciones?: string;
  form?: string;
}

export type CollectionResult =
  | { ok: true; data: CollectionData }
  | { ok: false; errors: CollectionErrors };

/** The confirmation fields of a valid form, or the first message per field and row. */
export function validateCollection(values: CollectionValues): CollectionResult {
  const parsed = collectionSchema.safeParse(values);
  if (!parsed.success) {
    const errors: CollectionErrors = { pesos: {} };
    for (const issue of parsed.error.issues) {
      const [field, index] = issue.path;
      if (field === "pesos" && typeof index === "number") errors.pesos[index] ??= issue.message;
      else if (field === "estado") errors.estado ??= issue.message;
      else if (field === "observaciones") errors.observaciones ??= issue.message;
      else errors.form ??= issue.message;
    }
    return { ok: false, errors };
  }
  const { estado, pesos, observaciones } = parsed.data;
  const total = roundKg(pesos.reduce((sum, row) => sum + row.value, 0));
  if (total <= 0 || total > MAX_WEIGHT_KG) {
    const form = total > MAX_WEIGHT_KG ? TOTAL_TOO_HIGH : TOTAL_REQUIRED;
    return { ok: false, errors: { pesos: {}, form } };
  }
  return {
    ok: true,
    data: {
      estado_producto: estado,
      items: pesos.flatMap((row) =>
        row.itemId === null ? [] : [{ item_id: row.itemId, peso_real_kg: row.value }],
      ),
      peso_confirmado_kg: total,
      ...(observaciones !== "" ? { observaciones } : {}),
    },
  };
}
