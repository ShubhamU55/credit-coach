import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MODEL_TIMEOUT_MS } from '../../../functions/explain/anthropic.ts';
import { AUTH_TIMEOUT_MS } from '../../../functions/explain/auth.ts';
import { MAX_TEXT_LENGTH } from '../../../functions/explain/handler.ts';
import {
  IP_LIMIT_PER_MINUTE,
  USER_LIMIT_PER_MINUTE,
} from '../../../functions/explain/ratelimit.ts';

// Read as text: the app client uses React Native globals, so it is not imported under Node.
const clientSource = readFileSync(
  new URL('../../../../apps/mobile/src/explain/client.ts', import.meta.url),
  'utf8',
);
const fromClient = (name: string): number => {
  const match = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(clientSource);
  if (!match?.[1]) throw new Error(`${name} not found in the app client`);
  return Number(match[1]);
};

describe('the server answers before the app gives up', () => {
  const clientTimeout = fromClient('EXPLAIN_TIMEOUT_MS');

  it('keeps the model call at least 750 ms inside the app timeout, so the template arrives in time', () => {
    expect(clientTimeout).toBe(5000);
    expect(MODEL_TIMEOUT_MS).toBeLessThanOrEqual(clientTimeout - 750);
  });

  it('keeps the user lookup plus the model call inside the app timeout with a margin', () => {
    expect(AUTH_TIMEOUT_MS + MODEL_TIMEOUT_MS).toBeLessThanOrEqual(clientTimeout - 250);
  });

  it('caps the text at the same length the app accepts', () => {
    expect(fromClient('MAX_TEXT_LENGTH')).toBe(MAX_TEXT_LENGTH);
  });
});

describe('rate limit numbers', () => {
  it('are positive, and the address limit is looser than the user limit', () => {
    expect(USER_LIMIT_PER_MINUTE).toBeGreaterThan(0);
    expect(IP_LIMIT_PER_MINUTE).toBeGreaterThan(USER_LIMIT_PER_MINUTE);
  });
});
