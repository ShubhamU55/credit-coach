# Process journal

Evidence of how AI was used to build Credit Coach. One entry per feature, plan or notable decision, written with `/journal` (see `.claude/skills/process-journal/SKILL.md` for the template).

| #                                         | Entry                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| [000](000-brainstorm-and-foundation.md)   | Brainstorm, frozen PRD and foundation                                           |
| [001](001-agentic-system-dry-run.md)      | Agentic system dry run caught the pipeline overriding an approved spec          |
| [002](002-wave-3-agents-and-rce-catch.md) | Plan 1c Wave 3: the remaining agents, and catching a real RCE before it shipped |
| [003](003-agentic-system.md)              | Plan 1c Wave 4: the pipeline workflows, and the fail-open gates review caught   |
| [004](004-pd-1-planner.md)                | PD-1: types, reporting dates and the payment planner                            |
| [005](005-pd-2-score-predictor.md)        | PD-2: a rules-based score predictor that never shows one exact number           |
| [006](006-pd-3-ui-kit-a.md)               | PD-3: mobile UI kit part A                                                      |
| [007](007-pd-4-app-shell.md)              | PD-4: mobile app shell                                                          |
| [009](009-pd-6-release-apk-install.md)    | PD-6: release APK proof, install guide, and a flaky first run                   |
| [010](010-pd-7-ui-kit-b.md)               | PD-7: mobile UI kit part B                                                      |
| [014](014-pd-11-explain.md)               | PD-11: "Why this plan?" with a template fallback                                |
| [019](019-pd-16-submission.md)            | PD-16: the product phase, the submission, and what is cut                       |

Numbers are pre-assigned per ticket in `docs/parallel-streams.md`. Entries 008 and 011 to 013 (PD-5, PD-8, PD-9,
PD-10) are in the directory but not yet in the table above. Entry 009 (PD-6) is on `main` (merged in #70, `9510516`). Entries 015
to 018 (PD-12 to PD-15) were not written.
