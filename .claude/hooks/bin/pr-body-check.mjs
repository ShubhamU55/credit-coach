#!/usr/bin/env node
// CI check: fail the pull request when its body leaves out the AI-assisted disclosure or the
// `pnpm verify` result. The body arrives in the PR_BODY env var, never interpolated into a shell.
import { checkPrBody } from '../lib/pr-body.mjs';

const { ok, missing } = checkPrBody(process.env.PR_BODY);

if (!ok) {
  for (const item of missing) process.stderr.write(`pr-body: missing ${item}\n`);
  process.stderr.write(
    'pr-body: fill in .github/pull_request_template.md (use "none" when no agent was used).\n',
  );
  process.exit(1);
}
