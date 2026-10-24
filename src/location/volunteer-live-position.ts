/**
 * The volunteer's live position, as the donor sees it while their donation is on the way.
 * Receive only: listens to the private Realtime channel `ruta:<id>` (event `posicion`) that
 * `useLiveRoute` broadcasts on, the same one the staff panel's live map reads
 * (findfood-front-web `useLivePosition`). Realtime lets the donor in only while the API
 * reports the live window (`GET /donaciones/:id/seguimiento → ruta_id`).
 *
 * Complementary: without a channel (no Supabase client, denied, failed) the screen keeps the
 * position the tracking poll returns.
 */
import { useEffect, useRef, useState } from "react";

import type { Coordenada } from "@/api/types";
import { supabase } from "@/auth/supabase";

import { LIVE_EVENT, type LivePosition } from "./live-route";

export type LiveStatus = "conectando" | "conectado" | "sin-permiso" | "error";

const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A broadcast payload as a position, or null when it is not a point on Earth. */
export function parsePosition(payload: unknown): LivePosition | null {
  const p = (payload ?? {}) as Record<string, unknown>;
  const lat = finite(p.lat);
  const lng = finite(p.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat,
    lng,
    rumbo: finite(p.rumbo),
    velocidad_kmh: finite(p.velocidad_kmh),
    precision_m: finite(p.precision_m),
    // A sample without a readable time counts as just received.
    at: typeof p.at === "string" && !Number.isNaN(Date.parse(p.at)) ? p.at : new Date().toISOString(),
  };
}

/** Broadcasts can arrive out of order: a sample older than the one shown is dropped. */
const isOlder = (next: LivePosition, shown: LivePosition | null) =>
  shown !== null && Date.parse(next.at) < Date.parse(shown.at);

const DENIED = /unauthori[sz]ed|permission|denied/i;

interface ChannelState {
  rutaId: string;
  status: LiveStatus;
  position: LivePosition | null;
}

/**
 * Listens to `ruta:<rutaId>` while `rutaId` is not null. `status` is null when nothing is
 * listened to (no route, or no Supabase client in the local profile).
 */
export function useVolunteerLivePosition(rutaId: string | null): {
  status: LiveStatus | null;
  position: LivePosition | null;
} {
  const [state, setState] = useState<ChannelState | null>(null);
  const client = supabase;

  useEffect(() => {
    if (!rutaId || !client) return;
    // Starts over on every route: a position of the previous one never carries over.
    const update = (patch: (current: ChannelState) => Partial<ChannelState>) =>
      setState((previous) => {
        const current: ChannelState =
          previous?.rutaId === rutaId ? previous : { rutaId, status: "conectando", position: null };
        return { ...current, ...patch(current) };
      });
    const channel = client
      .channel(`ruta:${rutaId}`, { config: { private: true } })
      .on("broadcast", { event: LIVE_EVENT }, ({ payload }) => {
        const next = parsePosition(payload);
        if (next) update((current) => (isOlder(next, current.position) ? {} : { position: next }));
      })
      .subscribe((status, error) => {
        if (status === "SUBSCRIBED") update(() => ({ status: "conectado" }));
        else if (status === "CHANNEL_ERROR")
          update(() => ({ status: DENIED.test(error?.message ?? "") ? "sin-permiso" : "error" }));
        else if (status === "TIMED_OUT") update(() => ({ status: "error" }));
      });
    return () => {
      void client.removeChannel(channel);
    };
  }, [rutaId, client]);

  if (!rutaId || !client) return { status: null, position: null };
  const current = state?.rutaId === rutaId ? state : null;
  return { status: current?.status ?? "conectando", position: current?.position ?? null };
}

/**
 * Slides the marker from the point shown to `target` over `ms` (positions arrive every few
 * seconds) instead of jumping. The first point shows at once; null hides it.
 */
export function useGlide(target: Coordenada | null, ms = 1000): Coordenada | null {
  const [shown, setShown] = useState<Coordenada | null>(target);
  const from = useRef<Coordenada | null>(target);
  const lat = target?.lat;
  const lng = target?.lng;
  // Adjusted during render (not in the effect) so the stale point is never drawn again.
  if (!target && shown !== null) setShown(null);

  useEffect(() => {
    if (lat === undefined || lng === undefined) {
      // Forget the last point so a target that comes back appears where it is.
      from.current = null;
      return;
    }
    const start = from.current ?? { lat, lng };
    // Date.now rather than the frame's timestamp: Jest's frames report a different clock.
    const startedAt = Date.now();
    let frame = 0;
    const step = () => {
      const k = ms > 0 ? Math.min(1, (Date.now() - startedAt) / ms) : 1;
      const point = { lat: start.lat + (lat - start.lat) * k, lng: start.lng + (lng - start.lng) * k };
      from.current = point;
      setShown(point);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [lat, lng, ms]);

  if (!target) return null;
  // Before the first frame (or right after a null), show the target itself.
  return shown ?? target;
}
