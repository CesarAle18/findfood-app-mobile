import {
  ofertaAceptadaFixture,
  ofertaFixture,
  paradaFixture,
  rutaDetalleFixture,
} from "@/test-utils/fixtures";

import {
  MAX_STOPS_PER_ROUTE,
  acceptedWithoutRoute,
  asignacionByDonacion,
  collectedKg,
  liveOffers,
  nextStop,
  pendingStops,
  stopProgress,
  validateRouteSelection,
} from "./routes";

const [first, second, entrega] = rutaDetalleFixture().paradas;

describe("nextStop", () => {
  it("is the first open stop in visiting order, whatever the array order", () => {
    const paradas = [entrega, second, { ...first, estado: "COMPLETADA" as const }];

    expect(nextStop(paradas)?.id).toBe("par-2");
  });

  it("includes a stop the volunteer already reached", () => {
    expect(nextStop([{ ...first, estado: "EN_SITIO" }, second])?.id).toBe("par-1");
  });

  it("skips failed and skipped pickups and reaches the delivery", () => {
    const paradas = [
      { ...first, estado: "FALLIDA" as const },
      { ...second, estado: "OMITIDA" as const },
      entrega,
    ];

    expect(nextStop(paradas)?.id).toBe("par-3");
  });

  it("is null once every stop is closed", () => {
    expect(nextStop(rutaDetalleFixture().paradas.map((p) => ({ ...p, estado: "COMPLETADA" as const })))).toBeNull();
  });
});

describe("stopProgress", () => {
  it("reads the stop's position in visiting order", () => {
    expect(stopProgress([entrega, second, first], second)).toBe("2 de 3");
  });
});

describe("pendingStops", () => {
  it("keeps the stops still to visit, in visiting order", () => {
    const paradas = [entrega, { ...second, estado: "EN_SITIO" as const }, { ...first, estado: "COMPLETADA" as const }];

    expect(pendingStops(paradas).map((p) => p.id)).toEqual(["par-2", "par-3"]);
  });
});

describe("collectedKg", () => {
  it("adds the confirmed weight of completed pickups only", () => {
    const paradas = [
      { ...first, estado: "COMPLETADA" as const, peso_confirmado_kg: 40.5 },
      { ...second, estado: "FALLIDA" as const, peso_confirmado_kg: 10 },
      { ...entrega, estado: "COMPLETADA" as const, peso_confirmado_kg: 99 },
      paradaFixture({ id: "par-4", estado: "COMPLETADA", peso_confirmado_kg: null }),
    ];

    expect(collectedKg(paradas)).toBe(40.5);
  });
});

describe("offers", () => {
  const offered = ofertaFixture();
  const accepted = ofertaAceptadaFixture();
  const routed = ofertaAceptadaFixture({ id: "asg-9", donacion_id: "don-9", ruta_id: "ruta-1" });
  const ofertas = [offered, accepted, routed];

  it("splits live offers from accepted pickups without a route", () => {
    expect(liveOffers(ofertas)).toEqual([offered]);
    expect(acceptedWithoutRoute(ofertas)).toEqual([accepted]);
  });

  it("maps each accepted donation to its assignment", () => {
    expect(asignacionByDonacion(ofertas)).toEqual(
      new Map([
        [accepted.donacion_id, "asg-8"],
        ["don-9", "asg-9"],
      ]),
    );
  });
});

describe("validateRouteSelection", () => {
  const pickup = (n: number, almacen_id = "alm-1") =>
    ofertaAceptadaFixture({ id: `asg-${n}`, donacion_id: `don-${n}`, almacen_id });

  it("accepts 1 to 5 pickups to the same warehouse", () => {
    expect(validateRouteSelection([pickup(1)])).toBeNull();
    expect(validateRouteSelection([1, 2, 3, 4, 5].map((n) => pickup(n)))).toBeNull();
  });

  it("asks for at least one pickup", () => {
    expect(validateRouteSelection([])).toBe("Selecciona al menos una recogida para armar la ruta.");
  });

  it(`rejects more than ${MAX_STOPS_PER_ROUTE} pickups`, () => {
    expect(validateRouteSelection([1, 2, 3, 4, 5, 6].map((n) => pickup(n)))).toBe(
      "Una ruta admite como máximo 5 recogidas.",
    );
  });

  it("rejects pickups bound to different warehouses", () => {
    expect(validateRouteSelection([pickup(1), pickup(2, "alm-2")])).toBe(
      "Las recogidas seleccionadas van a almacenes distintos. Elige recogidas del mismo almacén.",
    );
  });
});
