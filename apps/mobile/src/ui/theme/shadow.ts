// Copied verbatim from docs/design.md section 4. Hard offset, zero blur: React Native `boxShadow`.
// Never use Android `elevation` for these: it cannot draw a hard offset.
export const shadow = {
  pop: '4px 4px 0px #5A3FD6, inset 0px 1px 0px rgba(255,255,255,0.3)', // primary button
  popOnHero: '4px 4px 0px #0B0B0D, inset 0px 1px 0px rgba(255,255,255,0.3)', // primary button on a card finish
  popSmall: '3px 3px 0px #5A3FD6', // selected what-if tile
  tileIdle: '3px 3px 0px #26262D', // idle what-if tile
  cardTile: '4px 4px 0px #26262D', // card carousel tiles
  hero: '6px 6px 0px #5A3FD6', // hero payment card
  nav: '4px 4px 0px #000000', // floating nav
  logo: '3px 3px 0px #9F86FF', // monogram
} as const;

export type ShadowKind = keyof typeof shadow;
