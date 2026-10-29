import fs from 'node:fs';
import path from 'node:path';

const FLOW = fs.readFileSync(path.join(__dirname, '../../../.maestro/score-whatif.yaml'), 'utf8');

// Text the flow asserts must come from code the app really ships (a renamed testID or a changed
// warning would otherwise only break on a device).
const SOURCES = ['ScoreScreen.tsx', 'ScoreHome.tsx', 'WhatIfConfigure.tsx', 'WhatIfOutcomeView.tsx']
  .map((file) => fs.readFileSync(path.join(__dirname, file), 'utf8'))
  .join('\n');

describe('score-whatif.yaml', () => {
  it('only uses test IDs that exist (or are built from a known prefix) in the Score screen', () => {
    const ids = [...FLOW.matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1] as string);

    const external = new Set([
      'welcome-try-sample',
      'home-screen',
      'home-link-score',
      'score-range',
    ]);
    const missing = ids.filter((id) => {
      if (external.has(id)) return false;
      if (id.startsWith('score-tile-')) return !SOURCES.includes('score-tile-');
      if (id.startsWith('score-card-choice-')) return !SOURCES.includes('score-card-choice');
      return !SOURCES.includes(`testID="${id}"`);
    });
    expect(missing).toEqual([]);
  });

  it('asserts the Aarav range and the engine close-card range', () => {
    expect(FLOW).toContain('708–736');
    expect(FLOW).toContain('698–726');
  });

  it('asserts the close-card warnings', () => {
    expect(FLOW).toContain('score-oldest-account');
    expect(FLOW).toContain('score-limit-loss');
    expect(FLOW).toContain('Closing a card shortens your average credit age');
  });
});
