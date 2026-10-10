import { MappingError } from "./errors";
import {
  COLD_CHAIN_OPTIONS,
  fromRequiereRefrigeracion,
  toRequiereRefrigeracion,
} from "./refrigeration";

describe("refrigeration", () => {
  it("offers the choices of the donation form, in their order", () => {
    expect(COLD_CHAIN_OPTIONS).toEqual(["Refrigerado", "No requiere"]);
  });

  it("maps the form choice to requiere_refrigeracion", () => {
    expect(toRequiereRefrigeracion("Refrigerado")).toBe(true);
    expect(toRequiereRefrigeracion("No requiere")).toBe(false);
  });

  it("maps requiere_refrigeracion back to the form choice", () => {
    expect(fromRequiereRefrigeracion(true)).toBe("Refrigerado");
    expect(fromRequiereRefrigeracion(false)).toBe("No requiere");
  });

  it("round-trips both choices", () => {
    for (const choice of COLD_CHAIN_OPTIONS) {
      expect(fromRequiereRefrigeracion(toRequiereRefrigeracion(choice))).toBe(choice);
    }
  });

  it.each(["", "refrigerado", "Seco", " No requiere"])("rejects %p", (choice) => {
    expect(() => toRequiereRefrigeracion(choice)).toThrow(MappingError);
    expect(() => toRequiereRefrigeracion(choice)).toThrow(
      expect.objectContaining({ code: "invalid-cold-chain", value: choice }),
    );
  });
});
