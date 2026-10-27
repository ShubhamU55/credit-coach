---
description: Janitor scan (proposals only): expired scratch items and living docs that reference paths that no longer exist
argument-hint: [--today YYYY-MM-DD]
---

Run the janitor scan from the repo root. It is **read-only and proposes only**: no command or
agent in this flow deletes, moves or edits a file (the `journal-writer` janitor rule, spec §8.6).

1. **Scan.** Run:

   ```
   node .claude/hooks/bin/tidy.mjs $ARGUMENTS
   ```

   It prints JSON: `expiredScratch` (paths whose `expires` date is before today),
   `staleRefs` (`{ doc, ref }`: a backticked repo path in a living doc that doesn't exist),
   and `unreadable` (files it couldn't read; report these, don't ignore them). It checks
   `scratch/**` and these living docs only: `CLAUDE.md`, `README.md`, `docs/*.md`, `docs/adr/**`,
   `.claude/rules/**`, `.claude/commands/**`. Plans, specs, ledgers and the journal are history and
   are never checked.

2. **Present the proposals.** Group them: expired scratch items first, then stale references by
   doc. For a stale reference say what each case likely is (renamed or removed file, or a
   local-only path such as `.design/` that exists on the owner's machine), since the scan can't tell.

3. **Act only on owner approval.** For approved scratch items, delete them in a normal commit,
   `chore(scratch): remove expired <name>`, so history still shows they existed; if one proved
   useful, promote it to its proper home and drop its header instead. For an approved stale
   reference, fix the doc in its own commit. If the owner approves nothing, change nothing.

To have `journal-writer` do a semantic janitor pass (symbols, not just paths), hand it this scan's
output; it returns `proposedDeletions` and never deletes either.
