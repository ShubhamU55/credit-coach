# Credit Coach

**Your credit coach: what to pay, where, and when, every month.**

People in India with several credit cards, FDs and loans care about their CIBIL score but don't know what to do *this month* to protect it. The bureau sees the balance that is **reported**: typically the statement balance, and since 2026 also weekly snapshots. It does not see what's left after you pay by the due date. That means someone who pays in full every month can still show high utilization.

Credit Coach turns your cards into a concrete monthly plan: which card to pay, how much, and by when. It also shows an estimated score range with the reasons behind it.

> Built solo for the Hack@FiftyFive "Build With AI" Hackathon 2026, with AI as the development partner.

## Repo map

| Path | What |
|---|---|
| `docs/PRD.md` | Product requirements (frozen v1). The source of truth |
| `docs/tech-stack.md` | Stack decision and risks |
| `docs/superpowers/plans/` | Implementation plans |
| `packages/engine` | Pure TypeScript rules engine (planner, predictor, guard) |
| `apps/mobile` | Android app (Expo / React Native) |
| `apps/admin` | Admin control center (Next.js) |
| `supabase/` | Database migrations and Edge Functions |

## Run locally

_Filled in as each part lands._

## Credits

Parts of the AI development setup are adapted from [affaan-m/ECC](https://github.com/affaan-m/ECC) (MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
