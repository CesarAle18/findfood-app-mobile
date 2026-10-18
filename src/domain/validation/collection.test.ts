import {
  MAX_WEIGHT_KG,
  OBSERVACIONES_MAX,
  formatWeightInput,
  liveTotalKg,
  parseWeightInput,
  validateCollection,
  type CollectionValues,
} from "./collection";

function values(overrides: Partial<CollectionValues> = {}): CollectionValues {
  return {
    estado: "BUENO",
    pesos: [
      { itemId: "item-1", value: "12,5" },
      { itemId: "item-2", value: "3" },
    ],
    observaciones: "",
    ...overrides,
  };
}

describe("parseWeightInput", () => {
  it("reads a comma or a dot as the decimal separator", () => {
    expect(parseWeightInput("12,5")).toBe(12.5);
    expect(parseWeightInput(" 7.25 ")).toBe(7.25);
    expect(parseWeightInput("20")).toBe(20);
  });

  it("is null for text that is not a weight", () => {
    expect(parseWeightInput("")).toBeNull();
    expect(parseWeightInput("abc")).toBeNull();
    expect(parseWeightInput("1,2,3")).toBeNull();
    expect(parseWeightInput("-4")).toBeNull();
  });
});

describe("formatWeightInput", () => {
  it("writes the estimate with a decimal comma", () => {
    expect(formatWeightInput(12.5)).toBe("12,5");
    expect(formatWeightInput(45)).toBe("45");
  });
});

describe("liveTotalKg", () => {
  it("adds the readable weights and ignores the rest while typing", () => {
    expect(liveTotalKg(values().pesos)).toBe(15.5);
    expect(liveTotalKg([{ itemId: "a", value: "0,1" }, { itemId: "b", value: "0,2" }])).toBe(0.3);
    expect(liveTotalKg([{ itemId: "a", value: "4" }, { itemId: "b", value: "x" }])).toBe(4);
  });
});

describe("validateCollection", () => {
  it("builds the confirmation fields with numbers, item ids and the total", () => {
    expect(validateCollection(values({ observaciones: "  Cajas en buen estado " }))).toEqual({
      ok: true,
      data: {
        estado_producto: "BUENO",
        items: [
          { item_id: "item-1", peso_real_kg: 12.5 },
          { item_id: "item-2", peso_real_kg: 3 },
        ],
        peso_confirmado_kg: 15.5,
        observaciones: "Cajas en buen estado",
      },
    });
  });

  it("leaves blank observations and rows without an item out", () => {
    const result = validateCollection(
      values({ pesos: [{ itemId: null, value: "8" }], observaciones: "   " }),
    );
    expect(result).toEqual({
      ok: true,
      data: { estado_producto: "BUENO", items: [], peso_confirmado_kg: 8 },
    });
  });

  it("requires the product condition", () => {
    const result = validateCollection(values({ estado: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.estado).toBe("Selecciona el estado del producto.");
  });

  it("reports each invalid weight on its own row", () => {
    const result = validateCollection(
      values({
        pesos: [
          { itemId: "a", value: "" },
          { itemId: "b", value: "0" },
          { itemId: "c", value: "1,234" },
          { itemId: "d", value: "kilo" },
          { itemId: "e", value: String(MAX_WEIGHT_KG + 1) },
          { itemId: "f", value: "2,5" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.pesos).toEqual({
        0: "Ingresa el peso recogido.",
        1: "El peso debe ser mayor que 0.",
        2: "Usa como máximo 2 decimales.",
        3: "Ingresa un peso válido, por ejemplo 12,5.",
        4: "El peso es demasiado alto.",
      });
    }
  });

  it("limits the observations to the API maximum", () => {
    const result = validateCollection(values({ observaciones: "a".repeat(OBSERVACIONES_MAX + 1) }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.observaciones).toBe(
        `Las observaciones admiten hasta ${OBSERVACIONES_MAX} caracteres.`,
      );
    }
  });

  it("needs at least one weight", () => {
    const result = validateCollection(values({ pesos: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.form).toBe("El total recogido debe ser mayor que 0.");
  });
});
