import { describe, expect, it } from 'vitest';
import { safeMaskedMobile, safeMaskedPan } from './masked';

describe('safeMaskedPan', () => {
  it('passes the masked shape through', () => {
    expect(safeMaskedPan('ABXXXXX34F')).toBe('ABXXXXX34F');
  });

  it.each(['ABCDE1234F', 'abxxxxx34f', 'ABXXXXX3', '', null, undefined, 42])(
    'never renders %j',
    (bad) => {
      expect(safeMaskedPan(bad)).toBe('(hidden: not masked)');
    },
  );

  it('never echoes a full PAN even inside a longer string', () => {
    expect(safeMaskedPan('xABCDE1234F')).not.toContain('ABCDE1234F');
  });
});

describe('safeMaskedMobile', () => {
  it('passes the masked shape through', () => {
    expect(safeMaskedMobile('+91 98XXXXX321')).toBe('+91 98XXXXX321');
  });

  it.each(['+91 9876543210', '9876543210', '+91 98XXXXX32', '', null, undefined])(
    'never renders %j',
    (bad) => {
      expect(safeMaskedMobile(bad)).toBe('(hidden: not masked)');
    },
  );
});
