import { describe, it, expect } from 'vitest';
import { listExpiredScratch, findStaleRefs } from './tidy.mjs';

const TODAY = '2026-10-27';

function header(expires) {
  return [
    '---',
    'purpose: spike for a ticket',
    'owner: ShubhamU55',
    'created: 2026-10-15',
    `expires: ${expires}`,
    'keep-if: it proves useful',
    '---',
    '',
    'body',
  ].join('\n');
}

describe('listExpiredScratch', () => {
  it('flags only the items whose expires date is strictly before today', () => {
    const files = [
      { path: 'scratch/old.md', text: header('2026-10-20') },
      { path: 'scratch/due-today.md', text: header('2026-10-27') },
      { path: 'scratch/fresh.md', text: header('2026-11-03') },
    ];
    expect(listExpiredScratch(files, TODAY)).toEqual(['scratch/old.md']);
  });

  it('reads a leading // comment header, as scratch code files carry', () => {
    const text = [
      '// purpose: probe',
      '// owner: ShubhamU55',
      '// created: 2026-10-01',
      '// expires: 2026-10-08',
      'console.log(1);',
    ].join('\n');
    expect(listExpiredScratch([{ path: 'scratch/probe.mjs', text }], TODAY)).toEqual([
      'scratch/probe.mjs',
    ]);
  });

  it('never flags a file with a missing or invalid header (scratch-expiry already warns on those)', () => {
    const files = [
      { path: 'scratch/none.md', text: 'just notes' },
      { path: 'scratch/bad-date.md', text: header('next week') },
    ];
    expect(listExpiredScratch(files, TODAY)).toEqual([]);
  });

  it('keeps the input order and returns [] for no files', () => {
    const files = [
      { path: 'scratch/b.md', text: header('2026-01-01') },
      { path: 'scratch/a.md', text: header('2026-01-02') },
    ];
    expect(listExpiredScratch(files, TODAY)).toEqual(['scratch/b.md', 'scratch/a.md']);
    expect(listExpiredScratch([], TODAY)).toEqual([]);
  });
});

describe('findStaleRefs', () => {
  const present = new Set(['docs/PRD.md', 'apps/mobile', 'packages/engine/src/index.ts']);
  const exists = (p) => present.has(p);

  it('flags a backticked repo path that no longer exists and keeps the ones that do', () => {
    const docs = [
      {
        path: 'docs/status.md',
        text: 'See `docs/PRD.md` and `docs/removed.md`; the app lives in `apps/mobile/`.',
      },
    ];
    expect(findStaleRefs(docs, exists)).toEqual([
      { doc: 'docs/status.md', ref: 'docs/removed.md' },
    ]);
  });

  it('strips a :line suffix or #anchor before checking, and reports the path once per doc', () => {
    const docs = [
      {
        path: 'docs/a.md',
        text: '`packages/engine/src/index.ts:42` `docs/gone.md#intro` `docs/gone.md`',
      },
    ];
    expect(findStaleRefs(docs, exists)).toEqual([{ doc: 'docs/a.md', ref: 'docs/gone.md' }]);
  });

  it('ignores placeholders, globs, URLs, commands, absolute and parent-relative paths', () => {
    const text = [
      '`docs/agent-runs/<date>-<slug>.md`',
      '`docs/agent-runs/*.md`',
      '`https://example.com/docs/x.md`',
      '`pnpm --filter @credit-coach/engine test`',
      '`/etc/hosts.conf`',
      '`~/notes/x.md`',
      '`../docs/missing.md`',
      '`Save/Improve`',
      '`.superpowers/sdd/plan/task.md`',
    ].join(' ');
    expect(findStaleRefs([{ path: 'docs/a.md', text }], () => false)).toEqual([]);
  });

  it('ignores paths inside fenced code blocks', () => {
    const text = ['```', '`docs/in-fence.md`', '```', '', 'After: `docs/after.md`'].join('\n');
    expect(findStaleRefs([{ path: 'docs/a.md', text }], () => false)).toEqual([
      { doc: 'docs/a.md', ref: 'docs/after.md' },
    ]);
  });

  it('checks every doc and passes the exists callback a normalized repo-relative path', () => {
    const seen = [];
    const docs = [
      { path: 'docs/a.md', text: '`./docs/PRD.md`' },
      { path: 'docs/b.md', text: '`apps\\mobile`' },
    ];
    findStaleRefs(docs, (p) => {
      seen.push(p);
      return true;
    });
    expect(seen).toEqual(['docs/PRD.md']);
  });
});
