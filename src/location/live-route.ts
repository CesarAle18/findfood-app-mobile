/**
 * The volunteer's position on the route screen while the route is EN_CURSO. Watches the
 * device (every 5 s or 10 m), shares each fix on the private Realtime channel `ruta:<id>`
 * (the panel's live map; the API never stores it) and asks `GET /rutas/:id/seguimiento`
 * with it for the street path and arrival estimate to the next stop.
 *
 * Foreground only: with the screen closed, the tracking task keeps sending samples to
 * `POST /voluntario/ubicacion`, which the API uses when no position comes with the request.
 * Never asks for the permission by itself: `request` is for a button the volunteer presses.
 */
import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";

import type { Coordenada } from "@/api/types";
import { supabase } from "@/auth/supabase";
import { usePermissionGate } from "@/platform/permissions";
import { queryKeys } from "@/services/query-keys";
import { getSeguimiento } from "@/services/rutas";

/** Event of `ruta:<id>`; same payload the panel and the simulator use. */
export const LIVE_EVENT = "posicion";
export const SEGUIMIENTO_REFRESH_MS = 30_000;

export interface LivePosition extends Coordenada {
  rumbo: number | null;
  velocidad_kmh: number | null;
  precision_m: number | null;
  at: string;
}

const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 5_000,
  distanceInterval: 10,
};

/** The platform reports -1 (or nothing) when it has no heading or speed. */
const known = (value: number | null | undefined) =>
  value === null || value === undefined || value < 0 ? null : value;

export function toLivePosition({ coords, timestamp }: Location.LocationObject): LivePosition {
  const speed = known(coords.speed);
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    rumbo: known(coords.heading),
    velocidad_kmh: speed === null ? null : Math.round(speed * 3.6),
    precision_m: known(coords.accuracy),
    at: new Date(timestamp).toISOString(),
  };
}

export const seguimientoKey = (rutaId: string) =>
  [...queryKeys.rutas.detail(rutaId), "seguimiento"] as const;

export function useLiveRoute(rutaId: string | null) {
  const { gate, request } = usePermissionGate(Location.useForegroundPermissions);
  const [position, setPosition] = useState<LivePosition | null>(null);
  const latest = useRef<LivePosition | null>(null);
  const watching = rutaId !== null && gate === "granted";

  useEffect(() => {
    if (!watching || rutaId === null) return;
    let stopped = false;
    let subscription: Location.LocationSubscription | null = null;
    const channel = supabase?.channel(`ruta:${rutaId}`, { config: { private: true } }) ?? null;
    channel?.subscribe();
    Location.watchPositionAsync(WATCH_OPTIONS, (fix) => {
      const next = toLivePosition(fix);
      latest.current = next;
      setPosition(next);
      // Best effort: a lost fix is replaced by the next one a few seconds later.
      void channel?.send({ type: "broadcast", event: LIVE_EVENT, payload: next });
    })
      .then((started) => {
        if (stopped) started.remove();
        else subscription = started;
      })
      .catch(() => {
        // Without updates the map shows the planned route only.
      });
    return () => {
      stopped = true;
      subscription?.remove();
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [watching, rutaId]);

  const seguimiento = useQuery({
    queryKey: seguimientoKey(rutaId ?? ""),
    queryFn: ({ signal }) => getSeguimiento(rutaId!, latest.current, signal),
    enabled: rutaId !== null,
    refetchInterval: SEGUIMIENTO_REFRESH_MS,
  });

  // The first fix turns the estimate from "last known sample" into "from here".
  const located = position !== null;
  const { refetch } = seguimiento;
  useEffect(() => {
    if (located) void refetch();
  }, [located, refetch]);

  return {
    position: watching ? position : null,
    seguimiento: seguimiento.data ?? null,
    gate,
    request,
  };
}
