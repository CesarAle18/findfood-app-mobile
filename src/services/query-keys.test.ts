import type { QueryKey } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test-utils/query";

import { queryKeys } from "./query-keys";

const { asignaciones, catalogos, donaciones, evidencias, me, notificaciones, perfil, rutas } =
  queryKeys;

/** Caches every key, invalidates `target` and returns the keys it reached. */
function reached(keys: readonly QueryKey[], target: QueryKey): QueryKey[] {
  const client = createTestQueryClient();
  for (const key of keys) client.setQueryData(key, "cached");
  void client.invalidateQueries({ queryKey: target, refetchType: "none" });
  return keys.filter((key) => client.getQueryState(key)?.isInvalidated);
}

const donacionKeys = [
  donaciones.list({}),
  donaciones.list({ estado: "PUBLICADA" }),
  donaciones.detail("d-1"),
  donaciones.detail("d-2"),
  donaciones.historial("d-1"),
];
const rutaKeys = [rutas.list({}), rutas.list({ estado: "EN_CURSO" }), rutas.detail("r-1")];
const notificacionKeys = [
  notificaciones.list({}),
  notificaciones.list({ solo_no_leidas: true }),
  notificaciones.unreadCount(),
];
const evidenciaKeys = [
  evidencias.list({ parada_id: "p-1" }),
  evidencias.list({ donacion_id: "d-1" }),
];
const catalogoKeys = [
  catalogos.byIncluir(["unidades_medida"]),
  catalogos.byIncluir(["motivos"], "RECHAZO_ASIGNACION"),
];
const otherKeys = [
  me,
  perfil.impacto(),
  asignaciones.ofertas(),
  ...rutaKeys,
  ...notificacionKeys,
  ...evidenciaKeys,
  ...catalogoKeys,
];
const everyKey = [...donacionKeys, ...otherKeys];

describe("queryKeys", () => {
  it("module roots reach every query of their module and nothing else", () => {
    expect(reached(everyKey, donaciones.all)).toEqual(donacionKeys);
    expect(reached(everyKey, rutas.all)).toEqual(rutaKeys);
    expect(reached(everyKey, notificaciones.all)).toEqual(notificacionKeys);
    expect(reached(everyKey, evidencias.all)).toEqual(evidenciaKeys);
    expect(reached(everyKey, catalogos.all)).toEqual(catalogoKeys);
    expect(reached(everyKey, asignaciones.all)).toEqual([asignaciones.ofertas()]);
    expect(reached(everyKey, perfil.all)).toEqual([perfil.impacto()]);
  });

  it("`me` only reaches GET /me (profile, notifications and impact live elsewhere)", () => {
    expect(reached(everyKey, me)).toEqual([me]);
  });

  it("lists() reaches every list of the module, whatever its filters", () => {
    expect(reached(everyKey, donaciones.lists())).toEqual(donacionKeys.slice(0, 2));
    expect(reached(everyKey, rutas.lists())).toEqual(rutaKeys.slice(0, 2));
    expect(reached(everyKey, notificaciones.lists())).toEqual(notificacionKeys.slice(0, 2));
    expect(reached(everyKey, evidencias.lists())).toEqual(evidenciaKeys);
  });

  it("details() reaches every detail; detail(id) only that one", () => {
    expect(reached(everyKey, donaciones.details())).toEqual([
      donaciones.detail("d-1"),
      donaciones.detail("d-2"),
    ]);
    expect(reached(everyKey, donaciones.detail("d-1"))).toEqual([donaciones.detail("d-1")]);
    expect(reached(everyKey, donaciones.historial("d-1"))).toEqual([
      donaciones.historial("d-1"),
    ]);
    expect(reached(everyKey, rutas.details())).toEqual([rutas.detail("r-1")]);
  });

  it("list(filters) only reaches lists with the same filters", () => {
    expect(reached(everyKey, donaciones.list({ estado: "PUBLICADA" }))).toEqual([
      donaciones.list({ estado: "PUBLICADA" }),
    ]);
    expect(reached(everyKey, evidencias.list({ parada_id: "p-1" }))).toEqual([
      evidencias.list({ parada_id: "p-1" }),
    ]);
  });

  it("normalizes catalog requests so equal requests share one key", () => {
    expect(catalogos.byIncluir(["unidades_medida", "tipos_alimento", "unidades_medida"])).toEqual(
      catalogos.byIncluir(["tipos_alimento", "unidades_medida"]),
    );
    expect(catalogos.byIncluir(["motivos"])).not.toEqual(
      catalogos.byIncluir(["motivos"], "RECHAZO_ASIGNACION"),
    );
  });
});
