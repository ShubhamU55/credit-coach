// Copied verbatim from docs/design.md section 2.1. The only file (with shadow.ts) that may hold hex colors.
export const color = {
  // structure
  bg: '#0B0B0D', // app background
  surface: '#141417', // cards, sheet, nav
  surface2: '#1C1C21', // nested blocks: date blocks, initials tile, switch track (off)
  hairline: '#26262D', // decorative borders and dividers, bar tracks on surface
  lineStrong: '#34343C', // nav border, idle what-if tile border
  rule: '#3A3A44', // timeline connector lines, dashed rules
  line: '#6A6A77', // functional borders: inputs, outline buttons, unselected radios
  // text
  ink: '#F5F5F2', // headings, numbers, primary text
  body: '#D4D4D8', // paragraphs
  muted: '#9A9AA5', // labels, captions, inactive nav, disclaimer
  // accent
  accent: '#9F86FF', // primary action fill, selected, active-tab dot, plan bars
  onAccent: '#0B0B0D', // text and icons on accent
  onAccentMuted: '#2A1A66', // secondary text on accent (selected radio sub-line)
  accentEdge: '#5A3FD6', // pop-shadow color. Decorative only (see design.md 2.3)
  link: '#B6A3FF', // text links, italic headline emphasis, "you pay" labels
  // status
  success: '#4ADE80',
  successTint: '#16261D',
  warning: '#FFB547',
  warningTint: '#2A2112',
  error: '#FF6B6B',
  errorTint: '#2E1616',
  info: '#6CB6FF',
  // overlays
  scrim: 'rgba(0,0,0,0.72)',
  navShadow: '#000000',
} as const;

// Credit-card "finishes". Assigned by card order (1st graphite, 2nd navy, 3rd plum, then repeat).
// They are NOT bank branding: no bank colors or logos.
export const cardFinish = {
  graphite: { fill: '#1E1E24', border: '#6A6A77', muted: '#A8A8B3', track: '#34343C' },
  navy: { fill: '#14203A', border: '#5875A8', muted: '#A9B8D0', track: '#24345A' },
  plum: { fill: '#2A1730', border: '#8A5F96', muted: '#C2AFC9', track: '#4A2F52' },
} as const;

// Score zone bar fills (UI only, never text).
export const scoreZone = {
  poor: '#A04848',
  fair: '#8F6E2C',
  good: '#45698C',
  excellent: '#2F8253',
} as const;

export type CardFinish = keyof typeof cardFinish;

const FINISH_ORDER: readonly CardFinish[] = ['graphite', 'navy', 'plum'];

/** The finish for the card at position `i` in the user's card order: graphite, navy, plum, repeating. */
export function finishForIndex(i: number): CardFinish {
  const n = FINISH_ORDER.length;
  return FINISH_ORDER[((Math.trunc(i) % n) + n) % n];
}
