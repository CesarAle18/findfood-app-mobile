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
      { id: 1, title: "Buscando voluntario", at: "23/09/2026 · 13:55", by: null, motivo: null },
      { id: 2, title: "Asignación: Aceptada", at: "23/09/2026 · 14:12", by: "Carlos", motivo: null },
      { id: 3, title: "Recogida: Completada", at: "23/09/2026 · 15:00", by: null, motivo: null },
      { id: 4, title: "Incidencia: En revision", at: "23/09/2026 · 16:00", by: null, motivo: null },
    ]);
  });

  it("keeps an entry whose time cannot be read", () => {
    expect(historyEntries([row({ created_at: "ayer", motivo: "Sin cupo" })])).toEqual([
      { id: 1, title: "Buscando voluntario", at: null, by: null, motivo: "Sin cupo" },
    ]);
  });
});
