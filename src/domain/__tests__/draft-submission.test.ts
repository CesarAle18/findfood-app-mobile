import {
  initialDonationDraft,
  newDonationDraft,
  parseQuantity,
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
};

const ready: DonationDraft = {
  ...initialDonationDraft,
  products: [leche],
  pickupDate: "16/10/2026",
  pickupFrom: "16:00",
  pickupUntil: "18:00",
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
    expect(toCrearDonacionBody(ready, { unidades })).toStrictEqual({
      ventana_recogida_inicio: "2026-10-16T16:00:00-05:00",
      ventana_recogida_fin: "2026-10-16T18:00:00-05:00",
      direccion_recogida: "Cra 45 #12-30",
      ubicacion_recogida: { lat: 4.65, lng: -74.06 },
      items: [
        {
          tipo_alimento_id: 11,
          unidad_medida_id: 22,
          cantidad: 20,
          peso_estimado_kg: 20,
          requiere_refrigeracion: true,
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
          { ...leche, id: 2, coldChain: "No requiere" },
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

  it("ends the window the next day when it crosses midnight", () => {
    const body = toCrearDonacionBody(
      { ...ready, pickupDate: "31/12/2026", pickupFrom: "22:00", pickupUntil: "01:00" },
      { unidades },
    );
    expect(body?.ventana_recogida_inicio).toBe("2026-12-31T22:00:00-05:00");
    expect(body?.ventana_recogida_fin).toBe("2027-01-01T01:00:00-05:00");
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
    const late = { ...ready, pickupFrom: "23:45", pickupUntil: "01:00" };
    const expiring = (expiresOn: string) =>
      validateDraft({ ...late, products: [{ ...leche, expiresOn }] }, lateNight);

    expect(expiring("16/10/2026")).toBeNull();
    expect(expiring("15/10/2026")?.[productErrorKey(leche.id, "expiresOn")]).toBe(
      "El producto ya está vencido.",
    );
  });

  it("refuses a window that started more than 5 minutes ago", () => {
    const at = (hour: number, minute: number) => bogota(2026, 10, 16, hour, minute);
    expect(validateDraft(ready, at(16, 5))).toBeNull();
    expect(validateDraft(ready, at(16, 6))?.pickupFrom).toBe(
      "La recogida no puede empezar en el pasado.",
    );
  });

  it("asks the window to end at least 15 minutes from now", () => {
    const draft = { ...ready, pickupFrom: "17:40", pickupUntil: "18:00" };
    expect(validateDraft(draft, bogota(2026, 10, 16, 17, 45))).toBeNull();
    expect(validateDraft(draft, bogota(2026, 10, 16, 17, 46))?.pickupUntil).toBe(
      "La recogida debe terminar al menos 15 minutos después de ahora.",
    );
  });

  it("accepts a window that crosses midnight and refuses one with equal times", () => {
    const night = { ...ready, pickupFrom: "22:00", pickupUntil: "01:00" };
    expect(validateDraft(night, bogota(2026, 10, 16, 21, 30))).toBeNull();
    expect(validateDraft({ ...ready, pickupUntil: "16:00" }, NOW)?.pickupUntil).toBe(
      "La hora de fin debe ser distinta de la de inicio.",
    );
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
});
