---
description: 'Add a process-journal entry for judges (what the AI did, tests, reviews, learnings). Use after finishing a feature, a plan or a significant debugging session.'
argument-hint: '<title>'
disable-model-invocation: true
allowed-tools: 'Bash(git log *) Bash(git status --porcelain *)'
---

Write a new entry in `docs/journal/` titled "$ARGUMENTS", following the `process-journal` skill exactly.

- Find the next number from the existing `NNN-*.md` files.
- Fill each section from this session's facts: commits (`git log`), tests that ran and their counts, review findings, and places where you were wrong or the owner overrode you.
- Leave out anything you can't back with a commit, file or command output.

Before showing it, check the entry: `git status --porcelain docs/journal` lists exactly the new
file, its number is the next free one, and every section the `process-journal` skill requires is
present and non-empty. Fix anything that fails, then show the owner the entry and commit it as
`docs(journal): NNN <slug>`.
