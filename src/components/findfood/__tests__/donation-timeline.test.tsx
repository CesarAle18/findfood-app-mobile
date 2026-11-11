import type { HistorialEstadoDto } from "@/services/donaciones";

import { historyEntries } from "../donation-timeline";

const row = (overrides: Partial<HistorialEstadoDto>): HistorialEstadoDto => ({
  id: 1,
  ambito: "DONACION",
  estado_anterior: null,
  estado_nuevo: "PUBLICADA",
  motivo: null,
  metadata: null,
  created_at: "2026-09-23T18:55:00.000Z",
  donacion_id: "d-1",
  asignacion_id: null,
  parada_id: null,
  usuario_nombres: null,
  lat: null,
  lng: null,
  ...overrides,
});

const BACK_IN_SEARCH = "De nuevo en búsqueda de voluntario";

/** The first publication, then whatever follows. */
const published = row({ id: 1, estado_anterior: "BORRADOR" });
const offer = (id: number, at: string) =>
  row({ id, ambito: "ASIGNACION", estado_anterior: null, estado_nuevo: "OFRECIDA", created_at: at, donacion_id: null });
const answer = (id: number, estado: string, at: string, extra: Partial<HistorialEstadoDto> = {}) =>
  row({
    id,
    ambito: "ASIGNACION",
    estado_anterior: "OFRECIDA",
    estado_nuevo: estado,
    created_at: at,
    donacion_id: null,
    ...extra,
  });

const titles = (rows: HistorialEstadoDto[]) => historyEntries(rows).map((entry) => entry.title);

describe("historyEntries", () => {
  it("sorts oldest first and labels each scope", () => {
    const entries = historyEntries([
      row({ id: 3, ambito: "PARADA", estado_nuevo: "COMPLETADA", created_at: "2026-09-23T20:00:00.000Z" }),
      row({ id: 1 }),
      row({
        id: 2,
        ambito: "ASIGNACION",
        estado_nuevo: "ACEPTADA",
        created_at: "2026-09-23T19:12:00.000Z",
        usuario_nombres: "Carlos",
      }),
      row({ id: 4, ambito: "INCIDENCIA", estado_nuevo: "EN_REVISION", created_at: "2026-09-23T21:00:00.000Z" }),
    ]);

    expect(entries).toEqual([
      { key: "1", title: "Buscando voluntario", at: "23/09/2026 · 13:55", by: null, motivo: null },
      { key: "2", title: "Asignación: Aceptada", at: "23/09/2026 · 14:12", by: "Carlos", motivo: null },
      { key: "3", title: "Recogida: Completada", at: "23/09/2026 · 15:00", by: null, motivo: null },
      { key: "4", title: "Incidencia: En revision", at: "23/09/2026 · 16:00", by: null, motivo: null },
    ]);
  });

  it("keeps an entry whose time cannot be read", () => {
    expect(historyEntries([row({ created_at: "ayer", motivo: "Sin cupo" })])).toEqual([
      { key: "1", title: "Buscando voluntario", at: null, by: null, motivo: "Sin cupo" },
    ]);
  });

  it("shows the donation back in search after a volunteer rejects the offer", () => {
    const entries = historyEntries([
      published,
      offer(2, "2026-09-23T19:00:00.000Z"),
      answer(3, "RECHAZADA", "2026-09-23T19:07:00.000Z", {
        usuario_nombres: "Carlos",
        motivo: "El punto está muy lejos",
      }),
    ]);

    expect(entries.slice(2)).toEqual([
      {
        key: "3",
        title: "Asignación: Rechazada",
        at: "23/09/2026 · 14:07",
        by: "Carlos",
        motivo: "El punto está muy lejos",
      },
      { key: "3-busqueda", title: BACK_IN_SEARCH, at: "23/09/2026 · 14:07", by: null, motivo: null },
    ]);
  });

  it("adds a single back-in-search entry after consecutive rejections and expiries", () => {
    expect(
      titles([
        published,
        offer(2, "2026-09-23T19:00:00.000Z"),
        offer(3, "2026-09-23T19:00:00.000Z"),
        answer(4, "RECHAZADA", "2026-09-23T19:05:00.000Z"),
        answer(5, "EXPIRADA", "2026-09-23T19:10:00.000Z"),
      ]),
    ).toEqual([
      "Buscando voluntario",
      "Asignación: Oferta pendiente",
      "Asignación: Oferta pendiente",
      "Asignación: Rechazada",
      "Asignación: Expirada",
      BACK_IN_SEARCH,
    ]);
  });

  it("adds one back-in-search entry after each run of rejections", () => {
    const entries = historyEntries([
      published,
      offer(2, "2026-09-23T19:00:00.000Z"),
      answer(3, "RECHAZADA", "2026-09-23T19:05:00.000Z"),
      offer(4, "2026-09-23T19:06:00.000Z"),
      answer(5, "RECHAZADA", "2026-09-23T19:09:00.000Z"),
    ]);

    expect(entries.filter((entry) => entry.title === BACK_IN_SEARCH).map((entry) => entry.key)).toEqual([
      "3-busqueda",
      "5-busqueda",
    ]);
  });

  it("relabels the republication after an abandon without adding another entry", () => {
    const at = "2026-09-23T20:00:00.000Z";
    const entries = historyEntries([
      published,
      answer(2, "ACEPTADA", "2026-09-23T19:00:00.000Z"),
      row({ id: 3, estado_anterior: "PUBLICADA", estado_nuevo: "ASIGNADA", created_at: "2026-09-23T19:00:00.000Z" }),
      row({
        id: 4,
        ambito: "ASIGNACION",
        estado_anterior: "ACEPTADA",
        estado_nuevo: "ABANDONADA",
        created_at: at,
        donacion_id: null,
      }),
      row({
        id: 5,
        estado_anterior: "ASIGNADA",
        estado_nuevo: "PUBLICADA",
        created_at: at,
        motivo: "El voluntario abandonó la asignación",
      }),
    ]);

    expect(entries.slice(3)).toEqual([
      { key: "4", title: "Asignación: Abandonada", at: "23/09/2026 · 15:00", by: null, motivo: null },
      {
        key: "5",
        title: BACK_IN_SEARCH,
        at: "23/09/2026 · 15:00",
        by: null,
        motivo: "El voluntario abandonó la asignación",
      },
    ]);
  });

  it("relabels a reassignment and does not repeat it after rejections in the same change", () => {
    const at = "2026-09-23T20:00:00.000Z";
    expect(
      titles([
        published,
        answer(2, "EXPIRADA", at),
        row({ id: 3, estado_anterior: "PUBLICADA", estado_nuevo: "PUBLICADA", created_at: at }),
      ]),
    ).toEqual(["Buscando voluntario", "Asignación: Expirada", BACK_IN_SEARCH]);
  });

  it("does not show a new search when the publication deadline passed", () => {
    const at = "2026-09-24T18:55:00.000Z";
    expect(
      titles([
        published,
        offer(2, "2026-09-23T19:00:00.000Z"),
        answer(3, "EXPIRADA", at, { motivo: "Venció el plazo de la publicación" }),
        row({ id: 4, estado_anterior: "PUBLICADA", estado_nuevo: "EXPIRADA", created_at: at }),
      ]),
    ).toEqual(["Buscando voluntario", "Asignación: Oferta pendiente", "Asignación: Expirada", "Expirada"]);
  });

  it("keeps a rejection by the bank as final", () => {
    expect(
      titles([
        published,
        row({ id: 2, estado_anterior: "EN_TRANSITO", estado_nuevo: "ENTREGADA", created_at: "2026-09-23T21:00:00.000Z" }),
        row({ id: 3, estado_anterior: "ENTREGADA", estado_nuevo: "RECHAZADA", created_at: "2026-09-23T22:00:00.000Z" }),
      ]),
    ).toEqual(["Buscando voluntario", "Entregada en el banco", "Rechazada"]);
  });

  it("keeps the label of a donor's republication after it expired", () => {
    expect(
      titles([
        published,
        row({ id: 2, estado_anterior: "PUBLICADA", estado_nuevo: "EXPIRADA", created_at: "2026-09-24T18:55:00.000Z" }),
        row({ id: 3, estado_anterior: "EXPIRADA", estado_nuevo: "PUBLICADA", created_at: "2026-09-25T18:55:00.000Z" }),
      ]),
    ).toEqual(["Buscando voluntario", "Expirada", "Buscando voluntario"]);
  });
});
