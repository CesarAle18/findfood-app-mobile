import type { EstadoDonacion } from "@/api/types";
import type { HistorialEstadoDto } from "@/services/donaciones";
import { DONATION_ID, detalleFixture, pageFixture, resumenFixture } from "@/test-utils/fixtures";

import {
  PUBLISHED_POLL_MS,
  canCancel,
  filterDonations,
  formatInstant,
  formatTimeOfDay,
  matchesFilter,
  nextOffset,
  pollWhilePublished,
  publishedSteps,
  selectPages,
} from "../donation-queries";

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

describe("filterDonations", () => {
  const rows = selectPages({
    pages: [
      pageFixture([
        resumenFixture({ id: "a", codigo: "DON-1", estado: "PUBLICADA" }),
        resumenFixture({ id: "b", codigo: "DON-2", estado: "RECIBIDA" }),
        resumenFixture({ id: "c", codigo: "DON-3", estado: "CANCELADA" }),
      ]),
      pageFixture([
        resumenFixture({ id: "d", codigo: "DON-4", estado: "EN_TRANSITO" }),
        resumenFixture({ id: "e", codigo: "DON-5", estado: "ENTREGADA" }),
      ]),
    ],
    pageParams: [0, 20],
  }).rows;
  const ids = (filter: Parameters<typeof filterDonations>[1]) =>
    filterDonations(rows, filter).map((row) => row.id);

  it("keeps every loaded row under Todas, as the same array", () => {
    expect(filterDonations(rows, "todas")).toBe(rows);
  });

  it("filters the loaded pages by state on the client", () => {
    expect(ids("seguimiento")).toEqual(["a", "d"]);
    expect(ids("entregadas")).toEqual(["b", "e"]);
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

describe("pollWhilePublished", () => {
  const query = (estado: EstadoDonacion | undefined) => ({
    state: { data: estado === undefined ? undefined : detalleFixture({ estado }) },
  });

  it("polls every 15 s while the donation waits for a volunteer", () => {
    expect(pollWhilePublished(query("PUBLICADA"))).toBe(PUBLISHED_POLL_MS);
    expect(PUBLISHED_POLL_MS).toBe(15_000);
  });

  it.each<EstadoDonacion | undefined>([
    undefined,
    "BORRADOR",
    "ASIGNADA",
    "EN_RECOLECCION",
    "ENTREGADA",
    "CANCELADA",
    "EXPIRADA",
  ])("stops polling for %p", (estado) => {
    expect(pollWhilePublished(query(estado))).toBe(false);
  });
});

describe("canCancel", () => {
  it.each<[EstadoDonacion, boolean]>([
    ["BORRADOR", true],
    ["PUBLICADA", true],
    ["ASIGNADA", true],
    ["EXPIRADA", true],
    ["EN_RECOLECCION", false],
    ["EN_TRANSITO", false],
    ["ENTREGADA", false],
    ["RECIBIDA", false],
    ["RECHAZADA", false],
    ["CANCELADA", false],
  ])("%s: %p", (estado, allowed) => {
    expect(canCancel(estado)).toBe(allowed);
  });
});

describe("publishedSteps", () => {
  const historial = (estado_nuevo: string, created_at: string): HistorialEstadoDto => ({
    id: Math.random(),
    ambito: "DONACION",
    estado_anterior: null,
    estado_nuevo,
    motivo: null,
    metadata: null,
    created_at,
    donacion_id: DONATION_ID,
    asignacion_id: null,
    parada_id: null,
    usuario_nombres: null,
    lat: null,
    lng: null,
  });

  it("marks only the publication reached while waiting for a volunteer", () => {
    const steps = publishedSteps(
      detalleFixture({ estado: "PUBLICADA", asignada_at: null, asignacion: null }),
      [],
    );
    expect(steps.map(({ label, at, reached }) => [label, at, reached])).toEqual([
      ["Donación publicada", "23/09/2026 · 13:55", true],
      ["Voluntario asignado", null, false],
      ["En camino a recogida", null, false],
      ["Entregada en el banco", null, false],
    ]);
    expect(steps.findIndex((step) => step.current)).toBe(1);
  });

  it("reads the timestamps the detail lacks from the history", () => {
    const steps = publishedSteps(detalleFixture({ estado: "EN_RECOLECCION" }), [
      historial("PUBLICADA", "2026-09-23T18:55:00.000Z"),
      historial("EN_RECOLECCION", "2026-09-23T21:05:00.000Z"),
    ]);
    expect(steps.map(({ at, reached }) => [at, reached])).toEqual([
      ["23/09/2026 · 13:55", true],
      ["23/09/2026 · 14:12", true],
      ["23/09/2026 · 16:05", true],
      [null, false],
    ]);
    expect(steps.findIndex((step) => step.current)).toBe(3);
  });

  it("keeps the latest publication of a republished donation", () => {
    const steps = publishedSteps(
      detalleFixture({ estado: "PUBLICADA", publicada_at: null, asignada_at: null }),
      [
        historial("PUBLICADA", "2026-09-23T18:55:00.000Z"),
        historial("EXPIRADA", "2026-09-23T19:55:00.000Z"),
        historial("PUBLICADA", "2026-09-23T20:10:00.000Z"),
      ],
    );
    expect(steps[0].at).toBe("23/09/2026 · 15:10");
  });

  it("has no current step once the donation left the flow", () => {
    const steps = publishedSteps(
      detalleFixture({ estado: "CANCELADA", asignada_at: null, asignacion: null }),
      [],
    );
    expect(steps.map(({ reached }) => reached)).toEqual([true, false, false, false]);
    expect(steps.some((step) => step.current)).toBe(false);
  });
});

describe("formatTimeOfDay", () => {
  it("shows the Bogotá hour", () => {
    expect(formatTimeOfDay("2026-09-23T18:55:00.000Z")).toBe("13:55");
  });

  it.each([null, "not a date"])("is null for %p", (value) => {
    expect(formatTimeOfDay(value)).toBeNull();
  });
});
