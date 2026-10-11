#!/usr/bin/env node
// Proves that a release bundle never contains the development token.
//
// Exports the Android JS bundle (production mode, no Hermes bytecode so the output stays
// searchable) with a sentinel EXPO_PUBLIC_DEV_TOKEN in the environment, then fails if the
// sentinel appears anywhere in the output. A control variable must appear, so the check
// cannot pass just because nothing was inlined.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const SENTINEL = "DEVTOKEN_SENTINEL_RELEASE_CHECK";
const CONTROL = "release-check.invalid";

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const outDir = mkdtempSync(path.join(tmpdir(), "findfood-release-check-"));

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

try {
  const result = spawnSync(
    process.execPath,
    // --clear: EXPO_PUBLIC values are inlined at transform time and Metro caches transforms.
    [expoCli, "export", "--platform", "android", "--no-bytecode", "--clear", "--output-dir", outDir],
    {
      stdio: ["ignore", "inherit", "inherit"],
      env: {
        ...process.env,
        EXPO_PUBLIC_APP_ENV: "real",
        EXPO_PUBLIC_API_URL: `https://${CONTROL}`,
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
        EXPO_PUBLIC_DEV_TOKEN: SENTINEL,
      },
    },
  );
  if (result.status !== 0) {
    console.error("expo export failed; the release bundle could not be checked.");
    process.exit(result.status ?? 1);
  }

  const contents = filesUnder(outDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(file, "utf8"));

  if (!contents.some((text) => text.includes(CONTROL))) {
    console.error("Control variable not found in the bundle: the check is not meaningful.");
    process.exit(1);
  }
  if (contents.some((text) => text.includes(SENTINEL))) {
    console.error("FAIL: the release bundle contains EXPO_PUBLIC_DEV_TOKEN.");
    process.exit(1);
  }
  console.log("PASS: the release bundle does not contain EXPO_PUBLIC_DEV_TOKEN.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
