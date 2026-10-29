import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// The app copy is not imported here (its folder has the Expo tsconfig, which Vite cannot resolve).
// Byte identity makes every behavioural test in grounding.test.ts apply to the app as well; the
// app's own Jest suite (apps/mobile/src/explain/client.test.ts) exercises it through the client.
describe('grounding.ts exists twice: the Edge Function and the app', () => {
  it('is byte-identical in both places', () => {
    const server = read('../../../functions/explain/grounding.ts');
    const app = read('../../../../apps/mobile/src/explain/grounding.ts');

    expect(server.length).toBeGreaterThan(1000);
    expect(app).toBe(server);
  });

  it('has no imports, so a copy needs no path rewriting', () => {
    expect(read('../../../functions/explain/grounding.ts')).not.toMatch(/^import /m);
  });
});
