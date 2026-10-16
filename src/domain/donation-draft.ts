import type { Coordenada } from "@/api/types";
import { fromRequiereRefrigeracion } from "@/domain/mappers/refrigeration";
import { idToUnidad, isQuantityUnit } from "@/domain/mappers/units";
import type { TipoAlimentoDto, UnidadMedidaDto } from "@/services/catalogos";
import type { CrearDonacionBody } from "@/services/donaciones";

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
  /** The address the donor typed; the map never overwrites it. */
  direccion: string;
  /** Optional landmark for the volunteer ("Portería norte"). */
  referencia: string;
  /** The point picked on the map; null until the donor moves it or uses their location. */
  ubicacionRecogida: Coordenada | null;
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
  direccion: "",
  referencia: "",
  ubicacionRecogida: null,
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

/** `direccion_recogida` bounds of `POST /donaciones` (after trimming). */
const DIRECCION_MIN = 5;

export type PickupBody = Pick<
  CrearDonacionBody,
  "direccion_recogida" | "referencia_recogida" | "ubicacion_recogida"
>;

/**
 * The pickup part of `POST /donaciones`: the typed address as is (trimmed) and the picked
 * point as `{ lat, lng }`. Null until both are usable.
 */
export function draftPickupBody(draft: DonationDraft): PickupBody | null {
  const direccion = draft.direccion.trim();
  if (!draft.ubicacionRecogida || direccion.length < DIRECCION_MIN) return null;
  const { lat, lng } = draft.ubicacionRecogida;
  const referencia = draft.referencia.trim();
  return {
    direccion_recogida: direccion,
    ...(referencia ? { referencia_recogida: referencia } : {}),
    ubicacion_recogida: { lat, lng },
  };
}

/** Applies an address suggested by the map only while the donor has not typed one. */
export function suggestDireccion(draft: DonationDraft, suggestion: string): DonationDraft {
  if (draft.direccion.trim() !== "") return draft;
  return { ...draft, direccion: suggestion };
}
