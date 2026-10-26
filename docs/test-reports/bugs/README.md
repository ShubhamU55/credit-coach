# Bug evidence (`docs/test-reports/bugs/`)

Evidence for a GitHub bug ticket filed from `.github/ISSUE_TEMPLATE/bug.yml` (spec §8.1a) lives
here, one directory per issue number:

```
docs/test-reports/bugs/<issue#>/
```

## What goes here

- `bug-reporter` commits the finding's evidence when it files the ticket: screenshots, logs,
  failing test output, Maestro/Playwright artifacts.
- `bug-analyst` may add reproduction transcripts or logs backing its RCA.
- `bug-reporter` commits the passing evidence again at close time, once the fix has merged and the
  original failing flow or test passes on `main`.

Every file here is linked from its ticket by a GitHub blob URL
(`https://github.com/<owner>/<repo>/blob/<commit>/docs/test-reports/bugs/<issue#>/<file>`), never
a local path — the repo is public, and the images and logs must render for anyone reading the
issue.

## Why it's committed, not attached to the issue directly

GitHub issue attachments aren't versioned with the code and can be deleted independently of the
repo. Committing evidence next to the code it describes keeps the bug's reproduction and its fix
in the same history, and lets `bug-analyst` and `bug-reporter` reference an exact commit's
evidence rather than "whatever is attached to the issue right now."

## Who writes here

Only `bug-analyst` and `bug-reporter` write under this directory (see their `Allowed paths`
sections in `.claude/agents/bug-analyst.md` and `.claude/agents/bug-reporter.md`). No other agent
writes here.
