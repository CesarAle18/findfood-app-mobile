/**
 * Quantity units between the donation form (`KG`, `L`, `ML`, `G`) and `unidad_medida_id`.
 *
 * Ids are looked up by `codigo` in the `unidades_medida` list of `GET /catalogos`, never
 * hard-coded: they differ between databases. The catalog also has units the app does not
 * offer (UN, CAJA, BULTO); those are refused.
 */
import type { QuantityUnit } from "@/domain/donation-draft";
import type { UnidadMedidaDto } from "@/services/catalogos";

import { MappingError } from "./errors";

/** What the lookups need from each `/catalogos` unit. */
export type UnidadCatalogo = Pick<UnidadMedidaDto, "id" | "codigo">;

/** Keyed by every QuantityUnit, so a new unit in the form fails the typecheck here. */
const QUANTITY_UNITS = { KG: true, L: true, ML: true, G: true } satisfies Record<
  QuantityUnit,
  true
>;

export function isQuantityUnit(codigo: string): codigo is QuantityUnit {
  return Object.prototype.hasOwnProperty.call(QUANTITY_UNITS, codigo);
}

/** A catalog `codigo` → the form's unit; refuses units the app does not offer. */
export function toQuantityUnit(codigo: string): QuantityUnit {
  if (!isQuantityUnit(codigo)) {
    throw new MappingError("unsupported-unit", codigo, `Unsupported unit: ${codigo}`);
  }
  return codigo;
}

/** The form's unit → its `unidad_medida_id` in the catalog. */
export function unidadToId(codigo: QuantityUnit, catalogo: readonly UnidadCatalogo[]): number {
  // Typed callers cannot pass other codes; this guards untyped values from forms or storage.
  toQuantityUnit(codigo);
  const unidad = catalogo.find((candidate) => candidate.codigo === codigo);
  if (!unidad) {
    throw new MappingError("unknown-unit", codigo, `Unit ${codigo} is not in the catalog`);
  }
  return unidad.id;
}

/** A `unidad_medida_id` → the form's unit. */
export function idToUnidad(id: number, catalogo: readonly UnidadCatalogo[]): QuantityUnit {
  const unidad = catalogo.find((candidate) => candidate.id === id);
  if (!unidad) {
    throw new MappingError("unknown-unit", id, `Unit id ${id} is not in the catalog`);
  }
  return toQuantityUnit(unidad.codigo);
}
