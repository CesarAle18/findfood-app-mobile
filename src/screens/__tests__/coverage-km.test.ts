import { coverageKm } from "@/screens/volunteer";

describe("coverageKm", () => {
  it("draws the API's default radius while the field is empty", () => {
    expect(coverageKm("")).toBe(10);
  });

  it("reads decimals with a comma or a dot", () => {
    expect(coverageKm("7,5")).toBe(7.5);
    expect(coverageKm("15")).toBe(15);
  });

  it("draws nothing for a radius the API would reject", () => {
    expect(coverageKm("0")).toBeUndefined();
    expect(coverageKm("150")).toBeUndefined();
    expect(coverageKm("diez")).toBeUndefined();
  });
});
