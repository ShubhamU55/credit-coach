import { defineConfig } from 'vitest/config';

// Pure-TypeScript unit tests only (the demo repository). Component tests arrive with
// the kit's Jest harness (PD-3). The `.spec.ts` suffix keeps these out of Jest's
// `*.test.ts(x)` match once both runners exist.

// Vite's oxc transform cannot resolve `extends: "expo/tsconfig.base"` (no .json
// extension), and the specs need no tsconfig options, so turn the lookup off. The
// option works at runtime but is missing from Vite's OxcOptions typings, hence the cast.
const oxcWithoutTsconfig = { tsconfig: false } as unknown as undefined;

export default defineConfig({
  oxc: oxcWithoutTsconfig,
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
