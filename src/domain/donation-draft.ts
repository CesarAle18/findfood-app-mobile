import { fromRequiereRefrigeracion } from "@/domain/mappers/refrigeration";
import { idToUnidad, isQuantityUnit } from "@/domain/mappers/units";
import type { TipoAlimentoDto, UnidadMedidaDto } from "@/services/catalogos";

export type QuantityUnit = "KG" | "L" | "ML" | "G";
export interface DraftProduct {
  id: number;
  /** `tipo_alimento_id` of the catalog food type; null until the donor picks one. */
  tipoAlimentoId: number | null;
  /** Name of the chosen food type, for the summaries. */
  name: string;
  quantity: string;
  unit: QuantityUnit;
  expiresOn: string;
  coldChain: string;
  /** The donor chose the unit: a food type's default unit no longer replaces it. */
  unitEdited: boolean;
  /** The donor chose the cold chain: a food type's default no longer replaces it. */
  coldChainEdited: boolean;
}
export interface DonationDraft {
  products: DraftProduct[];
  pickupFrom: string;
  pickupUntil: string;
}

function blankProduct(id: number): DraftProduct {
  return {
    id,
    tipoAlimentoId: null,
    name: "",
    quantity: "",
    unit: "KG",
    expiresOn: "",
    coldChain: "No requiere",
    unitEdited: false,
    coldChainEdited: false,
  };
}

export const initialDonationDraft: DonationDraft = {
  products: [blankProduct(1)],
  pickupFrom: "16:00",
  pickupUntil: "18:00",
};
export function appendProduct(draft: DonationDraft): DonationDraft {
  const id = Math.max(0, ...draft.products.map((p) => p.id)) + 1;
  return { ...draft, products: [...draft.products, blankProduct(id)] };
}

/** Conserva al menos un producto y no modifica el borrador original. */
export function removeProduct(draft: DonationDraft, id: number): DonationDraft {
  if (draft.products.length <= 1) return draft;
  return { ...draft, products: draft.products.filter(product => product.id !== id) };
}

export interface SelectOption {
  label: string;
  value: string;
}

/** The catalog food types for the "Producto" select, keyed by their id. */
export function foodTypeOptions(tipos: readonly TipoAlimentoDto[]): SelectOption[] {
  return tipos.map((tipo) => ({ label: tipo.nombre, value: String(tipo.id) }));
}

/** The catalog units the form offers (see `QuantityUnit`), keyed by their code. */
export function unitOptions(unidades: readonly UnidadMedidaDto[]): SelectOption[] {
  return unidades
    .filter((unidad) => isQuantityUnit(unidad.codigo))
    .map((unidad) => ({ label: unidad.codigo, value: unidad.codigo }));
}

/**
 * Picks a food type for a product. Its default unit and cold chain only fill what the donor
 * has not chosen yet; a default unit the form does not offer leaves the current one.
 */
export function applyTipoAlimento(
  product: DraftProduct,
  tipo: TipoAlimentoDto,
  unidades: readonly UnidadMedidaDto[],
): DraftProduct {
  return {
    ...product,
    tipoAlimentoId: tipo.id,
    name: tipo.nombre,
    unit: product.unitEdited ? product.unit : (defaultUnit(tipo, unidades) ?? product.unit),
    coldChain: product.coldChainEdited
      ? product.coldChain
      : fromRequiereRefrigeracion(tipo.requiere_refrigeracion),
  };
}

function defaultUnit(
  tipo: TipoAlimentoDto,
  unidades: readonly UnidadMedidaDto[],
): QuantityUnit | undefined {
  try {
    return idToUnidad(tipo.unidad_medida_id, unidades);
  } catch {
    return undefined;
  }
}
