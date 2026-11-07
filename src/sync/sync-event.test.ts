import { parseSyncEvent } from "./sync-event";

const DONACION_ID = "0b7c6f2e-3d4a-4e5f-9a1b-2c3d4e5f6a7b";
const RUTA_ID = "1c8d7a3f-4e5b-4f60-8b2c-3d4e5f6a7b8c";
const ASIGNACION_ID = "2d9e8b4a-5f6c-4a71-9c3d-4e5f6a7b8c9d";

describe("parseSyncEvent", () => {
  it("reads a v1 event with every field", () => {
    expect(
      parseSyncEvent({
        v: 1,
        entidad: "notificacion",
        id: DONACION_ID,
        donacion_id: DONACION_ID,
        ruta_id: RUTA_ID,
        asignacion_id: ASIGNACION_ID,
        tipo: "ASIGNACION_OFRECIDA",
      }),
    ).toEqual({
      v: 1,
      entidad: "notificacion",
      id: DONACION_ID,
      donacion_id: DONACION_ID,
      ruta_id: RUTA_ID,
      asignacion_id: ASIGNACION_ID,
      tipo: "ASIGNACION_OFRECIDA",
    });
  });

  it.each(["donacion", "asignacion", "parada", "ruta", "notificacion", "cuenta"])(
    "accepts the entity %s",
    (entidad) => {
      expect(parseSyncEvent({ v: 1, entidad })).toEqual({ v: 1, entidad });
    },
  );

  it("accepts upper-case uuids", () => {
    const id = DONACION_ID.toUpperCase();
    expect(parseSyncEvent({ v: 1, entidad: "donacion", id })).toEqual({
      v: 1,
      entidad: "donacion",
      id,
    });
  });

  it("drops fields outside the contract", () => {
    expect(
      parseSyncEvent({ v: 1, entidad: "donacion", id: DONACION_ID, estado: "PUBLICADA", x: 1 }),
    ).toEqual({ v: 1, entidad: "donacion", id: DONACION_ID });
  });

  it("treats null optional fields as absent", () => {
    expect(
      parseSyncEvent({ v: 1, entidad: "ruta", id: RUTA_ID, donacion_id: null, tipo: null }),
    ).toEqual({ v: 1, entidad: "ruta", id: RUTA_ID });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "sync"],
    ["a number", 1],
    ["an array", [{ v: 1, entidad: "donacion" }]],
    ["no version", { entidad: "donacion" }],
    ["another version", { v: 2, entidad: "donacion" }],
    ["a string version", { v: "1", entidad: "donacion" }],
    ["no entity", { v: 1 }],
    ["an unknown entity", { v: 1, entidad: "almacen" }],
    ["an entity of the wrong case", { v: 1, entidad: "Donacion" }],
    ["a non-uuid id", { v: 1, entidad: "donacion", id: "don-3" }],
    ["a numeric id", { v: 1, entidad: "donacion", id: 3 }],
    ["a non-uuid donacion_id", { v: 1, entidad: "parada", donacion_id: "x" }],
    ["a non-uuid ruta_id", { v: 1, entidad: "parada", ruta_id: `${RUTA_ID}0` }],
    ["a non-uuid asignacion_id", { v: 1, entidad: "asignacion", asignacion_id: "" }],
    ["a non-string tipo", { v: 1, entidad: "notificacion", tipo: 7 }],
  ])("rejects %s", (_, payload) => {
    expect(parseSyncEvent(payload)).toBeNull();
  });
});
