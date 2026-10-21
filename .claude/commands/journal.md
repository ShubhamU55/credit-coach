---
description: Add a process-journal entry for judges (what the AI did, tests, reviews, learnings)
argument-hint: <title>
---

Write a new entry in `docs/journal/` titled "$ARGUMENTS", following the `process-journal` skill exactly.

- Find the next number from the existing `NNN-*.md` files.
- Fill each section from this session's facts: commits (`git log`), tests that ran and their counts, review findings, and places where you were wrong or the owner overrode you.
- Leave out anything you can't back with a commit, file or command output.

Show the owner the entry, then commit it as `docs(journal): NNN <slug>`.
