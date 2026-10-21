---
purpose: Document the scratch/** temporary-file header format (spec §8.6); this header is the worked example
owner: ShubhamU55
created: 2026-10-22
expires: 2027-10-22
keep-if: This file keeps documenting the header format; never auto-delete
---

# scratch/

`scratch/` holds temporary working files for a session or a ticket: scratch
scripts, exploratory output, notes you don't want to commit permanently.
**Everything is committed** (spec), but temporary files carry an expiry so
they don't silently become permanent.

## Header format

Every file under `scratch/**` (except this README) must start with a header
carrying five fields: `purpose`, `owner`, `created`, `expires`, `keep-if`.
`created` and `expires` are strict `YYYY-MM-DD` dates — `expires` drives the
whole scheme, so both are mandatory. `keep-if` is optional; when present it
says what would make the file permanent instead of deleted.

The header can be written either as YAML frontmatter (shown above, for
Markdown files) or as a leading `//` comment block (for code):

```
// purpose: what this file is for
// owner: you@example.com
// created: 2026-10-22
// expires: 2026-11-05
// keep-if: optional — what would make this permanent
```

Field values may be wrapped in matching `'` or `"` quotes, and a trailing
`# ...` comment on a field line is stripped. See
`.claude/hooks/lib/scratch.mjs` (`parseScratchHeader`) for the exact parser
this format must satisfy, and `.claude/hooks/tests/scratch-headers.test.mjs`
for the check every file under `scratch/**` must pass.

## Expiry

`.claude/hooks/bin/scratch-expiry.mjs` runs in CI and **warns** (never fails
the build) about files with a missing, unparseable, or expired header. An
expired file should be deleted or promoted out of `scratch/` — update its
`expires` date only if the work is still genuinely in flight.

This README is skipped by both the expiry check and the header-enforcement
test, since it documents the format rather than being a temporary file
itself — but it carries a valid header anyway, as the worked example above.
