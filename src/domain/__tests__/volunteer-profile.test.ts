/**
 * The volunteer's profile editor: contact fields plus cold chain and operation zone, validated
 * with the API's rules, and the `PATCH /voluntario/perfil` body of what changed.
 */
import { volunteerProfileChanges } from "@/domain/mappers/profile";
import { editVolunteerProfileSchema } from "@/domain/validation/auth";

const filled = (overrides: Record<string, unknown> = {}) => ({
  nombres: "María",
  apellidos: "García López",
  telefono: "300 123 4567",
  tiene_refrigeracion: true,
  ubicacion_base: { lat: 4.65, lng: -74.06 } as { lat: number; lng: number } | null,
  radio_cobertura_km: "12,5",
  ...overrides,
});

/** The message of the first issue on `field`, or undefined when it is valid. */
function errorOn(values: Record<string, unknown>, field: string) {
  const result = editVolunteerProfileSchema.safeParse(values);
  return result.success
    ? undefined
    : result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("editVolunteerProfileSchema", () => {
  it("parses the radius with a comma and keeps the cold chain and base point", () => {
    expect(editVolunteerProfileSchema.parse(filled())).toEqual({
      nombres: "María",
      apellidos: "García López",
      telefono: "+573001234567",
      tiene_refrigeracion: true,
      ubicacion_base: { lat: 4.65, lng: -74.06 },
      radio_cobertura_km: 12.5,
    });
  });

  it("accepts an account without a base point", () => {
    expect(editVolunteerProfileSchema.parse(filled({ ubicacion_base: null }))).toMatchObject({
      ubicacion_base: null,
    });
  });

  it("rejects a base point outside the service area", () => {
    expect(errorOn(filled({ ubicacion_base: { lat: 6.24, lng: -75.58 } }), "ubicacion_base")).toBe(
      "Tu punto base debe estar en Bogotá o un municipio vecino.",
    );
  });

  it.each(["0", "101", "diez"])("rejects the radius %p", (radius) => {
    expect(errorOn(filled({ radio_cobertura_km: radius }), "radio_cobertura_km")).toMatch(
      /radio debe estar entre 1 y 100 km|número válido/,
    );
  });

  it("requires the radius", () => {
    expect(errorOn(filled({ radio_cobertura_km: " " }), "radio_cobertura_km")).toBe(
      "Ingresa el radio de cobertura.",
    );
  });
});

describe("volunteerProfileChanges", () => {
  const voluntario = {
    tiene_refrigeracion: true,
    ubicacion_base: { lat: 4.65, lng: -74.06 },
    radio_cobertura_km: 10,
  };

  it("sends nothing when nothing changed", () => {
    expect(volunteerProfileChanges(voluntario, { ...voluntario })).toEqual({});
  });

  it("sends only the changed fields", () => {
    expect(
      volunteerProfileChanges(voluntario, {
        tiene_refrigeracion: false,
        ubicacion_base: { lat: 4.65, lng: -74.06 },
        radio_cobertura_km: 25,
      }),
    ).toEqual({ tiene_refrigeracion: false, radio_cobertura_km: 25 });
  });

  it("sends a moved base point", () => {
    expect(
      volunteerProfileChanges(voluntario, { ...voluntario, ubicacion_base: { lat: 4.7, lng: -74.06 } }),
    ).toEqual({ ubicacion_base: { lat: 4.7, lng: -74.06 } });
  });

  it("sends the first base point and never an unset one", () => {
    const withoutBase = { ...voluntario, ubicacion_base: null };
    expect(volunteerProfileChanges(withoutBase, withoutBase)).toEqual({});
    expect(
      volunteerProfileChanges(withoutBase, { ...withoutBase, ubicacion_base: { lat: 4.6, lng: -74.1 } }),
    ).toEqual({ ubicacion_base: { lat: 4.6, lng: -74.1 } });
  });
});
