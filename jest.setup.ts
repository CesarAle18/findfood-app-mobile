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

// FlashList lays items out from native measurements, which do not exist under Jest. Its own
// `@shopify/flash-list/jestSetup` (2.0.2) also remaps `FlashList` to an export that no longer
// exists, so only the measurements are replaced here: a 400x900 viewport, 100 pt items.
jest.mock("@shopify/flash-list/dist/recyclerview/utils/measureLayout", () => ({
  ...jest.requireActual("@shopify/flash-list/dist/recyclerview/utils/measureLayout"),
  measureParentSize: () => ({ x: 0, y: 0, width: 400, height: 900 }),
  measureFirstChildLayout: () => ({ x: 0, y: 0, width: 400, height: 900 }),
  measureItemLayout: () => ({ x: 0, y: 0, width: 100, height: 100 }),
}));
