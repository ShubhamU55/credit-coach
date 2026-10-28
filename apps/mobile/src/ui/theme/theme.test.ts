import { cardFinish, finishForIndex, fontFamily, shadow, space, type } from './index';

describe('finishForIndex', () => {
  test('assigns graphite, navy, plum by card order and then repeats', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(finishForIndex)).toEqual([
      'graphite',
      'navy',
      'plum',
      'graphite',
      'navy',
      'plum',
      'graphite',
    ]);
  });

  test('every returned key exists in cardFinish', () => {
    for (let i = 0; i < 6; i++) expect(cardFinish[finishForIndex(i)]).toBeDefined();
  });
});

describe('space', () => {
  test('matches design.md section 5', () => {
    expect(space).toEqual({
      gutter: 20,
      section: 28,
      cardPad: 16,
      heroPad: 20,
      grid: 12,
      carousel: 16,
      navClearance: 120,
      touch: 48,
    });
  });
});

describe('type scale', () => {
  const roles = [
    'display',
    'h1',
    'confirmation',
    'voice',
    'estimateTag',
    'numXL',
    'numL',
    'numM',
    'numS',
    'numXS',
    'title',
    'body',
    'bodyS',
    'caption',
    'overline',
    'button',
    'buttonS',
    'micro',
  ] as const;

  test('defines every role from design.md 3.2', () => {
    expect(Object.keys(type).sort()).toEqual([...roles].sort());
  });

  test('Fraunces is used only at 18px or above and never on numbers or buttons', () => {
    const serif: string[] = [fontFamily.serif, fontFamily.serifItalic, fontFamily.serifSemi];
    for (const role of roles) {
      const style = type[role];
      if (serif.includes(style.fontFamily)) {
        expect(style.fontSize as number).toBeGreaterThanOrEqual(18);
        expect(role).not.toMatch(/^num|^button/);
      }
    }
  });

  test('every number role is Jakarta 800 and tabular', () => {
    for (const role of ['numXL', 'numL', 'numM', 'numS', 'numXS'] as const) {
      expect(type[role].fontFamily).toBe(fontFamily.sans800);
      expect(type[role].fontVariant).toContain('tabular-nums');
    }
  });

  test('buttons, overlines and micro labels are uppercase', () => {
    for (const role of ['button', 'buttonS', 'overline', 'micro'] as const) {
      expect(type[role].textTransform).toBe('uppercase');
    }
  });

  test('uses the exact sizes from the scale for the headline roles', () => {
    expect([type.display.fontSize, type.display.lineHeight]).toEqual([40, 44]);
    expect([type.h1.fontSize, type.h1.lineHeight]).toEqual([34, 38]);
    expect([type.numXL.fontSize, type.numXL.lineHeight]).toEqual([64, 66]);
    expect([type.caption.fontSize, type.caption.lineHeight]).toEqual([12, 17]);
  });
});

describe('shadow tokens', () => {
  test('are copied verbatim from design.md section 4 (hard offset, zero blur)', () => {
    expect(shadow.pop).toBe('4px 4px 0px #5A3FD6, inset 0px 1px 0px rgba(255,255,255,0.3)');
    expect(shadow.popOnHero).toBe('4px 4px 0px #0B0B0D, inset 0px 1px 0px rgba(255,255,255,0.3)');
    expect(shadow.popSmall).toBe('3px 3px 0px #5A3FD6');
    expect(shadow.tileIdle).toBe('3px 3px 0px #26262D');
    expect(shadow.cardTile).toBe('4px 4px 0px #26262D');
    expect(shadow.hero).toBe('6px 6px 0px #5A3FD6');
    expect(shadow.nav).toBe('4px 4px 0px #000000');
    expect(shadow.logo).toBe('3px 3px 0px #9F86FF');
    expect(shadow.switchThumbOff).toBe('2px 2px 0px #3A3A44');
    expect(shadow.switchThumbOn).toBe('2px 2px 0px #5A3FD6');
  });
});
