// Default public configuration for tests. `@/config/env` validates these variables at
// import time; without them `configResult` is a ConfigError and `env` an inert stand-in,
// so modules that read `env` would not reach the test servers. Values that are already
// set are kept, and tests that need a specific configuration (see src/config/env.test.ts)
// set their own.
const TEST_ENV = {
  EXPO_PUBLIC_APP_ENV: "real",
  EXPO_PUBLIC_API_URL: "http://api.test",
  EXPO_PUBLIC_SUPABASE_URL: "http://supabase.test",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
};

for (const [name, value] of Object.entries(TEST_ENV)) {
  if (process.env[name] === undefined) process.env[name] = value;
}

// Reanimated needs react-native-worklets, whose native module does not exist under Jest.
// Worklets ships a JS double for this; Reanimated itself stays real and runs its own Jest
// mode (animations jump to their final values, layout animations are skipped).
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));

// Google Sign-In's native module does not exist under Jest. Its own setup replaces only the
// native module (the JS API, status codes and response helpers stay real); it is loaded by
// path, as the library documents, because the package's `exports` do not expose it.
require("./node_modules/@react-native-google-signin/google-signin/jest/build/jest/setup.js");

// FlashList lays items out from native measurements, which do not exist under Jest. Its own
// `@shopify/flash-list/jestSetup` (2.0.2) also remaps `FlashList` to an export that no longer
// exists, so only the measurements are replaced here: a 400x900 viewport, 100 pt items.
jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => ({
  ...jest.requireActual("@shopify/flash-list/dist/recyclerview/utils/measureLayout"),
  measureParentSize: () => ({ x: 0, y: 0, width: 400, height: 900 }),
  measureFirstChildLayout: () => ({ x: 0, y: 0, width: 400, height: 900 }),
  measureItemLayout: () => ({ x: 0, y: 0, width: 100, height: 100 }),
}));

// Phase 3 native modules. jest-expo already resolves the Expo modules' native halves (most
// calls resolve to `undefined`), so only what tests rely on is replaced here. Tests that need
// another answer override these with `jest.mocked(...).mockResolvedValue(...)`. Helpers are
// prefixed with `mock` so babel-plugin-jest-hoist lets the hoisted factories use them.
const mockUndeterminedPermission = {
  status: "undetermined",
  granted: false,
  canAskAgain: true,
  expires: "never",
};

/** An Expo permission hook double: `[response, request, get]`, all resolving the same answer. */
const mockPermissionHook = () =>
  jest.fn(() => [
    mockUndeterminedPermission,
    jest.fn(async () => mockUndeterminedPermission),
    jest.fn(async () => mockUndeterminedPermission),
  ]);

jest.mock("expo-crypto", () => ({
  ...jest.requireActual("expo-crypto"),
  // Node's Web Crypto: real, unique v4 UUIDs.
  randomUUID: jest.fn(() => globalThis.crypto.randomUUID()),
}));

// jest-expo reports the Expo Go environment, so importing expo-notifications would warn
// that remote push is missing from Expo Go. The app runs in a development build.
jest.mock("expo-notifications/build/warnOfExpoGoPushUsage", () => ({
  warnOfExpoGoPushUsage: () => undefined,
}));

jest.mock("expo-notifications", () => ({
  ...jest.requireActual("expo-notifications"),
  getPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  requestPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: "expo", data: "ExponentPushToken[test]" })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponseAsync: jest.fn(async () => undefined),
  setNotificationChannelAsync: jest.fn(async () => null),
  // The native emitters do not exist under Jest: each listener is a removable no-op.
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("expo-location", () => ({
  ...jest.requireActual("expo-location"),
  getForegroundPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  requestForegroundPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  getBackgroundPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  requestBackgroundPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  useForegroundPermissions: mockPermissionHook(),
  useBackgroundPermissions: mockPermissionHook(),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: {
      latitude: 4.65,
      longitude: -74.06,
      altitude: null,
      accuracy: 20,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 0,
  })),
  reverseGeocodeAsync: jest.fn(async () => []),
}));

jest.mock("expo-task-manager", () => ({
  ...jest.requireActual("expo-task-manager"),
  isTaskRegisteredAsync: jest.fn(async () => false),
  // No native task registry under Jest: defining a task only records the call.
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
}));

jest.mock("expo-image-picker", () => ({
  ...jest.requireActual("expo-image-picker"),
  getCameraPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  requestCameraPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  getMediaLibraryPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => mockUndeterminedPermission),
  useCameraPermissions: mockPermissionHook(),
  useMediaLibraryPermissions: mockPermissionHook(),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

// react-native-maps looks up its TurboModule on import, which does not exist under Jest. Every
// map component renders as a plain View that keeps its props; MapView also exposes the
// imperative methods screens call through a ref.
jest.mock("react-native-maps", () => {
  const { createElement, useImperativeHandle } = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const component = (name: string) => {
    const Mock = (props: object) => createElement(View, props);
    Mock.displayName = name;
    return Mock;
  };
  const MapView = ({ ref, ...props }: { ref?: unknown }) => {
    useImperativeHandle(ref as never, () => ({
      animateToRegion: jest.fn(),
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn(),
    }));
    return createElement(View, props);
  };
  MapView.displayName = "MapView";
  const Marker = component("Marker");
  const Polyline = component("Polyline");
  const Polygon = component("Polygon");
  const Circle = component("Circle");
  const Callout = component("Callout");
  return {
    __esModule: true,
    default: MapView,
    MapView,
    Marker,
    MapMarker: Marker,
    Polyline,
    MapPolyline: Polyline,
    Polygon,
    MapPolygon: Polygon,
    Circle,
    MapCircle: Circle,
    Callout,
    MapCallout: Callout,
    PROVIDER_GOOGLE: "google",
    PROVIDER_DEFAULT: undefined,
  };
});
