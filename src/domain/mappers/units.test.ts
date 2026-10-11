import type { QuantityUnit } from "@/domain/donation-draft";
import type { UnidadMedidaDto } from "@/services/catalogos";

import { errorCode } from "@/test-utils/mapping";

import { idToUnidad, isQuantityUnit, toQuantityUnit, unidadToId } from "./units";

/** `unidades_medida` of `GET /catalogos`; ids are deliberately not in code order. */
const catalogo: UnidadMedidaDto[] = [
  { id: 4, codigo: "KG", nombre: "Kilogramo", factor_a_kg: 1 },
  { id: 1, codigo: "UN", nombre: "Unidad", factor_a_kg: null },
  { id: 7, codigo: "L", nombre: "Litro", factor_a_kg: 1 },
  { id: 2, codigo: "CAJA", nombre: "Caja", factor_a_kg: null },
  { id: 12, codigo: "ML", nombre: "Mililitro", factor_a_kg: 0.001 },
  { id: 3, codigo: "BULTO", nombre: "Bulto", factor_a_kg: null },
  { id: 11, codigo: "G", nombre: "Gramo", factor_a_kg: 0.001 },
];

describe("unidadToId", () => {
  it.each([
    ["KG", 4],
    ["L", 7],
    ["ML", 12],
    ["G", 11],
  ] as const)("finds %s in the catalog", (codigo, id) => {
    expect(unidadToId(codigo, catalogo)).toBe(id);
  });

  it("fails when the catalog lacks the unit", () => {
    const withoutMl = catalogo.filter((unidad) => unidad.codigo !== "ML");

    expect(errorCode(() => unidadToId("ML", withoutMl))).toBe("unknown-unit");
    expect(errorCode(() => unidadToId("KG", []))).toBe("unknown-unit");
  });

  it("refuses a unit the app does not offer, even if the catalog has it", () => {
    expect(errorCode(() => unidadToId("UN" as QuantityUnit, catalogo))).toBe("unsupported-unit");
  });
});

describe("idToUnidad", () => {
  it.each([
    [4, "KG"],
    [7, "L"],
    [12, "ML"],
    [11, "G"],
  ])("maps id %i to %s", (id, codigo) => {
    expect(idToUnidad(id, catalogo)).toBe(codigo);
  });

  it("fails for an id outside the catalog", () => {
    expect(errorCode(() => idToUnidad(999, catalogo))).toBe("unknown-unit");
  });

  it.each([1, 2, 3])("refuses unit id %i, which the app does not offer", (id) => {
    expect(errorCode(() => idToUnidad(id, catalogo))).toBe("unsupported-unit");
  });

  it("round-trips every unit the app offers", () => {
    for (const codigo of ["KG", "L", "ML", "G"] as const) {
      expect(idToUnidad(unidadToId(codigo, catalogo), catalogo)).toBe(codigo);
    }
  });
});

describe("toQuantityUnit / isQuantityUnit", () => {
  it.each(["KG", "L", "ML", "G"])("accepts %s", (codigo) => {
    expect(isQuantityUnit(codigo)).toBe(true);
    expect(toQuantityUnit(codigo)).toBe(codigo);
  });

  it.each(["UN", "CAJA", "BULTO", "kg", "", "toString"])("refuses %p", (codigo) => {
    expect(isQuantityUnit(codigo)).toBe(false);
    expect(errorCode(() => toQuantityUnit(codigo))).toBe("unsupported-unit");
  });
});
