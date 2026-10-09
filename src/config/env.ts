/**
 * Build-time configuration for the app.
 *
 * Profiles (EXPO_PUBLIC_APP_ENV):
 * - `real` (default): real API + Supabase, configured in `.env.local`.
 * - `local`: findfood-api on the developer machine with a dev token, generated into
 *   `.env.development.local` by `npm run start:local`. Development builds only.
 */

export type AppEnv = "local" | "real";

/** Raw values as they come from `process.env` (unset or unvalidated). */
export interface RawEnv {
  appEnv?: string;
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
  devToken?: string;
}

export interface Env {
  appEnv: AppEnv;
  /** findfood-api base URL without trailing slash (the client appends `/v1`). */
  apiUrl: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
  /** Only in development with the `local` profile. */
  devToken?: string;
}

const SETUP_HINT =
  "Copy .env.example to .env.local for the real profile, or run `npm run start:local` " +
  "for the local API profile (`npm run start:real` switches back).";

/** Lists every missing or invalid variable at once. */
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      [
        "Invalid app configuration:",
        ...problems.map((problem) => `  - ${problem}`),
        SETUP_HINT,
      ].join("\n"),
    );
    this.name = "ConfigError";
    this.problems = problems;
  }
}

// Validated with a pattern instead of `new URL()`: the React Native URL implementation
// does not support every getter. Query strings and fragments are rejected because the
// value is used as a base URL.
const HTTP_URL = /^https?:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/i;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readUrl(
  value: string | undefined,
  name: string,
  problems: string[],
): string | undefined {
  if (value === undefined) return undefined;
  if (!HTTP_URL.test(value)) {
    problems.push(
      `${name} must be an http(s) URL without query or fragment (got "${value}").`,
    );
    return undefined;
  }
  return value.replace(/\/+$/, "");
}

export function readEnv(raw: RawEnv, isDev: boolean): Env {
  const problems: string[] = [];

  const rawAppEnv = clean(raw.appEnv) ?? "real";
  const appEnv =
    rawAppEnv === "local" || rawAppEnv === "real" ? rawAppEnv : undefined;
  if (!appEnv) {
    problems.push(
      `EXPO_PUBLIC_APP_ENV must be "local" or "real" (got "${rawAppEnv}").`,
    );
  }

  const rawApiUrl = clean(raw.apiUrl);
  if (rawApiUrl === undefined) problems.push("EXPO_PUBLIC_API_URL is missing.");
  const apiUrl = readUrl(rawApiUrl, "EXPO_PUBLIC_API_URL", problems);

  const rawSupabaseUrl = clean(raw.supabaseUrl);
  const supabaseUrl = readUrl(rawSupabaseUrl, "EXPO_PUBLIC_SUPABASE_URL", problems);
  const supabaseAnonKey = clean(raw.supabaseAnonKey);
  const devToken = clean(raw.devToken);

  if (appEnv === "real") {
    if (rawSupabaseUrl === undefined) {
      problems.push("EXPO_PUBLIC_SUPABASE_URL is missing (required by the real profile).");
    }
    if (supabaseAnonKey === undefined) {
      problems.push(
        "EXPO_PUBLIC_SUPABASE_ANON_KEY is missing (required by the real profile).",
      );
    }
  }

  if (appEnv === "local") {
    if (!isDev) {
      problems.push(
        "EXPO_PUBLIC_APP_ENV=local is development-only; release builds must use the real profile.",
      );
    } else if (devToken === undefined) {
      problems.push(
        "EXPO_PUBLIC_DEV_TOKEN is missing (required by the local profile). " +
          "Run `npm run start:local` to generate .env.development.local.",
      );
    }
  }

  if (problems.length > 0 || !appEnv || !apiUrl) throw new ConfigError(problems);

  return {
    appEnv,
    apiUrl,
    supabaseUrl,
    supabaseAnonKey,
    googleWebClientId: clean(raw.googleWebClientId),
    googleIosClientId: clean(raw.googleIosClientId),
    // The real profile always authenticates through Supabase, never with a dev token.
    devToken: appEnv === "local" && isDev ? devToken : undefined,
  };
}

// Each variable needs literal `process.env.EXPO_PUBLIC_X` access: Expo only inlines
// that exact form (no destructuring, no bracket access).
const raw: RawEnv = {
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  // Keep this ternary literal: release builds inline `__DEV__` as false and the
  // minifier drops the token from the bundle.
  devToken: __DEV__ ? process.env.EXPO_PUBLIC_DEV_TOKEN : undefined,
};

export const env: Env = readEnv(raw, __DEV__);
