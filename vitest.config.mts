import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // powerbi-visuals-api ships only type declarations plus `const enum`s, which
      // tsc inlines in the real pbiviz build but are unresolvable at runtime.
      // The stub provides the handful of runtime enum values src/ touches.
      "powerbi-visuals-api": fileURLToPath(new URL("./test/stubs/powerbi-visuals-api.ts", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    css: false,
  },
});
