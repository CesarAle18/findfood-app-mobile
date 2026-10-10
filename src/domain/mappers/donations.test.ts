import type {
  DonacionDetalleDto,
  DonacionItemDto,
  DonacionResumenDto,
} from "@/services/donaciones";

import { donationFromDetalle, donationFromResumen } from "./donations";
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
});
