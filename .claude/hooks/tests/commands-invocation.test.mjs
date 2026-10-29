import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const commandsDir = path.resolve(here, '../../commands');

const disablesModelInvocation = (name) => {
  const text = fs.readFileSync(path.join(commandsDir, `${name}.md`), 'utf8');
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  return /^disable-model-invocation:\s*true\s*$/m.test(front);
};

// The owner starts every command (CLAUDE.md), so each one's description stays out of context.
// commands-frontmatter.test.mjs pins why the write commands are blocked; this pins the rest.
// Only /verify stays invocable, because the model runs it before every commit.
const MODEL_INVOCABLE = ['verify'];
const ownerOnly = fs
  .readdirSync(commandsDir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.replace(/\.md$/, ''))
  .filter((name) => !MODEL_INVOCABLE.includes(name));

describe('.claude/commands model invocation', () => {
  it.each(ownerOnly)('/%s is owner-only, so its description stays out of context', (name) => {
    expect(disablesModelInvocation(name)).toBe(true);
  });

  it.each(MODEL_INVOCABLE)('/%s stays invocable by the model', (name) => {
    expect(disablesModelInvocation(name)).toBe(false);
  });
});
