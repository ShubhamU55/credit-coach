import { color, cardFinish, scoreZone } from './color';

// WCAG 2.x relative luminance and contrast ratio (sRGB, 0.04045 linearisation cut-off).
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(hexA);
  const b = luminance(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

type Row = { name: string; fg: string; bg: string; documented: number; need: number };

// Every row of docs/design.md section 2.3. `documented` is the ratio the doc prints.
const rows: Row[] = [
  { name: 'ink / bg', fg: color.ink, bg: color.bg, documented: 18.0, need: 4.5 },
  { name: 'body / bg', fg: color.body, bg: color.bg, documented: 13.3, need: 4.5 },
  { name: 'muted / bg', fg: color.muted, bg: color.bg, documented: 7.06, need: 4.5 },
  { name: 'muted / surface', fg: color.muted, bg: color.surface, documented: 6.6, need: 4.5 },
  { name: 'muted / surface2', fg: color.muted, bg: color.surface2, documented: 6.09, need: 4.5 },
  { name: 'link / bg', fg: color.link, bg: color.bg, documented: 9.06, need: 4.5 },
  { name: 'link / surface', fg: color.link, bg: color.surface, documented: 8.47, need: 4.5 },
  { name: 'onAccent / accent', fg: color.onAccent, bg: color.accent, documented: 6.86, need: 4.5 },
  {
    name: 'onAccentMuted / accent',
    fg: color.onAccentMuted,
    bg: color.accent,
    documented: 5.1,
    need: 4.5,
  },
  { name: 'accent / bg (UI)', fg: color.accent, bg: color.bg, documented: 6.86, need: 3 },
  { name: 'line / bg (UI)', fg: color.line, bg: color.bg, documented: 3.69, need: 3 },
  { name: 'line / surface (UI)', fg: color.line, bg: color.surface, documented: 3.45, need: 3 },
  { name: 'success / surface', fg: color.success, bg: color.surface, documented: 10.55, need: 4.5 },
  { name: 'warning / surface', fg: color.warning, bg: color.surface, documented: 10.46, need: 4.5 },
  {
    name: 'warning / warningTint',
    fg: color.warning,
    bg: color.warningTint,
    documented: 9.02,
    need: 4.5,
  },
  { name: 'error / bg', fg: color.error, bg: color.bg, documented: 7.09, need: 4.5 },
  { name: 'info / bg', fg: color.info, bg: color.bg, documented: 9.15, need: 4.5 },
  { name: 'muted / hairline', fg: color.muted, bg: color.hairline, documented: 5.39, need: 4.5 },
  {
    name: 'plum ink / fill',
    fg: color.ink,
    bg: cardFinish.plum.fill,
    documented: 15.21,
    need: 4.5,
  },
  {
    name: 'plum muted / fill',
    fg: cardFinish.plum.muted,
    bg: cardFinish.plum.fill,
    documented: 8.13,
    need: 4.5,
  },
  {
    name: 'plum warning / fill',
    fg: color.warning,
    bg: cardFinish.plum.fill,
    documented: 9.46,
    need: 4.5,
  },
  {
    name: 'plum border / fill (UI)',
    fg: cardFinish.plum.border,
    bg: cardFinish.plum.fill,
    documented: 3.29,
    need: 3,
  },
  {
    name: 'plum border / bg (UI)',
    fg: cardFinish.plum.border,
    bg: color.bg,
    documented: 3.89,
    need: 3,
  },
  {
    name: 'navy muted / fill',
    fg: cardFinish.navy.muted,
    bg: cardFinish.navy.fill,
    documented: 8.06,
    need: 4.5,
  },
  {
    name: 'navy warning / fill',
    fg: color.warning,
    bg: cardFinish.navy.fill,
    documented: 9.21,
    need: 4.5,
  },
  {
    name: 'navy border / fill (UI)',
    fg: cardFinish.navy.border,
    bg: cardFinish.navy.fill,
    documented: 3.49,
    need: 3,
  },
  {
    name: 'graphite muted / fill',
    fg: cardFinish.graphite.muted,
    bg: cardFinish.graphite.fill,
    documented: 7.04,
    need: 4.5,
  },
  {
    name: 'graphite warning / fill',
    fg: color.warning,
    bg: cardFinish.graphite.fill,
    documented: 9.44,
    need: 4.5,
  },
  {
    name: 'graphite border / fill (UI)',
    fg: cardFinish.graphite.border,
    bg: cardFinish.graphite.fill,
    documented: 3.11,
    need: 3,
  },
  {
    name: 'error / errorTint (icon tile)',
    fg: color.error,
    bg: color.errorTint,
    documented: 6.09,
    need: 3,
  },
  {
    name: 'success / successTint (icon tile)',
    fg: color.success,
    bg: color.successTint,
    documented: 9.07,
    need: 3,
  },
  { name: 'poor zone / surface', fg: scoreZone.poor, bg: color.surface, documented: 3.08, need: 3 },
  { name: 'fair zone / surface', fg: scoreZone.fair, bg: color.surface, documented: 3.88, need: 3 },
  { name: 'good zone / surface', fg: scoreZone.good, bg: color.surface, documented: 3.2, need: 3 },
  {
    name: 'excellent zone / surface',
    fg: scoreZone.excellent,
    bg: color.surface,
    documented: 3.89,
    need: 3,
  },
];

describe('design.md section 2.3 contrast table', () => {
  test.each(rows)('$name meets its required ratio', ({ fg, bg, need }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(need);
  });

  test.each(rows)('$name matches the ratio printed in the doc', ({ fg, bg, documented }) => {
    // A mismatch means a token was mistyped when copied from the doc.
    expect(contrastRatio(fg, bg)).toBeCloseTo(documented, 1);
  });

  test('the contrast helper returns 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});

describe('decorative-only tokens', () => {
  test('accentEdge is below 3:1 on bg, so it can never be a control boundary', () => {
    expect(contrastRatio(color.accentEdge, color.bg)).toBeLessThan(3);
  });

  test('hairline is below 3:1 on bg, so inputs must use line instead', () => {
    expect(contrastRatio(color.hairline, color.bg)).toBeLessThan(3);
  });
});
