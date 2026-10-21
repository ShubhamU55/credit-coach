---
name: process-journal
description: Write the AI-assisted development journal entries in docs/journal/ that show hackathon judges how AI was used (spec, plan, tests, review, learnings). Use after finishing a feature, a plan, a significant debugging session, or a decision, and whenever /journal is run.
---

# Process journal

The hackathon judges "how AI helped you build it" as much as the product. `docs/journal/` is that evidence. Write it while the details are fresh, not on submission day.

## When
- A feature or plan is finished.
- A notable debugging session ends (especially one where the AI was wrong and got corrected).
- A decision is made that isn't already in an ADR.

## File
`docs/journal/NNN-<slug>.md`. `NNN` is zero-padded and continues the highest existing number.

## Template
```markdown
# NNN: <title>

- **Date:** YYYY-MM-DD
- **PRD refs:** §x.y
- **Plan:** docs/superpowers/plans/<file>.md (Task N)
- **Commits:** <first7>..<last7>

## Goal
One or two sentences.

## What the AI did
Concrete actions: which skills, agents, commands and prompts were used, and what each produced.

## Tests added
Names and counts per layer (Vitest / Maestro / Playwright), plus coverage if relevant.

## Review findings & fixes
What the reviewers (typescript, react, security, silent-failure) found, and what changed as a result.

## Where AI was wrong / where I overrode it
Honest list. Judges value this.

## What I learned
Bullets that would change how the next feature is built.

## Time spent
Rough wall-clock time.
```

## Rules
- Be factual: commit hashes, test counts, file paths. No marketing language.
- Never paste secrets, real PANs or personal data.
- Link to ADRs rather than repeating them.
