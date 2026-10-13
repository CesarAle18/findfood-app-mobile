import { catalogosFixture } from "@/test-utils/fixtures";

import {
  appendProduct,
  applyTipoAlimento,
  foodTypeOptions,
  initialDonationDraft,
  unitOptions,
  type DraftProduct,
} from "./donation-draft";

const { tipos_alimento: tipos, unidades_medida: unidades } = catalogosFixture;
const leche = tipos[0]; // unit L (22), refrigerated
const pan = tipos[2]; // unit UN (23), which the form does not offer

const blank: DraftProduct = appendProduct({ ...initialDonationDraft, products: [] }).products[0];

describe("foodTypeOptions", () => {
  it("offers each catalog food type by name, keyed by its id", () => {
    expect(foodTypeOptions(tipos)).toEqual([
      { label: "Leche", value: "11" },
      { label: "Arroz", value: "12" },
      { label: "Pan", value: "13" },
    ]);
  });
});

describe("unitOptions", () => {
  it("offers only the catalog units the form supports", () => {
    expect(unitOptions(unidades)).toEqual([
      { label: "KG", value: "KG" },
      { label: "L", value: "L" },
      { label: "G", value: "G" },
    ]);
  });
});

describe("applyTipoAlimento", () => {
  it("stores the food type id and name", () => {
    const product = applyTipoAlimento(blank, leche, unidades);

    expect(product.tipoAlimentoId).toBe(11);
    expect(product.name).toBe("Leche");
  });

  it("prefills the type's unit and cold chain while the donor has not chosen them", () => {
    const product = applyTipoAlimento(blank, leche, unidades);

    expect(product.unit).toBe("L");
    expect(product.coldChain).toBe("Refrigerado");
  });

  it("never overwrites a unit or cold chain the donor chose", () => {
    const chosen = { ...blank, unit: "G", unitEdited: true, coldChain: "No requiere", coldChainEdited: true } as const;
    const product = applyTipoAlimento(chosen, leche, unidades);

    expect(product.unit).toBe("G");
    expect(product.coldChain).toBe("No requiere");
  });

  it("keeps the current unit when the type's unit is not offered", () => {
    const product = applyTipoAlimento({ ...blank, unit: "KG" }, pan, unidades);

    expect(product.unit).toBe("KG");
    expect(product.coldChain).toBe("No requiere");
  });

  it("does not modify the original product", () => {
    const before = { ...blank };
    applyTipoAlimento(blank, leche, unidades);
    expect(blank).toEqual(before);
  });
});

describe("initialDonationDraft", () => {
  it("starts with one product without a food type", () => {
    expect(initialDonationDraft.products).toHaveLength(1);
    expect(initialDonationDraft.products[0].tipoAlimentoId).toBeNull();
  });
});
