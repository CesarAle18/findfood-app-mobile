/**
 * Guards the jest.setup.ts doubles for the phase 3 native modules: tests anywhere in the app
 * can import them and get deterministic answers.
 */
import { render, screen } from "@testing-library/react-native";
import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

import { toPermissionGate } from "./permissions";

describe("native module doubles", () => {
  it("creates distinct v4 UUIDs", () => {
    const first = randomUUID();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(randomUUID()).not.toBe(first);
  });

  it("answers permission checks as not asked yet", async () => {
    expect(toPermissionGate(await Notifications.getPermissionsAsync())).toBe("denied");
    expect(toPermissionGate(await Location.getForegroundPermissionsAsync())).toBe("denied");
    expect(toPermissionGate(await ImagePicker.getCameraPermissionsAsync())).toBe("denied");
  });

  it("reports no background work running", async () => {
    await expect(Location.hasStartedLocationUpdatesAsync("task")).resolves.toBe(false);
    await expect(TaskManager.isTaskRegisteredAsync("task")).resolves.toBe(false);
  });

  it("renders maps as plain views that keep their props", async () => {
    await render(
      <MapView testID="map" provider={PROVIDER_GOOGLE}>
        <Marker testID="marker" coordinate={{ latitude: 4.6, longitude: -74.08 }} />
      </MapView>,
    );

    expect(screen.getByTestId("map")).toHaveProp("provider", "google");
    expect(screen.getByTestId("marker")).toBeOnTheScreen();
  });
});
