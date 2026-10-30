import aaravSeed from './aarav.json';
import { parseSeed } from './seed';

function mutated(change: (seed: Record<string, any>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(aaravSeed)) as Record<string, any>;
  change(copy);
  return copy;
}

describe('parseSeed', () => {
  it('accepts the shipped Aarav seed', () => {
    expect(parseSeed(aaravSeed).cards).toHaveLength(3);
  });

  it('rejects a seed that is not an object', () => {
    expect(() => parseSeed(null)).toThrow(/seed/);
    expect(() => parseSeed('nope')).toThrow(/seed/);
  });

  it('rejects a misspelled or missing card field', () => {
    const typo = mutated((s) => {
      s.cards[0].outstandng = s.cards[0].outstanding;
      delete s.cards[0].outstanding;
    });

    expect(() => parseSeed(typo)).toThrow(/cards\[0\]\.outstanding/);
  });

  it('rejects money that is not a non-negative integer', () => {
    const fractional = mutated((s) => {
      s.cards[1].limit = 1000.5;
    });

    expect(() => parseSeed(fractional)).toThrow(/cards\[1\]\.limit/);
  });

  it('rejects an unknown reporting basis', () => {
    const bad = mutated((s) => {
      s.rules.reportingBasis = 'statment';
    });

    expect(() => parseSeed(bad)).toThrow(/rules\.reportingBasis/);
  });

  it('rejects a day of month outside 1-31 and allows a null dueDay', () => {
    const badDay = mutated((s) => {
      s.cards[0].statementDay = 32;
    });
    const nullDue = mutated((s) => {
      s.cards[0].dueDay = null;
    });

    expect(() => parseSeed(badDay)).toThrow(/cards\[0\]\.statementDay/);
    expect(parseSeed(nullDue).cards[0]?.dueDay).toBeNull();
  });

  it('rejects an oldest account that is not one of the cards', () => {
    const bad = mutated((s) => {
      s.profile.history.oldestAccountCardId = 'nope';
    });

    expect(() => parseSeed(bad)).toThrow(/oldestAccountCardId/);
  });

  it('rejects duplicate card ids', () => {
    const dup = mutated((s) => {
      s.cards[1].id = s.cards[0].id;
    });

    expect(() => parseSeed(dup)).toThrow(/duplicate/i);
  });

  it('rejects a secured flag that is not a boolean', () => {
    const bad = mutated((s) => {
      s.cards[0].isSecured = 'no';
    });

    expect(() => parseSeed(bad)).toThrow(/cards\[0\]\.isSecured/);
  });

  it('rejects a full PAN without echoing it', () => {
    const bad = mutated((s) => {
      s.profile.panMasked = 'ABCDE1234F';
    });

    expect(() => parseSeed(bad)).toThrow(/profile\.panMasked/);
    expect(() => parseSeed(bad)).not.toThrow(/ABCDE1234F/);
  });

  it('rejects an unmasked mobile number without echoing it', () => {
    const bad = mutated((s) => {
      s.profile.mobileMasked = '+91 9876543210';
    });

    expect(() => parseSeed(bad)).toThrow(/profile\.mobileMasked/);
    expect(() => parseSeed(bad)).not.toThrow(/9876543210/);
  });
});
