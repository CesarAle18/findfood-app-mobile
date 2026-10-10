// Default public configuration for tests. `@/config/env` validates these variables at
// import time and throws a ConfigError without them, which would break every module
// that imports it. Values that are already set are kept, and tests that need a specific
// configuration (see src/config/env.test.ts) set their own.
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
