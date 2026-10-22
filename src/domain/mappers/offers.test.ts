import { DONATION_ID, ofertaAceptadaFixture, ofertaFixture } from "@/test-utils/fixtures";

import { UNKNOWN_PICKUP_WINDOW } from "./donations";
import { offerFromOferta, selectOffer } from "./offers";

describe("offerFromOferta", () => {
  it("summarizes the offer in Bogotá time", () => {
    expect(offerFromOferta(ofertaFixture())).toEqual({
      id: "asg-7",
      code: "DON-1048",
      title: "Supermercado La 14",
      summary: "45 kg · Refrigeración requerida",
      pickupWindow: "13/10/2026 · 16:00–18:00",
      address: "Calle 5 # 38-25, Cali · Muelle de carga",
      point: { lat: 3.42, lng: -76.54 },
      distance: "2,8 km",
      expiresAt: "15:10",
      expiresAtIso: "2026-10-13T20:10:00Z",
      weightKg: 45,
      donacionId: DONATION_ID,
      contactName: null,
      contactPhone: null,
      accepted: false,
      products: ["Lácteos · 20 L", "Pan · 25 KG"],
    });
  });

  it("carries the donor contact once accepted", () => {
    expect(offerFromOferta(ofertaAceptadaFixture())).toMatchObject({
      accepted: true,
      contactName: "Laura Gómez",
      contactPhone: "+57 300 111 2233",
    });
  });

  it("tolerates missing optional data", () => {
    const view = offerFromOferta(
      ofertaFixture({
        titulo: null,
        distancia_km: null,
        referencia_recogida: null,
        requiere_refrigeracion: false,
        productos: null,
        estado: "ACEPTADA",
        ventana_recogida_fin: "2026-10-13T20:00:00Z",
      }),
    );
    expect(view).toMatchObject({
      title: "Donación sin título",
      summary: "45 kg · Sin refrigeración",
      address: "Calle 5 # 38-25, Cali",
      distance: null,
      accepted: true,
      products: [],
      pickupWindow: UNKNOWN_PICKUP_WINDOW,
    });
  });
});

describe("selectOffer", () => {
  const first = ofertaFixture({ id: "a", estado: "ACEPTADA" });
  const second = ofertaFixture({ id: "b" });
  const third = ofertaFixture({ id: "c" });

  it("picks the requested assignment", () => {
    expect(selectOffer([first, second, third], "c")).toBe(third);
  });

  it("is null when the requested assignment is no longer listed", () => {
    expect(selectOffer([first, second], "gone")).toBeNull();
  });

  it("without an id, picks the first pending offer", () => {
    expect(selectOffer([first, second, third], undefined)).toBe(second);
    expect(selectOffer([first], "")).toBeNull();
  });
});
