#!/usr/bin/env node
/*
 * Wrapper around `pbiviz package --all-locales`.
 *
 * `powerbi-visuals-tools` 7.2.x with webpack 5.10x intermittently crashes in a
 * post-build logging hook ("No such label 'emitAssets' for WebpackLogger.timeEnd")
 * AFTER the .pbiviz has already been written and "Build completed successfully"
 * has printed. It is a webpack `needAdditionalPass` + logger-timer race, not a
 * fault in this visual. This wrapper treats the run as successful only when the
 * build reported success AND a fresh package landed in dist/; any other outcome
 * propagates as a non-zero exit.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
const startedAt = Date.now();

function freshPackages() {
  if (!existsSync(DIST)) return [];
  return readdirSync(DIST)
    .filter((f) => f.endsWith(".pbiviz"))
    .filter((f) => statSync(join(DIST, f)).mtimeMs >= startedAt - 1000);
}

const args = ["pbiviz", "package", "--all-locales", ...process.argv.slice(2)];
const res = spawnSync("npx", args, { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8" });

const out = res.stdout || "";
process.stdout.write(out);

const built = /Build completed successfully/.test(out);
const packages = freshPackages();

if (res.status === 0 && packages.length) {
  process.exit(0);
}

if (built && packages.length) {
  console.warn(
    `\n[package.mjs] pbiviz exited ${res.status ?? res.signal} after a successful build ` +
      `(known webpack post-build logging crash). Produced: ${packages.join(", ")}. Treating as success.`
  );
  process.exit(0);
}

console.error(`\n[package.mjs] pbiviz package failed (exit ${res.status ?? res.signal}, no fresh dist/*.pbiviz).`);
process.exit(res.status || 1);
