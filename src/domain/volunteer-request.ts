/**
 * The volunteer request form (`POST /voluntario/solicitud`, MOV-38): text values as typed,
 * validated with the API's rules and mapped to its body.
 *
 * Field names match the API body, so field errors from the API (`ApiError.fields`) land on
 * the same fields through `useZodForm`. The birth date is typed as `DD/MM/AAAA`; the age is
 * checked against the Bogotá calendar day of an injected `now`.
 */
import { z } from "zod";

import type { Coordenada } from "@/api/types";
import { parseDate, todayInBogota, toFechaVencimiento } from "@/domain/mappers/dates";
import { isInServiceArea } from "@/domain/mappers/geo";
import type { SolicitudVoluntarioBody } from "@/services/perfil";

export type VolunteerRequestForm = {
  /** Catalog id as text (the select's value). */
  tipo_vehiculo_id: string;
  placa_vehiculo: string;
  capacidad_carga_kg: string;
  capacidad_volumen_m3: string;
  tiene_refrigeracion: boolean;
  /** `DD/MM/AAAA`. */
  fecha_nacimiento: string;
  es_grupo: boolean;
  organizacion: string;
  ubicacion_base: Coordenada | null;
  radio_cobertura_km: string;
  /** Storage paths of the uploaded photos; empty until uploaded. */
  documento_frente: string;
  documento_reverso: string;
  selfie: string;
  url_foto_vehiculo: string;
};

export const initialVolunteerRequest: VolunteerRequestForm = {
  tipo_vehiculo_id: "",
  placa_vehiculo: "",
  capacidad_carga_kg: "",
  capacidad_volumen_m3: "",
  tiene_refrigeracion: false,
  fecha_nacimiento: "",
  es_grupo: false,
  organizacion: "",
  ubicacion_base: null,
  radio_cobertura_km: "",
  documento_frente: "",
  documento_reverso: "",
  selfie: "",
  url_foto_vehiculo: "",
};

const MIN_AGE = 18;
const PLATE_SEPARATORS = /[\s-]/g;
const PLATE = /^[A-Z0-9]{5,10}$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const INVALID_NUMBER = "Ingresa un número válido.";

/** `12,5` or `12.5` → 12.5; anything else → NaN. */
export function parseDecimal(text: string): number {
  const normalized = text.trim().replace(",", ".");
  return DECIMAL.test(normalized) ? Number(normalized) : Number.NaN;
}

/** A required number in `[min, max]`, typed with a comma or a dot. */
const requiredNumber = (missing: string, min: number, max: number, range: string) =>
  z
    .string()
    .trim()
    .min(1, missing)
    .transform(parseDecimal)
    .pipe(z.number(INVALID_NUMBER).min(min, range).max(max, range));

/** Like `requiredNumber`, but empty text means "not sent". */
const optionalNumber = (min: number, max: number, range: string) =>
  z
    .string()
    .trim()
    .transform((text) => (text === "" ? undefined : parseDecimal(text)))
    .pipe(z.number(INVALID_NUMBER).min(min, range).max(max, range).optional());

const RADIUS_RANGE = "El radio debe estar entre 1 y 100 km.";
const BASE_OUTSIDE_AREA = "Tu punto base debe estar en Bogotá o un municipio vecino.";

/** The profile editor's coverage radius: the account always has one, so it stays required. */
export const coverageRadiusKm = requiredNumber("Ingresa el radio de cobertura.", 1, 100, RADIUS_RANGE);

/**
 * The profile editor's base point: accounts that never chose one may keep it unset, but a
 * chosen point must be inside the service area.
 */
export const optionalBaseLocation = z
  .custom<Coordenada | null>(
    (value) => value === null || typeof value === "object",
    "Elige tu ubicación base en el mapa.",
  )
  .refine((point) => point === null || isInServiceArea(point), BASE_OUTSIDE_AREA);

const dateKey = ({ year, month, day }: { year: number; month: number; day: number }) =>
  year * 10000 + month * 100 + day;

/** `DD/MM/AAAA` → whether someone born that day is at least 18 on the Bogotá day of `now`. */
function isAdult(birth: string, now: number): boolean {
  const born = parseDate(birth);
  return dateKey({ ...born, year: born.year + MIN_AGE }) <= dateKey(parseDate(todayInBogota(now)));
}

function isCalendarDate(text: string): boolean {
  try {
    parseDate(text);
    return true;
  } catch {
    return false;
  }
}

const photo = (missing: string) => z.string().min(1, missing);
const optionalPhoto = z.string().transform((path) => (path === "" ? undefined : path));

/** The form schema; its output is the request body. */
export function volunteerRequestSchema(now: number) {
  return z
    .object({
      tipo_vehiculo_id: z
        .string()
        .min(1, "Selecciona el tipo de vehículo.")
        .transform(Number)
        .pipe(z.number().int().positive("Selecciona el tipo de vehículo.")),
      placa_vehiculo: z
        .string()
        .transform((text) => text.replace(PLATE_SEPARATORS, "").toUpperCase())
        .pipe(
          z
            .string()
            .min(1, "Ingresa la placa del vehículo.")
            .regex(PLATE, "La placa debe tener de 5 a 10 letras o números."),
        ),
      capacidad_carga_kg: requiredNumber(
        "Ingresa la capacidad de carga.",
        1,
        10_000,
        "La capacidad debe estar entre 1 y 10000 kg.",
      ),
      capacidad_volumen_m3: optionalNumber(0.01, 100, "El volumen debe estar entre 0,01 y 100 m³."),
      tiene_refrigeracion: z.boolean(),
      fecha_nacimiento: z
        .string()
        .trim()
        .min(1, "Ingresa tu fecha de nacimiento.")
        .refine(isCalendarDate, "Usa el formato DD/MM/AAAA.")
        .refine((text) => !isCalendarDate(text) || isAdult(text, now), "Debes tener al menos 18 años.")
        .transform(toFechaVencimiento),
      es_grupo: z.boolean(),
      organizacion: z.string().trim(),
      ubicacion_base: z
        .custom<Coordenada>(
          (value) => value !== null && typeof value === "object",
          "Elige tu ubicación base en el mapa.",
        )
        .refine(isInServiceArea, BASE_OUTSIDE_AREA),
      radio_cobertura_km: optionalNumber(1, 100, RADIUS_RANGE),
      documento_frente: photo("Sube la foto del frente de tu documento."),
      documento_reverso: optionalPhoto,
      selfie: optionalPhoto,
      url_foto_vehiculo: photo("Sube la foto del vehículo."),
    })
    .superRefine(
      ({ es_grupo, organizacion }, ctx) => {
        if (!es_grupo) return;
        if (organizacion.length < 2 || organizacion.length > 150) {
          ctx.addIssue({
            code: "custom",
            path: ["organizacion"],
            message:
              organizacion.length === 0
                ? "Ingresa el nombre de la organización."
                : "La organización debe tener de 2 a 150 caracteres.",
          });
        }
      },
      // Also with errors on other fields, so every mistake shows on the first submit.
      {
        when: ({ value }) => {
          const { es_grupo, organizacion } = (value ?? {}) as Record<string, unknown>;
          return typeof es_grupo === "boolean" && typeof organizacion === "string";
        },
      },
    )
    .transform(({ organizacion, es_grupo, ...data }): SolicitudVoluntarioBody => {
      const body: SolicitudVoluntarioBody = { ...data, es_grupo };
      if (es_grupo) body.organizacion = organizacion;
      // Optional fields left empty are not sent.
      for (const key of Object.keys(body) as (keyof SolicitudVoluntarioBody)[]) {
        if (body[key] === undefined) delete body[key];
      }
      return body;
    });
}

/** The request body of valid form values; throws a `ZodError` otherwise. */
export function toSolicitudVoluntarioBody(
  values: VolunteerRequestForm,
  now: number,
): SolicitudVoluntarioBody {
  return volunteerRequestSchema(now).parse(values);
}
