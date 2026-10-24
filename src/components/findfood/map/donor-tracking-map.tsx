import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type MapView from "react-native-maps";

import type { Coordenada } from "@/api/types";
import { colors } from "@/design/tokens";
import { lineStringToLatLngs, regionForPoints, toLatLng } from "@/domain/mappers/geo";
import type { GeometriaRutaDto } from "@/services/rutas";

import { FindFoodMap } from "./find-food-map";
import { Marker, Polyline } from "./maps";

/** The volunteer's position as the marker draws it; `rumbo` in degrees from north. */
export type VolunteerMarker = Coordenada & { rumbo: number | null };

const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
/** The volunteer and their leg, in the blue of the route screen's next leg. */
const LIVE_COLOR = "#1F5FBF";
const CENTER = { x: 0.5, y: 0.5 };

/**
 * The donor's live map (`GET /donaciones/:id/seguimiento`): their pickup point, the bank, the
 * volunteer's marker turned to its heading and the leg the volunteer drives now. Never the
 * route's stops: those are other donors' addresses (so never `RouteMapView` here).
 *
 * Frames what it knows once, when the map is ready; later positions move the marker and
 * leave the donor's view where they put it.
 */
export function DonorTrackingMap({
  recogida,
  banco,
  voluntario,
  tramo,
  height = 240,
}: {
  recogida: Coordenada;
  banco: (Coordenada & { nombre: string }) | null;
  voluntario: VolunteerMarker | null;
  tramo: GeometriaRutaDto | null;
  height?: number;
}) {
  const mapRef = useRef<MapView>(null);
  const pickup = useMemo(() => toLatLng(recogida), [recogida]);
  const bank = useMemo(() => (banco ? toLatLng(banco) : null), [banco]);
  const leg = useMemo(() => lineStringToLatLngs(tramo), [tramo]);
  const vehicle = voluntario ? toLatLng(voluntario) : null;
  const points = [pickup, ...(bank ? [bank] : []), ...(vehicle ? [vehicle] : []), ...leg];
  // Read on mount only: a later region would be ignored by the map anyway.
  const [initialRegion] = useState(() => regionForPoints(points));

  const fit = () => {
    if (points.length < 2) return;
    mapRef.current?.fitToCoordinates(points, { edgePadding: EDGE_PADDING, animated: false });
  };

  return (
    <FindFoodMap
      ref={mapRef}
      testID="donor-map"
      height={height}
      initialRegion={initialRegion}
      onMapReady={fit}
      accessibilityLabel="Mapa con el recorrido del voluntario hacia tu donación"
    >
      {leg.length > 1 ? (
        <Polyline
          testID="donor-map-leg"
          coordinates={leg}
          strokeColor={LIVE_COLOR}
          strokeWidth={6}
        />
      ) : null}
      <Marker
        testID="donor-map-pickup"
        coordinate={pickup}
        title="Tu punto de recogida"
        pinColor={colors.primary}
      />
      {bank && banco ? (
        <Marker
          testID="donor-map-bank"
          coordinate={bank}
          title={banco.nombre}
          pinColor={colors.warning}
        />
      ) : null}
      {vehicle ? (
        <Marker
          testID="donor-map-volunteer"
          coordinate={vehicle}
          title="Voluntario"
          flat
          rotation={voluntario?.rumbo ?? 0}
          anchor={CENTER}
          tracksViewChanges={false}
          zIndex={2}
        >
          {/* Plain views: an SVG may not be drawn yet when the marker is snapshotted. */}
          <View style={styles.vehicle}>
            <View style={styles.heading} />
          </View>
        </Marker>
      ) : null}
    </FindFoodMap>
  );
}

const styles = StyleSheet.create({
  vehicle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: LIVE_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  // A triangle pointing north; the marker's rotation turns it to the heading.
  heading: {
    width: 0,
    height: 0,
    marginBottom: 3,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: colors.surface,
  },
});
