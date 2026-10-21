import { describe, it, expect } from 'vitest';
import { parseScratchHeader, isExpired } from './scratch.mjs';

const FRONT_MATTER = `---
purpose: throwaway debug script
owner: W0-5
created: 2026-10-21
expires: 2026-10-28
keep-if: never
---
console.log('scratch');
`;

const COMMENT_BLOCK = `// purpose: throwaway debug script
// owner: W0-5
// created: 2026-10-21
// expires: 2026-10-28
// keep-if: never
console.log('scratch');
`;

const EXPECTED_HEADER = {
  purpose: 'throwaway debug script',
  owner: 'W0-5',
  created: '2026-10-21',
  expires: '2026-10-28',
  keepIf: 'never',
};

describe('parseScratchHeader', () => {
  it('parses a front-matter header', () => {
    expect(parseScratchHeader(FRONT_MATTER)).toEqual(EXPECTED_HEADER);
  });

  it('parses a // comment-block header', () => {
    expect(parseScratchHeader(COMMENT_BLOCK)).toEqual(EXPECTED_HEADER);
  });

  it('returns null when expires is missing', () => {
    const noExpiry = '// purpose: throwaway debug script\n// owner: W0-5\n// created: 2026-10-21\n';
    expect(parseScratchHeader(noExpiry)).toBeNull();
  });

  it('defaults keepIf to null when keep-if is omitted', () => {
    const noKeepIf =
      '// purpose: throwaway debug script\n// owner: W0-5\n// created: 2026-10-21\n// expires: 2026-10-28\n';
    const header = parseScratchHeader(noKeepIf);
    expect(header).not.toBeNull();
    expect(header.keepIf).toBeNull();
  });

  it('returns null when there is no header at all', () => {
    expect(parseScratchHeader("console.log('no header');\n")).toBeNull();
  });

  it('parses quoted created/expires dates, stripping the surrounding quotes', () => {
    const quoted =
      '// purpose: throwaway debug script\n// owner: W0-5\n// created: "2026-10-21"\n// expires: \'2026-10-28\'\n';
    const header = parseScratchHeader(quoted);
    expect(header).not.toBeNull();
    expect(header.created).toBe('2026-10-21');
    expect(header.expires).toBe('2026-10-28');
  });

  it('returns null when expires is not a valid YYYY-MM-DD date', () => {
    const invalid =
      '// purpose: throwaway debug script\n// owner: W0-5\n// created: 2026-10-21\n// expires: next week\n';
    expect(parseScratchHeader(invalid)).toBeNull();
  });

  it('returns null when created is not a valid YYYY-MM-DD date', () => {
    const invalid =
      '// purpose: throwaway debug script\n// owner: W0-5\n// created: last Tuesday\n// expires: 2026-10-28\n';
    expect(parseScratchHeader(invalid)).toBeNull();
  });
});

describe('isExpired', () => {
  it('is true the day after expiry', () => {
    expect(isExpired({ expires: '2026-10-28' }, '2026-10-29')).toBe(true);
  });

  it('is false on expiry day itself', () => {
    expect(isExpired({ expires: '2026-10-28' }, '2026-10-28')).toBe(false);
  });

  it('never expires when there is no expires field', () => {
    expect(isExpired({ expires: null }, '2099-01-01')).toBe(false);
  });
});
