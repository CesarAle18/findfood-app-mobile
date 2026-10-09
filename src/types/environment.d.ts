/// <reference types="expo/types" />

// Public build-time variables read by src/config/env.ts (see .env.example). They stay
// plain strings because env.ts validates them at runtime. `__DEV__` is declared by
// react-native and `process` by expo/types.
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_APP_ENV?: string;
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?: string;
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?: string;
    /** Development-only; generated into .env.development.local by `npm run start:local`. */
    EXPO_PUBLIC_DEV_TOKEN?: string;
  }
}
