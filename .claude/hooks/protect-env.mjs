// PreToolUse hook: block agent writes to .env files (only .env.example may be edited).
import { isProtectedPath } from './lib/paths.mjs';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  let filePath;
  try {
    filePath = JSON.parse(raw)?.tool_input?.file_path;
  } catch {
    process.exit(0); // unparseable input: don't block unrelated work
  }
  if (filePath && isProtectedPath(filePath)) {
    process.stderr.write(
      `Blocked: ${filePath} is a secrets file. Agents never write .env files. ` +
        'Ask the owner to copy .env.example to .env.local and fill it in by hand.\n',
    );
    process.exit(2);
  }
  process.exit(0);
});
