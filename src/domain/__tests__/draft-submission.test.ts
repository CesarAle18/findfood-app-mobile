import {
  initialDonationDraft,
  newDonationDraft,
  parseQuantity,
  PICKUP_POINT_OUTSIDE_AREA,
  PICKUP_POINT_REQUIRED,
  productErrorKey,
  toCrearDonacionBody,
  validateDraft,
  type DonationDraft,
  type DraftProduct,
} from "@/domain/donation-draft";
import { MappingError } from "@/domain/mappers/errors";
import { catalogosFixture } from "@/test-utils/fixtures";

const { unidades_medida: unidades } = catalogosFixture;

/** Epoch of a Bogotá wall-clock instant (UTC−05:00). */
const bogota = (year: number, month: number, day: number, hour: number, minute = 0) =>
  Date.UTC(year, month - 1, day, hour + 5, minute);

const NOW = bogota(2026, 10, 16, 10);

const leche: DraftProduct = {
  ...initialDonationDraft.products[0],
  tipoAlimentoId: 11,
  name: "Leche",
  quantity: "20",
  unit: "L",
  coldChain: "Refrigerado",
  rutaFoto: "productos/u1/leche.jpg",
  fotoUri: "file:///leche.jpg",
};

const ready: DonationDraft = {
  ...initialDonationDraft,
  products: [leche],
  pickupDate: "16/10/2026",
  direccion: "Cra 45 #12-30",
  referencia: "",
  ubicacionRecogida: { lat: 4.65, lng: -74.06 },
};

describe("newDonationDraft", () => {
  it("picks up today in Bogotá by default, without an API donation", () => {
    // 21:00 in Bogotá is already the 17th in UTC.
    const draft = newDonationDraft(bogota(2026, 10, 16, 21));
    expect(draft.pickupDate).toBe("16/10/2026");
    expect(draft.apiId).toBeNull();
    expect(draft.products[0]).toMatchObject({ rutaFoto: null, fotoUri: null });
  });
});

describe("parseQuantity", () => {
  it("accepts positive numbers with up to 2 decimals, with a dot or a comma", () => {
    expect(parseQuantity("20")).toBe(20);
    expect(parseQuantity(" 12,5 ")).toBe(12.5);
    expect(parseQuantity("0.25")).toBe(0.25);
  });

  it("refuses zero, more decimals, text and huge numbers", () => {
    for (const text of ["", "0", "0.00", "1.234", "abc", "-3", "100000000"]) {
      expect(parseQuantity(text)).toBeNull();
    }
  });
});

describe("toCrearDonacionBody", () => {
  it("maps the products, the window and the pickup point", () => {
    expect(toCrearDonacionBody(ready, { unidades }, NOW)).toStrictEqual({
      ventana_recogida_inicio: "2026-10-16T10:00:00-05:00",
      ventana_recogida_fin: "2026-10-16T23:59:00-05:00",
      direccion_recogida: "Cra 45 #12-30",
      ubicacion_recogida: { lat: 4.65, lng: -74.06 },
      items: [
        {
          tipo_alimento_id: 11,
          unidad_medida_id: 22,
          cantidad: 20,
          peso_estimado_kg: 20,
          requiere_refrigeracion: true,
          ruta_foto: "productos/u1/leche.jpg",
        },
      ],
    });
  });

  it("converts the weight with the unit's factor, rounded to 2 decimals and at least 0.01", () => {
    const grams = (quantity: string) =>
      toCrearDonacionBody(
        { ...ready, products: [{ ...leche, unit: "G", quantity }] },
        { unidades },
      )?.items[0];

    expect(grams("1500")).toMatchObject({ unidad_medida_id: 24, cantidad: 1500, peso_estimado_kg: 1.5 });
    expect(grams("1234")?.peso_estimado_kg).toBe(1.23);
    expect(grams("2")?.peso_estimado_kg).toBe(0.01);
  });

  it("sends the expiry and the photo only when present", () => {
    const body = toCrearDonacionBody(
      {
        ...ready,
        products: [
          { ...leche, expiresOn: "20/10/2026", rutaFoto: "productos/u1/foto.jpg", fotoUri: "file:///foto.jpg" },
          { ...leche, id: 2, coldChain: "No requiere", rutaFoto: null, fotoUri: null },
        ],
      },
      { unidades },
    );

    expect(body?.items[0]).toMatchObject({
      fecha_vencimiento: "2026-10-20",
      ruta_foto: "productos/u1/foto.jpg",
    });
    expect(body?.items[1]).not.toHaveProperty("fecha_vencimiento");
    expect(body?.items[1]).not.toHaveProperty("ruta_foto");
    expect(body?.items[1].requiere_refrigeracion).toBe(false);
  });

  it("picks up all day on a future date", () => {
    const body = toCrearDonacionBody({ ...ready, pickupDate: "31/12/2026" }, { unidades }, NOW);
    expect(body?.ventana_recogida_inicio).toBe("2026-12-31T00:00:00-05:00");
    expect(body?.ventana_recogida_fin).toBe("2026-12-31T23:59:00-05:00");
  });

  it("picks up today from the current minute until the end of the day", () => {
    const now = bogota(2026, 10, 16, 14, 37) + 30_000;
    const body = toCrearDonacionBody(ready, { unidades }, now);
    expect(body?.ventana_recogida_inicio).toBe("2026-10-16T14:37:00-05:00");
    expect(body?.ventana_recogida_fin).toBe("2026-10-16T23:59:00-05:00");
  });

  it("is null while the draft is incomplete", () => {
    expect(toCrearDonacionBody(initialDonationDraft, { unidades })).toBeNull();
    expect(
      toCrearDonacionBody({ ...ready, products: [{ ...leche, quantity: "0" }] }, { unidades }),
    ).toBeNull();
    expect(toCrearDonacionBody({ ...ready, ubicacionRecogida: null }, { unidades })).toBeNull();
    expect(toCrearDonacionBody({ ...ready, pickupDate: "" }, { unidades })).toBeNull();
  });

  it("refuses a unit missing from the catalog", () => {
    expect(() =>
      toCrearDonacionBody({ ...ready, products: [{ ...leche, unit: "ML" }] }, { unidades }),
    ).toThrow(MappingError);
  });
});

describe("validateDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateDraft(ready, NOW)).toBeNull();
  });

  it("asks for the product type and a positive quantity", () => {
    const errors = validateDraft(
      { ...ready, products: [{ ...leche, tipoAlimentoId: null, quantity: "0" }] },
      NOW,
    );
    expect(errors?.[productErrorKey(leche.id, "tipoAlimentoId")]).toBe("Selecciona el producto.");
    expect(errors?.[productErrorKey(leche.id, "quantity")]).toBe(
      "Ingresa una cantidad mayor que 0, con máximo 2 decimales.",
    );
  });

  it("asks for each product's photo", () => {
    const errors = validateDraft(
      { ...ready, products: [leche, { ...leche, id: 2, rutaFoto: null, fotoUri: null }] },
      NOW,
    );
    expect(errors?.[productErrorKey(2, "rutaFoto")]).toBe("Agrega una foto del producto.");
    expect(errors?.[productErrorKey(leche.id, "rutaFoto")]).toBeUndefined();
  });

  it("allows 1 to 30 products", () => {
    expect(validateDraft({ ...ready, products: [] }, NOW)?.products).toBe(
      "Agrega al menos un producto.",
    );
    const many = Array.from({ length: 31 }, (_, i) => ({ ...leche, id: i + 1 }));
    expect(validateDraft({ ...ready, products: many }, NOW)?.products).toBe(
      "Puedes donar como máximo 30 productos.",
    );
  });

  it("refuses a product that expired before today in Bogotá", () => {
    // 23:30 in Bogotá: UTC is already the 17th, but the 16th is still today.
    const lateNight = bogota(2026, 10, 16, 23, 30);
    const expiring = (expiresOn: string) =>
      validateDraft({ ...ready, products: [{ ...leche, expiresOn }] }, lateNight);

    expect(expiring("16/10/2026")).toBeNull();
    expect(expiring("15/10/2026")?.[productErrorKey(leche.id, "expiresOn")]).toBe(
      "El producto ya está vencido.",
    );
  });

  it("refuses a pickup date before today in Bogotá", () => {
    expect(validateDraft({ ...ready, pickupDate: "15/10/2026" }, NOW)?.pickupDate).toBe(
      "La fecha de recogida no puede ser anterior a hoy.",
    );
    expect(validateDraft({ ...ready, pickupDate: "17/10/2026" }, NOW)).toBeNull();
  });

  it("refuses today when less than 15 minutes of the day are left", () => {
    const lateToday = bogota(2026, 10, 16, 23, 45);
    expect(validateDraft(ready, bogota(2026, 10, 16, 23, 44))).toBeNull();
    expect(validateDraft(ready, lateToday)?.pickupDate).toBe(
      "Ya no queda tiempo para recoger hoy. Elige otra fecha.",
    );
    expect(validateDraft({ ...ready, pickupDate: "17/10/2026" }, lateToday)).toBeNull();
  });

  it("asks for the pickup date, the address and the point", () => {
    const errors = validateDraft(
      { ...ready, pickupDate: "", direccion: "Cra", ubicacionRecogida: null },
      NOW,
    );
    expect(errors).toMatchObject({
      pickupDate: "Selecciona la fecha de recogida.",
      direccion: "Ingresa una dirección de al menos 5 caracteres.",
      ubicacionRecogida: PICKUP_POINT_REQUIRED,
    });
  });

  it("refuses a pickup point outside Bogotá's service area and accepts a neighbouring town", () => {
    const medellin = { ...ready, ubicacionRecogida: { lat: 6.24, lng: -75.58 } };
    expect(validateDraft(medellin, NOW)?.ubicacionRecogida).toBe(PICKUP_POINT_OUTSIDE_AREA);

    const chia = { ...ready, ubicacionRecogida: { lat: 4.86, lng: -74.05 } };
    expect(validateDraft(chia, NOW)).toBeNull();
  });
});
