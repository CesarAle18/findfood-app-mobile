import type {
  DonacionDetalleDto,
  DonacionItemDto,
  DonacionResumenDto,
} from "@/services/donaciones";

import {
  UNKNOWN_PICKUP_WINDOW,
  assignedVolunteerFromDetalle,
  donationFromDetalle,
  donationFromResumen,
  donationRowFromResumen,
  tolerantDonationFromDetalle,
} from "./donations";
import { MappingError } from "./errors";

function resumen(overrides: Partial<DonacionResumenDto> = {}): DonacionResumenDto {
  return {
    id: "7d4f6a1e-0c2b-4f7e-9a51-3b8f2d1c9e10",
    codigo: "DON-1058",
    estado: "PUBLICADA",
    titulo: "Frutas y panadería",
    peso_estimado_kg: 35,
    peso_recibido_kg: null,
    requiere_refrigeracion: true,
    ventana_recogida_inicio: "2026-09-23T21:00:00.000Z",
    ventana_recogida_fin: "2026-09-23T23:00:00.000Z",
    direccion_recogida: "Cra 45 #12-30, Bogotá",
    score_urgencia: null,
    publicada_at: "2026-09-23T18:55:00.000Z",
    expira_publicacion_at: null,
    created_at: "2026-09-23T18:50:00.000Z",
    almacen_destino: null,
    cantidad_productos: 3,
    ...overrides,
  };
}

function item(nombre: string, overrides: Partial<DonacionItemDto> = {}): DonacionItemDto {
  return {
    id: `item-${nombre}`,
    descripcion: null,
    cantidad: 10,
    peso_estimado_kg: 10,
    peso_real_kg: null,
    fecha_vencimiento: "2026-09-16T00:00:00.000Z",
    requiere_refrigeracion: false,
    observaciones: null,
    tipo_alimento: { id: 1, codigo: nombre.toUpperCase(), nombre },
    unidad_medida: { id: 4, codigo: "KG", nombre: "Kilogramo" },
    foto_url: null,
    ...overrides,
  };
}

function detalle(overrides: Partial<DonacionDetalleDto> = {}): DonacionDetalleDto {
  return {
    id: "7d4f6a1e-0c2b-4f7e-9a51-3b8f2d1c9e10",
    codigo: "DON-1058",
    estado: "ASIGNADA",
    modo_recoleccion: "VOLUNTARIO",
    titulo: null,
    descripcion: null,
    peso_estimado_kg: 35,
    peso_recogido_kg: null,
    peso_recibido_kg: null,
    requiere_refrigeracion: true,
    fecha_vencimiento_min: "2026-09-16T00:00:00.000Z",
    ventana_recogida_inicio: "2026-09-23T21:00:00.000Z",
    ventana_recogida_fin: "2026-09-23T23:00:00.000Z",
    direccion_recogida: "Cra 45 #12-30, Bogotá",
    referencia_recogida: null,
    ubicacion_recogida: { lat: 4.65, lng: -74.06 },
    score_urgencia: null,
    publicada_at: "2026-09-23T18:55:00.000Z",
    expira_publicacion_at: null,
    asignada_at: "2026-09-23T19:12:00.000Z",
    recogida_at: null,
    entregada_at: null,
    recibida_at: null,
    cancelada_at: null,
    observacion_cancelacion: null,
    created_at: "2026-09-23T18:50:00.000Z",
    updated_at: "2026-09-23T19:12:00.000Z",
    almacen_destino: null,
    motivo_cancelacion: null,
    contacto: null,
    items: [item("Frutas"), item("Verduras"), item("Frutas"), item("Panadería")],
    asignacion: null,
    ...overrides,
  };
}

/** 10:00 of 23/09/2026 in Bogotá. */
const NOW = Date.UTC(2026, 8, 23, 15);

describe("donationFromResumen", () => {
  it("maps a list row to the presentation model", () => {
    expect(donationFromResumen(resumen())).toEqual({
      id: "7d4f6a1e-0c2b-4f7e-9a51-3b8f2d1c9e10",
      code: "DON-1058",
      estado: "PUBLICADA",
      category: "Frutas y panadería",
      weightKg: 35,
      status: "Buscando voluntario",
      statusTone: "primary",
      pickupWindow: "23/09/2026 · 16:00–18:00",
      expiresOn: "",
      address: "Cra 45 #12-30, Bogotá",
      refrigerated: true,
    });
  });

  it("names the window by its day when given the current time", () => {
    expect(donationFromResumen(resumen(), NOW).pickupWindow).toBe("Hoy · 16:00–18:00");
  });

  it.each([
    [null, 3, "3 productos"],
    ["  ", 1, "1 producto"],
  ])("falls back to the product count without a title (%p)", (titulo, cantidad, category) => {
    expect(
      donationFromResumen(resumen({ titulo, cantidad_productos: cantidad })).category,
    ).toBe(category);
  });

  it("surfaces a malformed window as a MappingError", () => {
    expect(() =>
      donationFromResumen(resumen({ ventana_recogida_fin: "2026-09-23T23:00:00" })),
    ).toThrow(MappingError);
  });
});

describe("donationRowFromResumen", () => {
  it("maps a valid row exactly like donationFromResumen", () => {
    expect(donationRowFromResumen(resumen(), NOW)).toEqual(donationFromResumen(resumen(), NOW));
  });

  it.each([
    ["an inverted window", { ventana_recogida_fin: "2026-09-23T20:00:00.000Z" }],
    ["a window without offset", { ventana_recogida_inicio: "2026-09-23T21:00:00" }],
  ])("keeps a row with %s, showing a neutral window", (_case, overrides) => {
    expect(donationRowFromResumen(resumen(overrides), NOW)).toMatchObject({
      id: "7d4f6a1e-0c2b-4f7e-9a51-3b8f2d1c9e10",
      code: "DON-1058",
      estado: "PUBLICADA",
      status: "Buscando voluntario",
      pickupWindow: UNKNOWN_PICKUP_WINDOW,
    });
  });

  it("does not hide errors other than mapping errors", () => {
    expect(() => donationRowFromResumen(null as unknown as DonacionResumenDto)).toThrow(
      TypeError,
    );
  });
});

describe("assignedVolunteerFromDetalle", () => {
  const asignacion: NonNullable<DonacionDetalleDto["asignacion"]> = {
    id: "asig-1",
    estado: "ACEPTADA",
    intento: 1,
    expira_at: "2026-09-23T20:00:00.000Z",
    aceptada_at: "2026-09-23T19:12:00.000Z",
    ruta_id: null,
    flota_banco: false,
    voluntario: {
      nombres: "Carlos",
      apellidos: "Ruiz",
      telefono: "+573001112233",
      placa_vehiculo: "ABC123",
      tipo_vehiculo: "Camioneta",
    },
  };

  it("names the volunteer and their vehicle", () => {
    expect(assignedVolunteerFromDetalle(detalle({ asignacion }))).toEqual({
      name: "Carlos Ruiz",
      vehicle: "Camioneta · ABC123",
      phone: "+573001112233",
    });
  });

  it("leaves out what the API does not share yet", () => {
    const voluntario = {
      ...asignacion.voluntario!,
      apellidos: null,
      telefono: null,
      placa_vehiculo: null,
    };
    expect(
      assignedVolunteerFromDetalle(detalle({ asignacion: { ...asignacion, voluntario } })),
    ).toEqual({ name: "Carlos", vehicle: "Camioneta", phone: null });
  });

  it.each([
    ["no assignment", null],
    ["a bank fleet assignment", { ...asignacion, flota_banco: true, voluntario: null }],
  ])("is null with %s", (_case, value) => {
    expect(assignedVolunteerFromDetalle(detalle({ asignacion: value }))).toBeNull();
  });
});

describe("donationFromDetalle", () => {
  it("maps the detail to the presentation model", () => {
    expect(donationFromDetalle(detalle(), NOW)).toEqual({
      id: "7d4f6a1e-0c2b-4f7e-9a51-3b8f2d1c9e10",
      code: "DON-1058",
      estado: "ASIGNADA",
      category: "Frutas, Verduras y Panadería",
      weightKg: 35,
      status: "Voluntario asignado",
      statusTone: "primary",
      pickupWindow: "Hoy · 16:00–18:00",
      expiresOn: "16/09/2026",
      address: "Cra 45 #12-30, Bogotá",
      refrigerated: true,
    });
  });

  it("prefers the donor's title over the food types", () => {
    expect(donationFromDetalle(detalle({ titulo: "Mercado semanal" })).category).toBe(
      "Mercado semanal",
    );
  });

  it.each([
    [["Lácteos"], "Lácteos"],
    [["Lácteos", "Frutas"], "Lácteos y Frutas"],
    [[], ""],
  ])("joins the food types %p", (nombres, category) => {
    expect(donationFromDetalle(detalle({ items: nombres.map((n) => item(n)) })).category).toBe(
      category,
    );
  });

  it("keeps the calendar date of the earliest expiry", () => {
    expect(
      donationFromDetalle(detalle({ fecha_vencimiento_min: "2027-01-01T00:00:00.000Z" }))
        .expiresOn,
    ).toBe("01/01/2027");
  });

  it("leaves the expiry empty when no product declares one", () => {
    expect(donationFromDetalle(detalle({ fecha_vencimiento_min: null })).expiresOn).toBe("");
  });

  it("uses the danger tone for a rejected donation", () => {
    expect(donationFromDetalle(detalle({ estado: "RECHAZADA" }))).toMatchObject({
      status: "Rechazada",
      statusTone: "danger",
    });
  });

  it.each([
    ["an inverted window", { ventana_recogida_fin: "2026-09-23T20:00:00.000Z" }],
    ["an expiry it cannot read", { fecha_vencimiento_min: "2026-02-30" }],
  ])("surfaces %s as a MappingError", (_case, overrides) => {
    expect(() => donationFromDetalle(detalle(overrides))).toThrow(MappingError);
  });
});

describe("tolerantDonationFromDetalle", () => {
  it("maps a valid detail exactly like donationFromDetalle", () => {
    expect(tolerantDonationFromDetalle(detalle(), NOW)).toEqual(donationFromDetalle(detalle(), NOW));
  });

  it.each([
    ["an inverted window", { ventana_recogida_fin: "2026-09-23T20:00:00.000Z" }],
    ["a window without offset", { ventana_recogida_inicio: "2026-09-23T21:00:00" }],
  ])("keeps a detail with %s, showing a neutral window", (_case, overrides) => {
    expect(tolerantDonationFromDetalle(detalle(overrides), NOW)).toMatchObject({
      code: "DON-1058",
      pickupWindow: UNKNOWN_PICKUP_WINDOW,
      expiresOn: "16/09/2026",
    });
  });

  it.each(["2026-02-30", "16/09/2026", "2026-09-16T05:00:00.000Z"])(
    "leaves an unreadable expiry (%p) empty and keeps the window",
    (fecha) => {
      expect(
        tolerantDonationFromDetalle(detalle({ fecha_vencimiento_min: fecha }), NOW),
      ).toMatchObject({ pickupWindow: "Hoy · 16:00–18:00", expiresOn: "" });
    },
  );

  it("does not hide errors other than mapping errors inside the tolerated fields", () => {
    // A Symbol makes the window parser itself throw a TypeError inside the fallback wrapper:
    // only a MappingError may turn into "Ventana por confirmar".
    const broken = {
      ...detalle(),
      ventana_recogida_inicio: Symbol("not a string"),
    } as unknown as DonacionDetalleDto;
    expect(() => tolerantDonationFromDetalle(broken, NOW)).toThrow(TypeError);
  });
});
