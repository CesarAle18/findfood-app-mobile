import { useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type MapView from "react-native-maps";
import { Marker, Polyline } from "react-native-maps";

import { colors, fonts } from "@/design/tokens";
import { lineStringToLatLngs, regionForPoints, toLatLng } from "@/domain/mappers/geo";
import type { GeometriaRutaDto, ParadaRutaDto } from "@/services/rutas";

import { FindFoodMap } from "./find-food-map";

export type RouteStop = Pick<ParadaRutaDto, "id" | "orden" | "direccion" | "lat" | "lng">;

const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * The planned path (`geometria`, GeoJSON `[lng, lat]`) and the numbered stops of a route.
 * Without geometry it shows the stops only. Fits everything once the map is ready.
 */
export function RouteMapView({
  geometria,
  paradas,
  height = 264,
}: {
  geometria: GeometriaRutaDto | null;
  paradas: readonly RouteStop[];
  height?: number;
}) {
  const mapRef = useRef<MapView>(null);
  const { path, stops, bounds } = useMemo(() => {
    const path = lineStringToLatLngs(geometria);
    const stops = [...paradas]
      .sort((a, b) => a.orden - b.orden)
      .map((parada) => ({
        id: parada.id,
        orden: parada.orden,
        direccion: parada.direccion,
        coordinate: toLatLng(parada),
      }));
    const bounds = [...path, ...stops.map((stop) => stop.coordinate)];
    return { path, stops, bounds };
  }, [geometria, paradas]);
  const initialRegion = useMemo(() => regionForPoints(bounds), [bounds]);

  const fit = () => {
    if (bounds.length < 2) return;
    mapRef.current?.fitToCoordinates(bounds, { edgePadding: EDGE_PADDING, animated: false });
  };

  return (
    <FindFoodMap
      ref={mapRef}
      testID="route-map"
      height={height}
      initialRegion={initialRegion}
      onMapReady={fit}
      accessibilityLabel={`Mapa de la ruta con ${stops.length} paradas`}
    >
      {path.length > 1 ? (
        <Polyline
          testID="route-path"
          coordinates={path}
          strokeColor={colors.primary}
          strokeWidth={5}
        />
      ) : null}
      {stops.map((stop) => (
        <Marker
          key={stop.id}
          coordinate={stop.coordinate}
          title={`${stop.orden}. ${stop.direccion}`}
          tracksViewChanges={false}
        >
          <View style={styles.stop}>
            <Text style={styles.stopLabel}>{stop.orden}</Text>
          </View>
        </Marker>
      ))}
    </FindFoodMap>
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
