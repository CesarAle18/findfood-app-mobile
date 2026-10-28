import { z } from "zod";

import type { Coordenada } from "@/api/types";
import {
  isBeforeTodayInBogota,
  parseDate,
  pickupWindowBounds,
  toFechaVencimiento,
  todayInBogota,
  toPickupWindow,
} from "@/domain/mappers/dates";
import { MappingError } from "@/domain/mappers/errors";
import { isInServiceArea } from "@/domain/mappers/geo";
import {
  fromRequiereRefrigeracion,
  toRequiereRefrigeracion,
} from "@/domain/mappers/refrigeration";
import { idToUnidad, isQuantityUnit, unidadToId } from "@/domain/mappers/units";
import type { TipoAlimentoDto, UnidadMedidaDto } from "@/services/catalogos";
import type { CrearDonacionBody, ItemDonacionBody } from "@/services/donaciones";

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
  /** Storage path of the uploaded photo (`ruta_foto`); null without one. */
  rutaFoto: string | null;
  /** Device file of that photo, for the review thumbnails. */
  fotoUri: string | null;
}
export interface DonationDraft {
  /** The donation created in the API (BORRADOR); a retry updates it instead of creating another. */
  apiId: string | null;
  products: DraftProduct[];
  /** `DD/MM/AAAA` (Bogotá) of the window start. */
  pickupDate: string;
  pickupFrom: string;
  pickupUntil: string;
  /** The address the donor typed; the map never overwrites it. */
  direccion: string;
  /** Optional landmark for the volunteer ("Portería norte"). */
  referencia: string;
  /**
   * The pickup point: located from the typed address, the device position or the map. Null
   * until one of them answers; a typed address is no location by itself.
   */
  ubicacionRecogida: Coordenada | null;
  /** The address text the point was located from, or null when it came from the device or map. */
  direccionUbicada: string | null;
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
    rutaFoto: null,
    fotoUri: null,
  };
}

/** A draft without a pickup date; screens start from `newDonationDraft`. */
export const initialDonationDraft: DonationDraft = {
  apiId: null,
  products: [blankProduct(1)],
  pickupDate: "",
  pickupFrom: "16:00",
  pickupUntil: "18:00",
  direccion: "",
  referencia: "",
  ubicacionRecogida: null,
  direccionUbicada: null,
};
/** A fresh draft that picks up today (Bogotá). */
export function newDonationDraft(now: number = Date.now()): DonationDraft {
  return { ...initialDonationDraft, pickupDate: todayInBogota(now) };
}

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

/** Where a pickup point came from (see `LocationPicker`). */
export type PickupPointSource = "address" | "device" | "map";

/** Sets the pickup point, remembering the address it was located from (if any). */
export function setUbicacion(
  draft: DonationDraft,
  point: Coordenada,
  source: PickupPointSource,
): DonationDraft {
  return {
    ...draft,
    ubicacionRecogida: point,
    direccionUbicada: source === "address" ? draft.direccion.trim() : null,
  };
}

/**
 * Applies a typed address. A point located from a different address text no longer matches
 * it and is dropped; a point from the device or the map stays.
 */
export function setDireccion(draft: DonationDraft, direccion: string): DonationDraft {
  const located = draft.direccionUbicada;
  if (located !== null && direccion.trim() !== located) {
    return { ...draft, direccion, ubicacionRecogida: null, direccionUbicada: null };
  }
  return { ...draft, direccion };
}

/** Applies an address suggested by the map only while the donor has not typed one. */
export function suggestDireccion(draft: DonationDraft, suggestion: string): DonationDraft {
  if (draft.direccion.trim() !== "") return draft;
  return { ...draft, direccion: suggestion };
}

// --- Submission ---------------------------------------------------------------------------

/** Shown until the donor locates the address, uses their location or moves the map. */
export const PICKUP_POINT_REQUIRED =
  "Ubica la dirección, usa tu ubicación o mueve el mapa para elegir el punto de recogida.";

/** Shown when the pickup point lies outside Bogotá and its neighbouring municipalities. */
export const PICKUP_POINT_OUTSIDE_AREA =
  "El punto de recogida debe estar en Bogotá o un municipio vecino.";

/** `items` bounds of `POST /donaciones`. */
const MAX_PRODUCTS = 30;
/** `cantidad` and `peso_estimado_kg` bounds of the API (2 decimals). */
const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 99_999_999;
/** `POST /donaciones/:id/publicar` refuses a start further back than this. */
const START_GRACE_MS = 5 * 60 * 1000;
/** `… /publicar` refuses a window that ends sooner than this. */
const MIN_REMAINING_MS = 15 * 60 * 1000;

const QUANTITY_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** A typed quantity (dot or comma, up to 2 decimals) within the API bounds, or null. */
export function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!QUANTITY_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  return value >= MIN_AMOUNT && value <= MAX_AMOUNT ? value : null;
}

/** What the body needs from `GET /catalogos`. */
export interface DraftCatalogs {
  unidades: readonly Pick<UnidadMedidaDto, "id" | "codigo" | "factor_a_kg">[];
}

function itemBody(product: DraftProduct, { unidades }: DraftCatalogs): ItemDonacionBody | null {
  const cantidad = parseQuantity(product.quantity);
  if (product.tipoAlimentoId === null || cantidad === null) return null;
  const unidadId = unidadToId(product.unit, unidades);
  const factor = unidades.find((unidad) => unidad.id === unidadId)?.factor_a_kg;
  if (factor == null) {
    throw new MappingError("unknown-unit", product.unit, `Unit ${product.unit} has no kg factor`);
  }
  return {
    tipo_alimento_id: product.tipoAlimentoId,
    unidad_medida_id: unidadId,
    cantidad,
    peso_estimado_kg: Math.max(MIN_AMOUNT, round2(cantidad * factor)),
    ...(product.expiresOn ? { fecha_vencimiento: toFechaVencimiento(product.expiresOn) } : {}),
    requiere_refrigeracion: toRequiereRefrigeracion(product.coldChain),
    ...(product.rutaFoto ? { ruta_foto: product.rutaFoto } : {}),
  };
}

/**
 * `POST /donaciones` (and the `PATCH` of an existing draft) from the form, or null while
 * the draft is incomplete (see `validateDraft` for the reasons). A unit missing from the
 * catalog, or without a kg factor, throws a `MappingError`.
 */
export function toCrearDonacionBody(
  draft: DonationDraft,
  catalogs: DraftCatalogs,
): CrearDonacionBody | null {
  const pickup = draftPickupBody(draft);
  if (!pickup || draft.products.length === 0 || draft.products.length > MAX_PRODUCTS) return null;
  const window = safely(() =>
    toPickupWindow({ date: draft.pickupDate, start: draft.pickupFrom, end: draft.pickupUntil }),
  );
  if (!window) return null;
  const items: ItemDonacionBody[] = [];
  for (const product of draft.products) {
    const item = itemBody(product, catalogs);
    if (!item) return null;
    items.push(item);
  }
  return { ...window, ...pickup, items };
}

/** The result of a mapping, or null when the input does not parse. */
function safely<T>(map: () => T): T | null {
  try {
    return map();
  } catch (error) {
    if (error instanceof MappingError) return null;
    throw error;
  }
}

// --- Validation ---------------------------------------------------------------------------

/** Spanish messages keyed by draft field; products by `productErrorKey`. */
export type DraftErrors = Partial<Record<string, string>>;

type ProductField = "tipoAlimentoId" | "quantity" | "expiresOn" | "rutaFoto";

export function productErrorKey(id: number, field: ProductField): string {
  return `products.${id}.${field}`;
}

const isDate = (value: string) => safely(() => parseDate(value)) !== null;

function draftSchema(now: number) {
  const product = z.object({
    tipoAlimentoId: z
      .number()
      .nullable()
      .refine((id) => id !== null, "Selecciona el producto."),
    quantity: z
      .string()
      .refine(
        (text) => parseQuantity(text) !== null,
        "Ingresa una cantidad mayor que 0, con máximo 2 decimales.",
      ),
    expiresOn: z
      .string()
      .refine((date) => date === "" || isDate(date), "Ingresa una fecha válida.")
      .refine(
        (date) => !isDate(date) || !isBeforeTodayInBogota(date, now),
        "El producto ya está vencido.",
      ),
    rutaFoto: z
      .string()
      .nullable()
      .refine((ruta) => ruta !== null && ruta !== "", "Agrega una foto del producto."),
  });
  return z
    .object({
      products: z
        .array(product)
        .min(1, "Agrega al menos un producto.")
        .max(MAX_PRODUCTS, `Puedes donar como máximo ${MAX_PRODUCTS} productos.`),
      pickupDate: z.string().refine(isDate, "Selecciona la fecha de recogida."),
      pickupFrom: z.string(),
      pickupUntil: z.string(),
      direccion: z.string().trim().min(5, "Ingresa una dirección de al menos 5 caracteres."),
      ubicacionRecogida: z
        .object({ lat: z.number(), lng: z.number() })
        .nullable()
        .refine((point) => point !== null, PICKUP_POINT_REQUIRED)
        .refine((point) => point === null || isInServiceArea(point), PICKUP_POINT_OUTSIDE_AREA),
    })
    .superRefine((draft, ctx) => {
      if (!isDate(draft.pickupDate)) return;
      const issue = (field: "pickupFrom" | "pickupUntil", message: string) =>
        ctx.addIssue({ code: "custom", path: [field], message });
      if (draft.pickupFrom === draft.pickupUntil) {
        issue("pickupUntil", "La hora de fin debe ser distinta de la de inicio.");
        return;
      }
      const bounds = safely(() =>
        pickupWindowBounds({
          date: draft.pickupDate,
          start: draft.pickupFrom,
          end: draft.pickupUntil,
        }),
      );
      if (!bounds) {
        issue("pickupFrom", "Selecciona las horas de recogida.");
        return;
      }
      if (bounds.start < now - START_GRACE_MS) {
        issue("pickupFrom", "La recogida no puede empezar en el pasado.");
      }
      if (bounds.end < now + MIN_REMAINING_MS) {
        issue("pickupUntil", "La recogida debe terminar al menos 15 minutos después de ahora.");
      }
    });
}

/**
 * Checks the draft against the rules `POST /donaciones` and `… /publicar` apply, so the
 * donor sees them by field before sending. Null when the draft can be published.
 *
 * @param now Epoch milliseconds; the window and the expiry depend on it.
 */
export function validateDraft(draft: DonationDraft, now: number): DraftErrors | null {
  const result = draftSchema(now).safeParse(draft);
  if (result.success) return null;
  const errors: DraftErrors = {};
  for (const issue of result.error.issues) {
    const [field, index, productField] = issue.path;
    const key =
      field === "products" && typeof index === "number" && typeof productField === "string"
        ? productErrorKey(draft.products[index].id, productField as ProductField)
        : String(field);
    errors[key] ??= issue.message;
  }
  return errors;
}
