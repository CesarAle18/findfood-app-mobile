import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type MapView from "react-native-maps";

import { colors, fonts } from "@/design/tokens";
import { lineStringToLatLngs, regionForPoints, toLatLng, type LatLng } from "@/domain/mappers/geo";
import type { GeometriaRutaDto, ParadaRutaDto } from "@/services/rutas";

import { FindFoodMap } from "./find-food-map";
import { Marker, Polyline } from "./maps";

export type RouteStop = Pick<ParadaRutaDto, "id" | "orden" | "direccion" | "lat" | "lng">;

const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
/** The leg from the volunteer to the next stop, over the planned (green) path. */
const NEXT_LEG_COLOR = "#1F5FBF";

/** The only `proveedor_ruteo` whose `geometria` follows the streets. */
const STREET_ROUTING = "GOOGLE";

/** A stop as the map draws it. */
type MapStop = Pick<RouteStop, "id" | "orden" | "direccion"> & { coordinate: LatLng };

/** How long a stop's number gets to draw, after it lays out, before its marker freezes. */
export const STOP_SNAPSHOT_SETTLE_MS = 300;

/**
 * The React key of a stop's marker: its number too, so a renumbered stop is a new marker
 * with a fresh bitmap (and, through `childListKey`, a fresh map).
 */
const markerKey = (stop: Pick<RouteStop, "id" | "orden">) => `${stop.id}-${stop.orden}`;

/**
 * Names the map's child list: which lines it draws, then its markers in order. The map is
 * keyed by it, so any change to that list mounts a fresh map. On Android, react-native-maps
 * 1.27 keeps its overlays in a list where a child mounted into a live map overwrites the
 * entry at its index instead of shifting the rest (`MapView.safeAddFeature`), while a
 * removal does shift. The map then loses overlays, and a tab switch (detach and reattach)
 * restores that broken list. A fresh map adds its children in order and stays consistent.
 * New coordinates for the same children (the leg refreshed every 30 s) keep the map.
 */
function childListKey(
  drawsPath: boolean,
  drawsLeg: boolean,
  stops: readonly Pick<RouteStop, "id" | "orden">[],
): string {
  return [drawsPath ? "path" : "-", drawsLeg ? "leg" : "-", ...stops.map(markerKey)].join("|");
}

/**
 * The planned path (`geometria`, GeoJSON `[lng, lat]`) and the numbered stops of a route.
 * The path is drawn only when Google traced it (`proveedorRuteo === "GOOGLE"`): anything
 * else is stop-to-stop straight lines, which read as a route cutting across blocks. Without
 * that path it shows the stops only. Fits what it draws once the map is ready.
 *
 * With `showsUserLocation` (location permission granted) the map shows the device's
 * position and Android's "my location" button; `tramo` draws the path from there to the
 * next stop (`GET /rutas/:id/seguimiento`): pass it only when it follows the streets.
 *
 * Its lines and markers never mount or unmount inside a live map: a change to them mounts a
 * new map (`childListKey`), which fits itself again once ready.
 */
export function RouteMapView({
  geometria,
  proveedorRuteo,
  paradas,
  tramo = null,
  showsUserLocation = false,
  height = 264,
}: {
  geometria: GeometriaRutaDto | null;
  /** `RutaDetalleDto.proveedor_ruteo`. */
  proveedorRuteo: string | null;
  paradas: readonly RouteStop[];
  tramo?: GeometriaRutaDto | null;
  showsUserLocation?: boolean;
  height?: number;
}) {
  const mapRef = useRef<MapView>(null);
  const { path, stops, bounds } = useMemo(() => {
    const path = proveedorRuteo === STREET_ROUTING ? lineStringToLatLngs(geometria) : [];
    const stops = [...paradas]
      .sort((a, b) => a.orden - b.orden)
      .map((parada): MapStop => ({
        id: parada.id,
        orden: parada.orden,
        direccion: parada.direccion,
        coordinate: toLatLng(parada),
      }));
    const bounds = [...path, ...stops.map((stop) => stop.coordinate)];
    return { path, stops, bounds };
  }, [geometria, proveedorRuteo, paradas]);
  const initialRegion = useMemo(() => regionForPoints(bounds), [bounds]);
  const leg = useMemo(() => lineStringToLatLngs(tramo), [tramo]);
  const drawsPath = path.length > 1;
  const drawsLeg = leg.length > 1;

  const fit = () => {
    if (bounds.length < 2) return;
    mapRef.current?.fitToCoordinates(bounds, { edgePadding: EDGE_PADDING, animated: false });
  };

  return (
    <FindFoodMap
      key={childListKey(drawsPath, drawsLeg, stops)}
      ref={mapRef}
      testID="route-map"
      height={height}
      initialRegion={initialRegion}
      onMapReady={fit}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={showsUserLocation}
      accessibilityLabel={`Mapa de la ruta con ${stops.length} paradas`}
    >
      {drawsPath ? (
        <Polyline
          testID="route-path"
          coordinates={path}
          strokeColor={colors.primary}
          strokeWidth={5}
        />
      ) : null}
      {drawsLeg ? (
        <Polyline
          testID="route-next-leg"
          coordinates={leg}
          strokeColor={NEXT_LEG_COLOR}
          strokeWidth={6}
          zIndex={1}
        />
      ) : null}
      {stops.map((stop) => (
        <StopMarker key={markerKey(stop)} stop={stop} />
      ))}
    </FindFoodMap>
  );
}

/**
 * A stop's numbered circle. Android draws a custom marker into a bitmap, first when the
 * marker is added, before its number has laid out, and then only when the marker's size
 * changes, which a fixed circle never does. So the marker tracks its view until the number
 * has laid out and had `STOP_SNAPSHOT_SETTLE_MS` to draw; turning tracking off takes one
 * last snapshot. A new number is a new marker (`markerKey`), never a redraw of this one.
 */
function StopMarker({ stop }: { stop: MapStop }) {
  const [laidOut, setLaidOut] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!laidOut) return;
    const timer = setTimeout(() => setSettled(true), STOP_SNAPSHOT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [laidOut]);
  return (
    <Marker
      testID={`route-stop-${stop.id}`}
      coordinate={stop.coordinate}
      title={`${stop.orden}. ${stop.direccion}`}
      tracksViewChanges={!settled}
    >
      <View style={styles.stop}>
        <Text style={styles.stopLabel} onLayout={() => setLaidOut(true)}>
          {stop.orden}
        </Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  stop: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stopLabel: { color: colors.surface, fontFamily: fonts.bold, fontSize: 12 },
});
