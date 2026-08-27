/**
 * Test-only stub for `powerbi-visuals-api`.
 *
 * The real package is type-only: everything src/ uses from it is either a type
 * (erased at compile time) or a `const enum` (inlined by tsc during the pbiviz
 * build). Under vitest/esbuild the const enums are not inlined, so the property
 * access `powerbi.visuals.ValidatorType.Min` would hit `undefined`. This stub
 * supplies the runtime enum values that src/settings.ts and src/visual.ts read.
 */

export const version = "5.11.0";

export const VisualEnumerationInstanceKinds = {
  Constant: 1,
  Rule: 2,
  ConstantOrRule: 3,
} as const;

const api: any = {
  version,
  VisualEnumerationInstanceKinds,
  visuals: {
    ValidatorType: { Min: 0, Max: 1, Required: 2 },
  },
};

export default api;
