// PostToolUse hook: run prettier on the edited file. Never blocks; any failure exits 0.
import { spawnSync } from 'node:child_process';
import { isFormattable } from './lib/paths.mjs';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  try {
    const filePath = JSON.parse(raw)?.tool_input?.file_path;
    if (filePath && isFormattable(filePath)) {
      spawnSync('npx', ['--no-install', 'prettier', '--write', '--log-level', 'silent', filePath], {
        stdio: 'ignore',
        shell: process.platform === 'win32',
        timeout: 20_000,
      });
    }
  } catch {
    // formatting is best-effort
  }
  process.exit(0);
});
