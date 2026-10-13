import type { EstadoDonacion } from "@/api/types";
import { pageFixture, resumenFixture } from "@/test-utils/fixtures";

import { formatInstant, matchesFilter, nextOffset, selectPages } from "../donation-queries";

describe("nextOffset", () => {
  it("asks for the rows after the ones already loaded", () => {
    expect(nextOffset(pageFixture(Array(20).fill(0), 45, 20))).toBe(40);
  });

  it.each([
    ["the last page", pageFixture(Array(5).fill(0), 45, 40)],
    ["an exactly full last page", pageFixture(Array(20).fill(0), 40, 20)],
    // A shorter total than announced must not loop on empty pages.
    ["an empty page", pageFixture([], 45, 40)],
  ])("stops after %s", (_case, page) => {
    expect(nextOffset(page)).toBeUndefined();
  });
});

describe("matchesFilter", () => {
  it.each<[EstadoDonacion, boolean, boolean]>([
    ["BORRADOR", false, false],
    ["PUBLICADA", true, false],
    ["ASIGNADA", true, false],
    ["EN_RECOLECCION", true, false],
    ["EN_TRANSITO", true, false],
    ["ENTREGADA", false, true],
    ["RECIBIDA", false, true],
    ["RECHAZADA", false, false],
    ["CANCELADA", false, false],
    ["EXPIRADA", false, false],
  ])("%s: tracking %p, delivered %p", (estado, tracking, delivered) => {
    expect(matchesFilter(estado, "todas")).toBe(true);
    expect(matchesFilter(estado, "seguimiento")).toBe(tracking);
    expect(matchesFilter(estado, "entregadas")).toBe(delivered);
  });
});

describe("formatInstant", () => {
  it("shows an API timestamp in Bogotá time", () => {
    expect(formatInstant("2026-09-23T18:55:00.000Z")).toBe("23/09/2026 · 13:55");
  });

  it.each([null, "", "2026-09-23T18:55:00"])("is null for %p", (value) => {
    expect(formatInstant(value)).toBeNull();
  });

  it("does not hide errors other than mapping errors", () => {
    // A Symbol cannot become a string: the parser throws a TypeError, not a MappingError.
    expect(() => formatInstant(Symbol("not a timestamp") as unknown as string)).toThrow(TypeError);
  });
});

describe("selectPages", () => {
  const row = (id: string, codigo: string) => resumenFixture({ id, codigo });

  it("joins the pages and reads the total from the first one", () => {
    const data = {
      pages: [
        pageFixture([row("a", "DON-A"), row("b", "DON-B")], 3),
        pageFixture([row("c", "DON-C")], 3, 2),
      ],
      pageParams: [0, 2],
    };
    const { rows, total } = selectPages(data);
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(total).toBe(3);
  });

  it("keeps the first copy of a donation repeated across pages", () => {
    // A donation created between two requests shifts the offsets: the last row of page one
    // comes back as the first row of page two.
    const data = {
      pages: [
        pageFixture([row("a", "DON-A"), row("b", "DON-B")], 4),
        pageFixture([row("b", "DON-B (repetida)"), row("c", "DON-C")], 4, 2),
      ],
      pageParams: [0, 2],
    };
    const { rows } = selectPages(data);
    expect(rows.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(rows[1].code).toBe("DON-B");
  });

  it("is empty without pages", () => {
    expect(selectPages({ pages: [], pageParams: [] })).toEqual({ rows: [], total: 0 });
  });
});
