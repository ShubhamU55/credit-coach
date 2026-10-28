## Summary

<!-- What changed and why, in a sentence or two. Link the issue with "Fixes #N" when there is one. -->

## Test evidence

<!-- Paste the command and the result line. "Tests pass" without output is not evidence. -->

- [ ] `pnpm verify`: <result line, e.g. "29 test files, 1586 tests passed">
- [ ] Other checks that apply (admin E2E, Maestro flow, `/pr-review` verdict): <command and result>

## Review checklist

- [ ] Meets coding-style.md: readable names, small functions/files, shallow nesting, immutable updates, no hardcoded secrets
- [ ] No `console.log` or debug statements
- [ ] Tests exist for new functionality
- [ ] Engine coverage ≥ 90% lines; app changes covered by an E2E flow
- [ ] Commits are conventional commits and carry no AI attribution line
- [ ] No secret, no full PAN and no personal data in the diff, the logs or the description
- [ ] If this touches CLAUDE.md, .claude/, an AGENTS.md or .github/, the owner has read the diff itself (the AI policy requires it)

## AI-assisted

<!-- Disclose it here: git history does not mark which commits an agent wrote. -->

- Agents or commands used: <for example /build, /qa, /pr-review, or "none">
- Process journal entry or run ledger: <path under docs/journal/ or docs/agent-runs/>
