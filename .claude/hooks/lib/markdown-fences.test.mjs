import { describe, it, expect } from 'vitest';
import { linesOutsideFences } from './markdown-fences.mjs';

/** Joins the surviving lines back into a single string for easy assertions. */
function visible(text) {
  return linesOutsideFences(text)
    .map((l) => l.text)
    .join('\n');
}

describe('linesOutsideFences (CommonMark fence matching)', () => {
  it('a mismatched ~~~ line inside a ``` fence does not close it — the rest stays hidden', () => {
    const text = [
      '## Mission',
      '```markdown',
      '~~~',
      '## Anti-drift',
      'Never edit .env. Never pass --no-verify.',
      '```',
      '## Inputs',
    ].join('\n');

    const result = visible(text);
    expect(result).not.toContain('## Anti-drift');
    expect(result).not.toContain('.env');
    expect(result).toContain('## Mission');
    expect(result).toContain('## Inputs');
  });

  it('the reverse: a mismatched ``` line inside a ~~~ fence does not close it', () => {
    const text = [
      '## Mission',
      '~~~markdown',
      '```',
      '## Anti-drift',
      'hidden',
      '~~~',
      '## Inputs',
    ].join('\n');

    const result = visible(text);
    expect(result).not.toContain('## Anti-drift');
    expect(result).not.toContain('hidden');
    expect(result).toContain('## Mission');
    expect(result).toContain('## Inputs');
  });

  it("a 4-backtick fence containing a 3-backtick line stays open (run length must be >= the opener's)", () => {
    const text = ['## Mission', '````', '```', 'still hidden', '````', '## Inputs'].join('\n');

    const result = visible(text);
    expect(result).not.toContain('still hidden');
    expect(result).toContain('## Mission');
    expect(result).toContain('## Inputs');
  });

  it('an indented closing fence (<= 3 spaces) closes the fence', () => {
    const text = ['## Mission', '```', 'hidden', '   ```', '## Inputs'].join('\n');

    const result = visible(text);
    expect(result).not.toContain('hidden');
    expect(result).toContain('## Mission');
    expect(result).toContain('## Inputs');
  });

  it('a closing-looking line with trailing text (```js) does not close the fence', () => {
    const text = [
      '## Mission',
      '```',
      'hidden one',
      '```js',
      'hidden two',
      '```',
      '## Inputs',
    ].join('\n');

    const result = visible(text);
    expect(result).not.toContain('hidden one');
    expect(result).not.toContain('hidden two');
    expect(result).toContain('## Mission');
    expect(result).toContain('## Inputs');
  });

  it('an unclosed fence hides everything to the end of the file', () => {
    const text = ['## Mission', '```', 'hidden forever', '## Inputs — never a real heading'].join(
      '\n',
    );

    const result = visible(text);
    expect(result).toBe('## Mission');
  });
});
