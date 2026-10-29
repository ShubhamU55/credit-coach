import { color } from './color';

// Tokens that design.md section 6 names in prose but section 2.1 and 4 do not list. They live in
// their own file so the part-A theme files stay untouched. Colours come from the token table.
export const overlay = {
  // Chip sitting on a card finish (design.md 6.20 "on-finish").
  onFinishChip: 'rgba(0,0,0,0.35)',
  // Empty segment of the hero's plan progress bar (design.md 6.4).
  heroSegmentEmpty: 'rgba(0,0,0,0.4)',
} as const;

export const kitShadow = {
  // Primary plan step card: `4px 4px 0 accentEdge`, without the button's inset highlight (6.8).
  stepPrimary: `4px 4px 0px ${color.accentEdge}`,
  // The "you pay" square on the payment timeline (6.9).
  timelinePay: `2px 2px 0px ${color.accentEdge}`,
  // The "now" block on the score zone bar (6.13).
  scoreNow: `3px 3px 0px ${color.bg}`,
} as const;
