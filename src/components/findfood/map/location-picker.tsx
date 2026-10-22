import { randomUUID } from "expo-crypto";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import type MapView from "react-native-maps";
import type { Details, Region } from "react-native-maps";

import { ApiError } from "@/api/errors";
import type { Coordenada } from "@/api/types";
import { colors } from "@/design/tokens";
import type { PickupPointSource } from "@/domain/donation-draft";
import {
  formatGeocodedAddress,
  fromLatLng,
  regionForPoints,
  toLatLng,
  type LatLng,
} from "@/domain/mappers/geo";
import {
  geocodeAddress,
  geocodeWithApi,
  reverseGeocodeWithApi,
  type GeocodedPoint,
} from "@/location/geocode";
import { usePermissionGate, type PermissionGate } from "@/platform/permissions";
import {
  autocompletarDireccion,
  GEO_NO_DISPONIBLE,
  getLugar,
  type SugerenciaDto,
} from "@/services/geo";

import { Icon } from "../icon";
import { PermissionNotice } from "../permission-notice";
import { Button, Card, Copy, Stack } from "../ui";
import { FindFoodMap } from "./find-food-map";
import { Circle } from "./maps";

const PIN_SIZE = 40;
/** Pause in typing before asking for suggestions. */
export const AUTOCOMPLETE_DELAY_MS = 300;
/** Pause after the last map move before suggesting its address: each lookup is billed. */
export const REVERSE_GEOCODE_DELAY_MS = 800;
const MAX_SUGGESTIONS = 5;
const NOT_FOUND =
  "No pudimos ubicar esa dirección. Revísala, usa tu ubicación o mueve el mapa hasta tu punto de recogida.";
export const APPROXIMATE_NOTICE =
  "Ubicamos la zona, no la puerta exacta. Mueve el mapa hasta el punto de recogida.";

/**
 * Center-pin picker: the donor moves the map under a fixed pin. The region lives in a ref
 * (no render per frame) and the point is emitted once a move ends. "Usar mi ubicación"
 * centers the map on the device's position. The emitted point is always the pin: a lookup
 * only moves the map, and an approximate one asks to adjust it, since that point decides
 * which volunteers the hard filters keep.
 *
 * `onAddressSuggestion` reverse-geocodes the chosen point; pass it only while the address
 * field is empty, and apply it without overwriting typed text (`suggestDireccion`).
 *
 * With `address`, "Ubicar dirección" locates that text: Google through the API first, the
 * phone geocoder when the API cannot search (not on web, which has none). A failed lookup
 * only explains itself: it never emits a guessed point. `onChange` says where each point
 * came from. With `onAddressChosen` too, typing the address lists Google suggestions;
 * picking one sets the address (first) and the point (then), so the point stays tied to it.
 *
 * `coverageKm` draws the volunteer's coverage radius around the point.
 */
export function LocationPicker({
  value,
  onChange,
  onAddressSuggestion,
  address,
  onAddressChosen,
  coverageKm,
  height = 260,
}: {
  value: Coordenada | null;
  onChange: (point: Coordenada, source: PickupPointSource) => void;
  onAddressSuggestion?: (address: string) => void;
  /** The typed address "Ubicar dirección" locates; the button is hidden without it. */
  address?: string;
  /** Receives the address of a picked suggestion; suggestions are hidden without it. */
  onAddressChosen?: (address: string) => void;
  coverageKm?: number;
  height?: number;
}) {
  const mapRef = useRef<MapView>(null);
  // Read once: later moves update the ref, never the map's props.
  const [initialRegion] = useState(() => regionForPoints(value ? [toLatLng(value)] : []));
  const regionRef = useRef<Region>(initialRegion);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { gate, request } = usePermissionGate(Location.useForegroundPermissions);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [found, setFound] = useState<{ query: string; items: SugerenciaDto[] }>({
    query: "",
    items: [],
  });
  const [chosen, setChosen] = useState<string | null>(null);
  // Off for the rest of the visit once the API says it cannot search.
  const [autocomplete, setAutocomplete] = useState(true);

  const canGeocode = address !== undefined && Platform.OS !== "web";
  const query = address?.trim() ?? "";
  const searchable = canGeocode && onAddressChosen !== undefined && autocomplete;

  useEffect(() => {
    if (!searchable || query.length < 3 || query === chosen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      sessionRef.current ??= randomUUID();
      try {
        const answer = await autocompletarDireccion(
          query,
          sessionRef.current,
          null,
          controller.signal,
        );
        setFound({ query, items: answer?.sugerencias?.slice(0, MAX_SUGGESTIONS) ?? [] });
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.type === GEO_NO_DISPONIBLE) {
          setAutocomplete(false);
        }
      }
    }, AUTOCOMPLETE_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchable, query, chosen]);

  useEffect(
    () => () => {
      if (suggestTimer.current) clearTimeout(suggestTimer.current);
    },
    [],
  );

  const suggestions = searchable && found.query === query && query !== chosen ? found.items : [];

  const suggestAddress = async (point: LatLng, permission: PermissionGate) => {
    if (!onAddressSuggestion) return;
    try {
      const fromApi = await reverseGeocodeWithApi(fromLatLng(point));
      if (fromApi !== undefined) {
        if (fromApi) onAddressSuggestion(fromApi);
        return;
      }
      // Android geocodes on the phone only with the location permission.
      if (permission !== "granted") return;
      const [geocoded] = await Location.reverseGeocodeAsync(point);
      const text = formatGeocodedAddress(geocoded);
      if (text) onAddressSuggestion(text);
    } catch {
      // A suggestion is optional: the donor types the address.
    }
  };

  const moveTo = (point: Coordenada) => {
    const region = { ...regionRef.current, ...toLatLng(point) };
    regionRef.current = region;
    mapRef.current?.animateToRegion(region, 400);
  };

  const onRegionChangeComplete = (region: Region, details?: Details) => {
    regionRef.current = region;
    // Google Maps reports the initial layout and our own animations as non-gestures; the
    // donor only chose a point when they moved the map (or used their location below).
    if (details?.isGesture === false) return;
    onChange(fromLatLng(region), "map");
    setNotice(null);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (onAddressSuggestion) {
      suggestTimer.current = setTimeout(
        () => void suggestAddress(region, gate),
        REVERSE_GEOCODE_DELAY_MS,
      );
    }
  };

  const locateMe = async () => {
    setError(null);
    setNotice(null);
    const current = gate === "granted" ? gate : await request();
    if (current !== "granted") return;
    setLocating(true);
    try {
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const point = { latitude: coords.latitude, longitude: coords.longitude };
      moveTo(fromLatLng(point));
      onChange(fromLatLng(point), "device");
      await suggestAddress(point, current);
    } catch {
      setError("No pudimos obtener tu ubicación. Mueve el mapa hasta tu punto de recogida.");
    } finally {
      setLocating(false);
    }
  };

  const locateAddress = async () => {
    setError(null);
    setNotice(null);
    if (!query) {
      setError("Escribe la dirección de recogida para ubicarla.");
      return;
    }
    setGeocoding(true);
    try {
      let located: GeocodedPoint | null | undefined = await geocodeWithApi(query);
      if (located === undefined) {
        // The phone geocoder answers instead; on Android it needs the location permission.
        if (Platform.OS === "android" && gate !== "granted" && (await request()) !== "granted") {
          setError("Permite el acceso a tu ubicación para ubicar la dirección, o mueve el mapa.");
          return;
        }
        const point = await geocodeAddress(query);
        located = point ? { point, approximate: false } : null;
      }
      if (!located) {
        setError(NOT_FOUND);
        return;
      }
      moveTo(located.point);
      onChange(located.point, "address");
      if (located.approximate) setNotice(APPROXIMATE_NOTICE);
    } finally {
      setGeocoding(false);
    }
  };

  const choose = async (suggestion: SugerenciaDto) => {
    setError(null);
    setNotice(null);
    // Picking closes the billing session; the next search starts another one.
    const sesion = sessionRef.current ?? randomUUID();
    sessionRef.current = null;
    setGeocoding(true);
    try {
      const lugar = await getLugar(suggestion.place_id, sesion);
      setChosen(lugar.direccion.trim());
      // The address first: a point located from another text would be dropped.
      onAddressChosen?.(lugar.direccion);
      moveTo(lugar.ubicacion);
      onChange(lugar.ubicacion, "address");
    } catch {
      setError(NOT_FOUND);
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <Stack gap={12}>
      {suggestions.length ? (
        <Card style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable
              key={s.place_id}
              accessibilityRole="button"
              accessibilityLabel={[s.principal, s.secundario].filter(Boolean).join(", ")}
              onPress={() => void choose(s)}
              style={styles.suggestion}
            >
              <Icon name="pin" size={18} />
              <View style={{ flex: 1 }}>
                <Copy>{s.principal}</Copy>
                {s.secundario ? <Copy tone="secondary">{s.secundario}</Copy> : null}
              </View>
            </Pressable>
          ))}
        </Card>
      ) : null}
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
        >
          {value && coverageKm && coverageKm > 0 ? (
            <Circle
              testID="location-picker-coverage"
              center={toLatLng(value)}
              radius={coverageKm * 1000}
              strokeColor={colors.primary}
              fillColor="rgba(31, 122, 90, 0.12)"
            />
          ) : null}
        </FindFoodMap>
        <View style={styles.pinLayer} pointerEvents="none">
          <View style={styles.pin}>
            <Icon name="pin" size={PIN_SIZE} />
          </View>
        </View>
      </View>
      {notice ? <Copy tone="secondary">{notice}</Copy> : null}
      {canGeocode ? (
        <Button variant="outline" icon="search" loading={geocoding} onPress={locateAddress}>
          Ubicar dirección
        </Button>
      ) : null}
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
  suggestions: { paddingVertical: 4, gap: 0 },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
});
