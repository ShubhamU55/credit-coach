import { describe, it, expect } from 'vitest';
import { isProtectedPath, isFormattable } from './paths.mjs';

describe('isProtectedPath', () => {
  it.each([
    '.env',
    'apps/admin/.env.local',
    'C:\\repo\\apps\\admin\\.env.local',
    'apps/mobile/.ENV',
    'supabase/.env.production',
  ])('blocks %s', (p) => expect(isProtectedPath(p)).toBe(true));
  it.each([
    '.env.example',
    'apps/mobile/.env.example',
    'C:\\repo\\.env.example',
    'src/environment.ts',
    'docs/env.md',
  ])('allows %s', (p) => expect(isProtectedPath(p)).toBe(false));
});

describe('isFormattable', () => {
  it('accepts code, json, md, yaml', () => {
    for (const p of ['a.ts', 'b.tsx', 'c.json', 'd.md', 'e.yaml', 'C:\\x\\f.mjs'])
      expect(isFormattable(p)).toBe(true);
  });
  it('rejects binaries and unknown types', () => {
    for (const p of ['a.png', 'b.apk', 'c', 'd.lock']) expect(isFormattable(p)).toBe(false);
  });
});
