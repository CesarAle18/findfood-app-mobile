import type { EstadoAsignacion, EstadoDonacion, EstadoParada, EstadoRuta } from "@/api/types";
import { colors } from "@/design/tokens";

import {
  STATUS_TONES,
  asignacionStatus,
  donacionStatus,
  estadosAsignacion,
  estadosDonacion,
  estadosParada,
  estadosRuta,
  paradaStatus,
  rutaStatus,
  toneColor,
  type StatusView,
} from "./statuses";

// Every value of each API enum, listed by hand: a table missing one fails here at runtime,
// and `satisfies` in statuses.ts already fails the typecheck.
const DONACION: EstadoDonacion[] = [
  "BORRADOR",
  "PUBLICADA",
  "ASIGNADA",
  "EN_RECOLECCION",
  "EN_TRANSITO",
  "ENTREGADA",
  "RECIBIDA",
  "RECHAZADA",
  "CANCELADA",
  "EXPIRADA",
];
const ASIGNACION: EstadoAsignacion[] = [
  "OFRECIDA",
  "ACEPTADA",
  "RECHAZADA",
  "EXPIRADA",
  "ABANDONADA",
  "COMPLETADA",
  "CANCELADA",
];
const RUTA: EstadoRuta[] = ["PLANIFICADA", "EN_CURSO", "COMPLETADA", "CANCELADA"];
const PARADA: EstadoParada[] = ["PENDIENTE", "EN_SITIO", "COMPLETADA", "FALLIDA", "OMITIDA"];

describe.each([
  ["donación", estadosDonacion as Record<string, StatusView>, DONACION],
  ["asignación", estadosAsignacion as Record<string, StatusView>, ASIGNACION],
  ["ruta", estadosRuta as Record<string, StatusView>, RUTA],
  ["parada", estadosParada as Record<string, StatusView>, PARADA],
])("estados de %s", (_, table, values) => {
  it("covers exactly every enum value", () => {
    expect(Object.keys(table).sort()).toEqual([...values].sort());
  });

  it("gives each value a non-empty Spanish label and a known tone", () => {
    for (const value of values) {
      expect(table[value].label.trim()).not.toBe("");
      expect(STATUS_TONES).toContain(table[value].tone);
    }
  });

  it("never repeats a label, so each state reads differently", () => {
    const labels = values.map((value) => table[value].label);

    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("labels shared with the current screens", () => {
  it.each([
    ["PUBLICADA", "Buscando voluntario"],
    ["ASIGNADA", "Voluntario asignado"],
    ["EN_RECOLECCION", "En camino a la recogida"],
    ["RECIBIDA", "Completada"],
  ] as const)("donación %s reads %p", (estado, label) => {
    expect(donacionStatus(estado).label).toBe(label);
  });

  it("shows a route in progress like the active-route badge", () => {
    expect(rutaStatus("EN_CURSO")).toEqual({ label: "En progreso", tone: "warning" });
  });

  it("shows a pending stop like the tracking steps", () => {
    expect(paradaStatus("PENDIENTE").label).toBe("Pendiente");
  });

  it("asks the volunteer to answer an offer", () => {
    expect(asignacionStatus("OFRECIDA").tone).toBe("warning");
  });
});

describe("status lookups", () => {
  it("returns the table entry", () => {
    expect(donacionStatus("RECHAZADA")).toBe(estadosDonacion.RECHAZADA);
    expect(asignacionStatus("ABANDONADA")).toBe(estadosAsignacion.ABANDONADA);
    expect(rutaStatus("CANCELADA")).toBe(estadosRuta.CANCELADA);
    expect(paradaStatus("FALLIDA")).toBe(estadosParada.FALLIDA);
  });

  it("falls back to a readable neutral status for a value the app does not know yet", () => {
    expect(donacionStatus("EN_REVISION" as EstadoDonacion)).toEqual({
      label: "En revision",
      tone: "neutral",
    });
  });

  it("does not mistake inherited object keys for states", () => {
    expect(rutaStatus("constructor" as EstadoRuta)).toEqual({
      label: "Constructor",
      tone: "neutral",
    });
  });
});

describe("toneColor", () => {
  it("matches the default and warning badges of the current screens", () => {
    expect(toneColor("primary")).toEqual({ text: colors.primary, background: colors.soft });
    expect(toneColor("warning")).toEqual({
      text: colors.warning,
      background: colors.warningSoft,
    });
  });

  it("resolves every tone to existing color tokens", () => {
    const tokens = Object.values(colors);

    for (const tone of STATUS_TONES) {
      const { text, background } = toneColor(tone);

      expect(tokens).toContain(text);
      expect(tokens).toContain(background);
      expect(text).not.toBe(background);
    }
  });

  it("returns the same object on every call, so it is safe in style props", () => {
    expect(toneColor("danger")).toBe(toneColor("danger"));
  });
});
