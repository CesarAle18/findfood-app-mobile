import { QueryObserver, type QueryKey } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react-native";

import type { OpenableNotification } from "@/notifications/use-open-notification";
import { queryKeys } from "@/services/query-keys";
import { createTestQueryClient } from "@/test-utils/query";

import type { SyncEvent } from "./sync-event";
import { invalidateTargets, keysForPushData, keysForSyncEvent } from "./sync-keys";

const { asignaciones, donaciones, me, notificaciones, perfil, rutas } = queryKeys;

const DON = "0b7c6f2e-3d4a-4e5f-9a1b-2c3d4e5f6a7b";
const RUTA = "1c8d7a3f-4e5b-4f60-8b2c-3d4e5f6a7b8c";
const ASG = "2d9e8b4a-5f6c-4a71-9c3d-4e5f6a7b8c9d";
/** `seguimientoKey(RUTA)` of `@/location/live-route`: the ETA, backed by Google. */
const ETA_KEY = [...rutas.detail(RUTA), "seguimiento"] as const;

const event = (fields: Omit<SyncEvent, "v">): SyncEvent => ({ v: 1, ...fields });
const prefix = (queryKey: QueryKey) => ({ queryKey });
const routeDetail = (id: string) => ({ queryKey: rutas.detail(id), exact: true });

describe("keysForSyncEvent", () => {
  it("a donation refreshes its detail, history, tracking, the lists, impact and offers", () => {
    expect(keysForSyncEvent(event({ entidad: "donacion", id: DON }))).toEqual([
      prefix(donaciones.lists()),
      prefix(donaciones.detail(DON)),
      prefix(donaciones.historial(DON)),
      prefix(donaciones.seguimiento(DON)),
      prefix(perfil.impacto()),
      prefix(asignaciones.ofertas()),
      prefix(rutas.lists()),
    ]);
  });

  it("a donation without id still refreshes what does not need it", () => {
    expect(keysForSyncEvent(event({ entidad: "donacion" }))).toEqual([
      prefix(donaciones.lists()),
      prefix(perfil.impacto()),
      prefix(asignaciones.ofertas()),
      prefix(rutas.lists()),
    ]);
  });

  it("an assignment refreshes the offers, its donation and its route", () => {
    const accepted = event({ entidad: "asignacion", id: ASG, donacion_id: DON, ruta_id: RUTA });
    expect(keysForSyncEvent(accepted)).toEqual([
      prefix(asignaciones.ofertas()),
      prefix(donaciones.detail(DON)),
      prefix(donaciones.historial(DON)),
      prefix(rutas.lists()),
      routeDetail(RUTA),
    ]);
    expect(keysForSyncEvent(event({ entidad: "asignacion", id: ASG }))).toEqual([
      prefix(asignaciones.ofertas()),
      prefix(rutas.lists()),
    ]);
  });

  it("a stop refreshes its route and its donation", () => {
    const pickup = event({ entidad: "parada", ruta_id: RUTA, donacion_id: DON });
    expect(keysForSyncEvent(pickup)).toEqual([
      routeDetail(RUTA),
      prefix(rutas.lists()),
      prefix(donaciones.detail(DON)),
      prefix(donaciones.historial(DON)),
      prefix(donaciones.seguimiento(DON)),
    ]);
    // A delivery stop has no donation.
    expect(keysForSyncEvent(event({ entidad: "parada", ruta_id: RUTA }))).toEqual([
      routeDetail(RUTA),
      prefix(rutas.lists()),
    ]);
  });

  it("a route refreshes itself, the lists, the offers and the donation lists", () => {
    expect(keysForSyncEvent(event({ entidad: "ruta", id: RUTA }))).toEqual([
      prefix(rutas.lists()),
      routeDetail(RUTA),
      prefix(asignaciones.ofertas()),
      prefix(donaciones.lists()),
    ]);
  });

  it("a notification refreshes the inbox and what its push would refresh", () => {
    expect(
      keysForSyncEvent(event({ entidad: "notificacion", tipo: "ASIGNACION_OFRECIDA", id: ASG })),
    ).toEqual([prefix(notificaciones.all), prefix(asignaciones.ofertas())]);
    const cancelled = { tipo: "DONACION_CANCELADA", donacion_id: DON, asignacion_id: ASG };
    expect(keysForSyncEvent(event({ entidad: "notificacion", ...cancelled }))).toEqual(
      keysForPushData(cancelled),
    );
  });

  it("an account change refreshes GET /me and the profile, impact included", () => {
    expect(keysForSyncEvent(event({ entidad: "cuenta" }))).toEqual([
      prefix(me),
      prefix(perfil.all),
    ]);
  });

  it("route details are exact, so their Google-backed ETA is not refetched", () => {
    const client = createTestQueryClient();
    for (const key of [rutas.detail(RUTA), ETA_KEY]) client.setQueryData(key, "cached");

    for (const entidad of ["parada", "ruta", "asignacion"] as const) {
      invalidateTargets(client, keysForSyncEvent(event({ entidad, id: RUTA, ruta_id: RUTA })));
    }

    expect(client.getQueryState(rutas.detail(RUTA))?.isInvalidated).toBe(true);
    expect(client.getQueryState(ETA_KEY)?.isInvalidated).toBe(false);
  });
});

describe("keysForPushData", () => {
  it("a push about a donation refreshes the inbox and that donation everywhere", () => {
    expect(keysForPushData({ tipo: "ASIGNACION_ACEPTADA", donacion_id: DON })).toEqual([
      prefix(notificaciones.all),
      prefix(donaciones.detail(DON)),
      prefix(donaciones.historial(DON)),
      prefix(donaciones.seguimiento(DON)),
      prefix(donaciones.lists()),
      prefix(perfil.impacto()),
    ]);
  });

  it("a new offer refreshes the offers", () => {
    expect(keysForPushData({ tipo: "ASIGNACION_OFRECIDA", asignacion_id: ASG })).toEqual([
      prefix(notificaciones.all),
      prefix(asignaciones.ofertas()),
    ]);
  });

  it("a cancelled donation also refreshes the offers and the routes", () => {
    expect(keysForPushData({ tipo: "DONACION_CANCELADA", donacion_id: DON })).toEqual([
      prefix(notificaciones.all),
      prefix(donaciones.detail(DON)),
      prefix(donaciones.historial(DON)),
      prefix(donaciones.seguimiento(DON)),
      prefix(donaciones.lists()),
      prefix(perfil.impacto()),
      prefix(asignaciones.ofertas()),
      prefix(rutas.all),
    ]);
  });

  const donationEverywhere = [
    prefix(donaciones.detail(DON)),
    prefix(donaciones.historial(DON)),
    prefix(donaciones.seguimiento(DON)),
    prefix(donaciones.lists()),
    prefix(perfil.impacto()),
  ];

  it.each(["DONACION_CANCELADA_BANCO", "DONACION_REPUBLICADA", "RECOGIDA_FALLIDA"])(
    "a staff change to the donor's donation refreshes that donation everywhere (%s)",
    (tipo) => {
      expect(keysForPushData({ tipo, donacion_id: DON })).toEqual([
        prefix(notificaciones.all),
        ...donationEverywhere,
      ]);
    },
  );

  it.each(["ASIGNACION_TOMADA", "ASIGNACION_RETIRADA"])(
    "a closed offer refreshes the offers and the route lists, never a route's ETA (%s)",
    (tipo) => {
      const closed = { tipo, donacion_id: DON, asignacion_id: ASG };
      expect(keysForPushData(closed)).toEqual([
        prefix(notificaciones.all),
        ...donationEverywhere,
        prefix(asignaciones.ofertas()),
        prefix(rutas.lists()),
      ]);

      const client = createTestQueryClient();
      for (const key of [rutas.detail(RUTA), ETA_KEY]) client.setQueryData(key, "cached");
      invalidateTargets(client, keysForPushData(closed));
      expect(client.getQueryState(ETA_KEY)?.isInvalidated).toBe(false);
    },
  );

  it.each(["INCIDENCIA_EN_REVISION", "INCIDENCIA_RESUELTA"])(
    "a reviewed incident refreshes its donation when it names one (%s)",
    (tipo) => {
      expect(keysForPushData({ tipo, donacion_id: DON, asignacion_id: ASG })).toEqual([
        prefix(notificaciones.all),
        ...donationEverywhere,
      ]);
      expect(keysForPushData({ tipo, asignacion_id: ASG })).toEqual([prefix(notificaciones.all)]);
    },
  );

  it.each(["VERIFICACION_APROBADA", "VERIFICACION_RECHAZADA"])(
    "a reviewed volunteer request refreshes the account (%s)",
    (tipo) => {
      expect(keysForPushData({ tipo })).toEqual([prefix(notificaciones.all), prefix(me)]);
    },
  );

  it("reads a tapped notification about to open", () => {
    const opening: OpenableNotification = {
      id: "n-9",
      tipo: "ASIGNACION_OFRECIDA",
      donacion_id: null,
      asignacion_id: ASG,
    };
    expect(keysForPushData(opening)).toEqual([
      prefix(notificaciones.all),
      prefix(asignaciones.ofertas()),
    ]);
  });

  it.each([
    undefined,
    null,
    {},
    { tipo: "ALGO_NUEVO" },
    // Staff only (IN_APP); the app never gets it, but stays safe if it does.
    { tipo: "INCIDENCIA_REPORTADA" },
    { tipo: 7 },
    { donacion_id: "" },
    { donacion_id: 7 },
  ])(
    "only refreshes the inbox for anything else (%p)",
    (data) => {
      expect(keysForPushData(data as Record<string, unknown> | null | undefined)).toEqual([
        prefix(notificaciones.all),
      ]);
    },
  );
});

describe("invalidateTargets", () => {
  it("invalidates each target once, without cancelling a refetch in flight", () => {
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");

    invalidateTargets(client, [
      prefix(donaciones.lists()),
      routeDetail(RUTA),
      prefix(["donaciones", "list"]),
      routeDetail(RUTA),
      prefix(perfil.impacto()),
    ]);

    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: donaciones.lists() }, { cancelRefetch: false }],
      [{ queryKey: rutas.detail(RUTA), exact: true }, { cancelRefetch: false }],
      [{ queryKey: perfil.impacto() }, { cancelRefetch: false }],
    ]);
  });

  it("keeps the wider target when a key comes both exact and by prefix", () => {
    const client = createTestQueryClient();
    const invalidate = jest.spyOn(client, "invalidateQueries");

    invalidateTargets(client, [routeDetail(RUTA), prefix(rutas.detail(RUTA))]);

    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: rutas.detail(RUTA) }, { cancelRefetch: false }],
    ]);
  });

  it("refetches the queries on screen and only marks the others stale", async () => {
    const client = createTestQueryClient();
    client.setQueryData(donaciones.detail(DON), "cached");
    client.setQueryData(donaciones.lists(), "cached");
    const queryFn = jest.fn(async () => "fresh");
    const onScreen = new QueryObserver(client, {
      queryKey: donaciones.detail(DON),
      queryFn,
      staleTime: Infinity,
    });
    const unsubscribe = onScreen.subscribe(() => undefined);

    invalidateTargets(client, keysForSyncEvent(event({ entidad: "donacion", id: DON })));

    await waitFor(() => expect(client.getQueryData(donaciones.detail(DON))).toBe("fresh"));
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(donaciones.lists())).toMatchObject({
      isInvalidated: true,
      data: "cached",
    });
    unsubscribe();
  });
});
