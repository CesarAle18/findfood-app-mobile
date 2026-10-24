import {
  initialVolunteerRequest,
  toSolicitudVoluntarioBody,
  volunteerRequestSchema,
  type VolunteerRequestForm,
} from "@/domain/volunteer-request";

// 16/10/2026 08:00 in Bogotá (13:00 UTC).
const NOW = Date.UTC(2026, 9, 16, 13, 0);

const filled = (overrides: Partial<VolunteerRequestForm> = {}): VolunteerRequestForm => ({
  ...initialVolunteerRequest,
  tipo_vehiculo_id: "32",
  placa_vehiculo: " abc-123 ",
  capacidad_carga_kg: "500",
  tiene_refrigeracion: true,
  fecha_nacimiento: "12/04/1995",
  ubicacion_base: { lat: 4.65, lng: -74.06 },
  documento_frente: "u1/frente.jpg",
  url_foto_vehiculo: "u1/vehiculo.jpg",
  ...overrides,
});

/** The message of the first issue on `field`, or undefined when it is valid. */
function errorOn(values: VolunteerRequestForm, field: keyof VolunteerRequestForm) {
  const result = volunteerRequestSchema(NOW).safeParse(values);
  return result.success
    ? undefined
    : result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("toSolicitudVoluntarioBody", () => {
  it("maps the required fields and leaves the empty optional ones out", () => {
    expect(toSolicitudVoluntarioBody(filled(), NOW)).toEqual({
      tipo_vehiculo_id: 32,
      placa_vehiculo: "ABC123",
      url_foto_vehiculo: "u1/vehiculo.jpg",
      capacidad_carga_kg: 500,
      tiene_refrigeracion: true,
      fecha_nacimiento: "1995-04-12",
      es_grupo: false,
      ubicacion_base: { lat: 4.65, lng: -74.06 },
      documento_frente: "u1/frente.jpg",
    });
  });

  it("parses decimals written with a comma or a dot and sends the optional fields", () => {
    expect(
      toSolicitudVoluntarioBody(
        filled({
          capacidad_carga_kg: "12,5",
          capacidad_volumen_m3: "0.75",
          radio_cobertura_km: "15",
          es_grupo: true,
          organizacion: "  Banco de Alimentos  ",
          documento_reverso: "u1/reverso.jpg",
          selfie: "u1/selfie.jpg",
          tiene_refrigeracion: false,
        }),
        NOW,
      ),
    ).toMatchObject({
      capacidad_carga_kg: 12.5,
      capacidad_volumen_m3: 0.75,
      radio_cobertura_km: 15,
      es_grupo: true,
      organizacion: "Banco de Alimentos",
      documento_reverso: "u1/reverso.jpg",
      selfie: "u1/selfie.jpg",
      tiene_refrigeracion: false,
    });
  });

  it("drops the organization when the request is not for a group", () => {
    const body = toSolicitudVoluntarioBody(filled({ organizacion: "Banco" }), NOW);
    expect(body).not.toHaveProperty("organizacion");
  });
});

describe("volunteerRequestSchema", () => {
  it("accepts someone who turns 18 today in Bogotá, not the day after", () => {
    expect(errorOn(filled({ fecha_nacimiento: "16/10/2008" }), "fecha_nacimiento")).toBeUndefined();
    expect(errorOn(filled({ fecha_nacimiento: "17/10/2008" }), "fecha_nacimiento")).toBe(
      "Debes tener al menos 18 años.",
    );
  });

  it("uses the Bogotá day, not the UTC one", () => {
    // 17/10/2026 02:00 UTC is still 16/10 in Bogotá.
    const lateNight = Date.UTC(2026, 9, 17, 2, 0);
    const result = volunteerRequestSchema(lateNight).safeParse(
      filled({ fecha_nacimiento: "17/10/2008" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects malformed or impossible birth dates", () => {
    expect(errorOn(filled({ fecha_nacimiento: "" }), "fecha_nacimiento")).toBe(
      "Ingresa tu fecha de nacimiento.",
    );
    expect(errorOn(filled({ fecha_nacimiento: "31/02/1990" }), "fecha_nacimiento")).toBe(
      "Usa el formato DD/MM/AAAA.",
    );
  });

  it("validates the plate after removing spaces and dashes", () => {
    expect(errorOn(filled({ placa_vehiculo: "AB-1" }), "placa_vehiculo")).toBe(
      "La placa debe tener de 5 a 10 letras o números.",
    );
    expect(errorOn(filled({ placa_vehiculo: "ABC 12D" }), "placa_vehiculo")).toBeUndefined();
  });

  it("keeps the load and volume within the API ranges", () => {
    expect(errorOn(filled({ capacidad_carga_kg: "" }), "capacidad_carga_kg")).toBe(
      "Ingresa la capacidad de carga.",
    );
    expect(errorOn(filled({ capacidad_carga_kg: "10001" }), "capacidad_carga_kg")).toBe(
      "La capacidad debe estar entre 1 y 10000 kg.",
    );
    expect(errorOn(filled({ capacidad_carga_kg: "abc" }), "capacidad_carga_kg")).toBe(
      "Ingresa un número válido.",
    );
    expect(errorOn(filled({ capacidad_volumen_m3: "0" }), "capacidad_volumen_m3")).toBe(
      "El volumen debe estar entre 0,01 y 100 m³.",
    );
    expect(errorOn(filled({ radio_cobertura_km: "101" }), "radio_cobertura_km")).toBe(
      "El radio debe estar entre 1 y 100 km.",
    );
  });

  it("requires the organization of a group, even with other errors present", () => {
    expect(
      errorOn(filled({ es_grupo: true, organizacion: " ", placa_vehiculo: "" }), "organizacion"),
    ).toBe("Ingresa el nombre de la organización.");
  });

  it("requires the vehicle type, base location and required photos", () => {
    const empty = volunteerRequestSchema(NOW).safeParse(initialVolunteerRequest);
    expect(empty.success).toBe(false);
    const fields = empty.success ? [] : empty.error.issues.map((issue) => issue.path[0]);
    expect(fields).toEqual(
      expect.arrayContaining([
        "tipo_vehiculo_id",
        "ubicacion_base",
        "documento_frente",
        "url_foto_vehiculo",
      ]),
    );
    expect(fields).not.toContain("documento_reverso");
    expect(fields).not.toContain("selfie");
  });

  it("refuses a base point outside Bogotá's service area and accepts a neighbouring town", () => {
    expect(errorOn(filled({ ubicacion_base: { lat: 6.24, lng: -75.58 } }), "ubicacion_base")).toBe(
      "Tu punto base debe estar en Bogotá o un municipio vecino.",
    );
    expect(
      errorOn(filled({ ubicacion_base: { lat: 4.86, lng: -74.05 } }), "ubicacion_base"),
    ).toBeUndefined();
  });
});
