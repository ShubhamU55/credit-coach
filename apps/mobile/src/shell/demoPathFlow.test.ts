import fs from 'node:fs';
import path from 'node:path';

const FLOW = fs.readFileSync(path.join(__dirname, '../../.maestro/demo-path.yaml'), 'utf8');

function readTree(dir: string): string {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return readTree(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)
        ? fs.readFileSync(full, 'utf8')
        : '';
    })
    .join('\n');
}

const SOURCE = readTree(path.join(__dirname, '..'));

describe('demo-path.yaml', () => {
  it('only uses test IDs that exist in the app source', () => {
    const ids = [...FLOW.matchAll(/id: '([a-z0-9-]+)'/g)].map((m) => m[1] as string);

    const missing = [...new Set(ids)].filter((id) => {
      if (id === 'plan-step-1-mark-paid') return !SOURCE.includes('-mark-paid');
      if (id.startsWith('mark-paid-choices-')) return !SOURCE.includes('mark-paid-choices');
      return !SOURCE.includes(id);
    });
    expect(missing).toEqual([]);
  });

  it('walks the demo path in order from a clean install', () => {
    const order = [
      'clearState: true',
      "'welcome-try-sample'",
      "'home-screen'",
      "'home-all-steps'",
      "'plan-step-1-mark-paid'",
      "'mark-paid-confirm'",
      "'mark-paid-recorded'",
      "'home-stat-score'",
      "'score-screen'",
      "'score-range'",
    ];
    const positions = order.map((s) => FLOW.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('asserts the recorded payment and only the shape of the post-payment range', () => {
    expect(FLOW).toContain('Recorded ₹620.');
    expect(FLOW).toContain("text: '[0-9]{3}–[0-9]{3}'");
    expect(FLOW).not.toContain('708–736');
  });

  it('takes a screenshot at each stage', () => {
    for (const shot of ['demo-home', 'demo-plan', 'demo-paid', 'demo-score']) {
      expect(FLOW).toContain(`takeScreenshot: ${shot}`);
    }
  });
});
