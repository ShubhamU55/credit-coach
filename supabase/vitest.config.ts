import { defineConfig } from 'vitest/config';

export default defineConfig({
  // response-shape.test.ts imports the app's client.ts, whose tsconfig extends Expo's (not installed
  // for this workspace). Transforming it needs no tsconfig: plain type stripping is enough.
  oxc: { tsconfig: false },
  test: {
    include: ['tests/functions/**/*.test.ts'],
  },
});
