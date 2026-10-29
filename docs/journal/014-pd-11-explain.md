# 014: PD-11, "Why this plan?" with a template fallback

- **Date:** 2026-10-28
- **PRD refs:** section 5.8; non-negotiable 2 (the LLM never computes)
- **Plan:** `docs/superpowers/plans/2026-10-28-pd-11.md`
- **Run ledger:** [`docs/agent-runs/2026-10-28-pd-11.md`](../agent-runs/2026-10-28-pd-11.md)

## Goal

Give the Plan screen a "Why this plan?" text that works with no network and no backend, and gets AI wording when the `explain` Edge Function is there, without ever letting the model produce a number.

## What the AI did

- One implementer session, by hand and test-first, in its own worktree. The engine writes the template and the strict payload from the plan; the app only asks the function for wording, with a 3-second limit.
- Read the kit first and found `AIExplanation` already owns the two labels, so the hook returns a boolean instead of duplicating label strings.
- Wrote the contract with the function (`{ text, source }`) because PD-5 was not on main yet, and logged it as a ruling.

## Tests added

- Engine: 7 vitest cases (Aarav plan, shortfall, determinism, unknown card name, 10% prepay, payload shape and JSON round trip).
- Mobile: 19 Jest cases across the client (timeout, malformed JSON, bad shapes, non-2xx, rejected fetch, unconfigured with no network call) and the hook (template first, AI upgrade, junk stays template).

## Review findings & fixes

- No reviewer ran; the coordinator reviews the diff. One self-found bug before any run: reading the env into a new object every render would have re-fired the effect in a loop, so the config is read once per mount.

## Where AI was wrong / where I overrode it

- The first hook returned label strings that the kit already defines; removed them.
- RNTL v14's `renderHook` is async; the first test run failed on `result` being a Promise until I awaited it.
- A shell heredoc failed with no files written; the files were written with the editor tool instead.
- The client tests were written in the same pass as the client, so the mobile side was not strictly red first; the engine side was.

## What I learned

- Expo inlines only literal `process.env.EXPO_PUBLIC_*` reads, so the config helper takes plain values and one tiny function does the literal reads.

## Time spent

One session; not timed. The live call is still to do after PD-5 is deployed.
