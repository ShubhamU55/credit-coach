import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(here, '../bin/stop-gate.mjs');

// Child-process start-up exceeds Vitest's 5 s default on a loaded machine.
const SPAWN_TIMEOUT_MS = 60_000;

function runBin(input) {
  return spawnSync(process.execPath, [binPath], { input, encoding: 'utf8' });
}

describe('bin/stop-gate.mjs', { timeout: SPAWN_TIMEOUT_MS }, () => {
  it('exits 0 with no output when a stop hook already forced a continuation', () => {
    const result = runBin(JSON.stringify({ stop_hook_active: true }));

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('does not gate, and says so, when its input is not JSON', () => {
    const result = runBin('not json');

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('not valid JSON');
  });
});
