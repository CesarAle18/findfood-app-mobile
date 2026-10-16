import * as Location from "expo-location";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import type MapView from "react-native-maps";
import type { Details, Region } from "react-native-maps";

import type { Coordenada } from "@/api/types";
import {
  formatGeocodedAddress,
  fromLatLng,
  regionForPoints,
  toLatLng,
  type LatLng,
} from "@/domain/mappers/geo";
import { usePermissionGate, type PermissionGate } from "@/platform/permissions";

import { Icon } from "../icon";
import { PermissionNotice } from "../permission-notice";
import { Button, Copy, Stack } from "../ui";
import { FindFoodMap } from "./find-food-map";

const PIN_SIZE = 40;

/**
 * Center-pin picker: the donor moves the map under a fixed pin. The region lives in a ref
 * (no render per frame) and the point is emitted once a move ends. "Usar mi ubicación"
 * centers the map on the device's position.
 *
 * `onAddressSuggestion` reverse-geocodes the chosen point; pass it only while the address
 * field is empty, and apply it without overwriting typed text (`suggestDireccion`).
 */
export function LocationPicker({
  value,
  onChange,
  onAddressSuggestion,
  height = 260,
}: {
  value: Coordenada | null;
  onChange: (point: Coordenada) => void;
  onAddressSuggestion?: (address: string) => void;
  height?: number;
}) {
  const mapRef = useRef<MapView>(null);
  // Read once: later moves update the ref, never the map's props.
  const [initialRegion] = useState(() => regionForPoints(value ? [toLatLng(value)] : []));
  const regionRef = useRef<Region>(initialRegion);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { gate, request } = usePermissionGate(Location.useForegroundPermissions);

  const suggestAddress = async (point: LatLng, permission: PermissionGate) => {
    // Android geocodes only with the location permission; skip when nobody listens.
    if (!onAddressSuggestion || permission !== "granted") return;
    try {
      const [address] = await Location.reverseGeocodeAsync(point);
      const text = formatGeocodedAddress(address);
      if (text) onAddressSuggestion(text);
    } catch {
      // A suggestion is optional: the donor types the address.
    }
  };

  const onRegionChangeComplete = (region: Region, details?: Details) => {
    regionRef.current = region;
    // Google Maps reports the initial layout and our own animations as non-gestures; the
    // donor only chose a point when they moved the map (or used their location below).
    if (details?.isGesture === false) return;
    onChange(fromLatLng(region));
    void suggestAddress(region, gate);
  };

  const locateMe = async () => {
    setError(null);
    const current = gate === "granted" ? gate : await request();
    if (current !== "granted") return;
    setLocating(true);
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = { latitude: coords.latitude, longitude: coords.longitude };
      const region = { ...regionRef.current, ...point };
      regionRef.current = region;
      mapRef.current?.animateToRegion(region, 400);
      onChange(fromLatLng(point));
      await suggestAddress(point, current);
    } catch {
      setError("No pudimos obtener tu ubicación. Mueve el mapa hasta tu punto de recogida.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <Stack gap={12}>
      <View>
        <FindFoodMap
          ref={mapRef}
          testID="location-picker-map"
          height={height}
          initialRegion={initialRegion}
          onRegionChangeComplete={onRegionChangeComplete}
          showsUserLocation={gate === "granted"}
          showsMyLocationButton={false}
          accessibilityLabel="Mapa para elegir el punto de recogida"
        />
        <View style={styles.pinLayer} pointerEvents="none">
          <View style={styles.pin}>
            <Icon name="pin" size={PIN_SIZE} />
          </View>
        </View>
      </View>
      <Button variant="outline" icon="pin" loading={locating} onPress={locateMe}>
        Usar mi ubicación
      </Button>
      {error ? <Copy tone="secondary">{error}</Copy> : null}
      {gate === "blocked" ? (
        <PermissionNotice
          title="Permite el acceso a tu ubicación"
          body="Así centramos el mapa en tu punto de recogida. También puedes mover el mapa a mano."
          gate={gate}
          onRequest={() => void request()}
        />
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  pinLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  // The pin's tip, not its middle, marks the center.
  pin: { transform: [{ translateY: -PIN_SIZE / 2 }] },
});
