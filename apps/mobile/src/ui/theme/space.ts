// docs/design.md section 5.
export const space = {
  gutter: 20, // left and right padding of all content
  section: 28, // between top-level sections
  cardPad: 16, // tiles, rows
  heroPad: 20, // hero and score card
  grid: 12, // two-up tiles, what-if grid
  carousel: 16, // card tiles
  navClearance: 120, // paddingBottom on scroll content so the floating nav never covers the disclaimer
  touch: 48, // minimum touch target in dp
} as const;
