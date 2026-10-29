import { describe, expect, it } from 'vitest';
import { validatePayload } from '../../../functions/explain/payload.ts';
import { scenario } from './fixtures.ts';

type Loose = Record<string, unknown>;

function withCard(name: string, where: 'items' | 'shortfalls'): ReturnType<typeof validatePayload> {
  const p = structuredClone(scenario('aarav').payload) as unknown as Loose;
  const list = p[where] as Loose[];
  if (list.length === 0) {
    list.push({
      card: 'x',
      kind: 'minimum',
      required: 1,
      funded: 0,
      shortfall: 1,
      dueDate: '2026-10-22',
    });
  }
  list[0]!.card = name;
  return validatePayload(p);
}

describe('a card name shaped like a PAN is refused', () => {
  it.each(['ABCDE1234F', 'abcde1234f', 'ABCDE-1234-F', 'ABCDE 1234 F', 'My ABCDE1234F card'])(
    'rejects %s with a field path and never the value',
    (name) => {
      const result = withCard(name, 'items');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.path).toBe('items[0].card');
        expect(JSON.stringify(result)).not.toContain(name);
      }
    },
  );

  it('applies to shortfall cards too', () => {
    const result = withCard('ABCDE1234F', 'shortfalls');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.path).toBe('shortfalls[0].card');
  });

  it.each(['Kotak 811', 'Platinum 2024 Card', 'HDFC Millennia', 'SBI SimplyClick'])(
    'still accepts %s',
    (name) => {
      expect(withCard(name, 'items').ok).toBe(true);
    },
  );
});
