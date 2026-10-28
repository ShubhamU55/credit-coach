#!/usr/bin/env node
// Stop hook: before the agent finishes, run the checks the changed files need.
// Reads the hook JSON on stdin; prints a block decision when a gate fails.
import { spawnSync } from 'node:child_process';
import { changedCodePaths, gatesFor, decideStop } from '../lib/stop-gate.mjs';

const GATE_TIMEOUT_MS = 120_000;

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (raw += chunk));
    process.stdin.on('end', () => resolve(raw));
  });
}

function parseInput(raw) {
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    process.stderr.write('stop-gate: hook input was not valid JSON; not gating this stop.\n');
    return { stop_hook_active: true };
  }
}

const input = parseInput(await readStdin());
const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd();

// `shell` is needed on Windows, where pnpm is a .cmd shim. Every argument is a constant from the lib.
function runGate({ command, args }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: GATE_TIMEOUT_MS,
    shell: process.platform === 'win32',
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const status = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
if (status.status !== 0) {
  process.stderr.write('stop-gate: `git status` failed; not gating this stop.\n');
}
const gates = status.status === 0 ? gatesFor(changedCodePaths(status.stdout)) : [];
const decision = decideStop(input, gates, runGate);

if (decision.block) {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason: decision.reason })}\n`);
}
