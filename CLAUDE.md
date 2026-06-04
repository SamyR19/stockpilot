# CLAUDE.md — StockPilot AI

This repo is **StockPilot AI**, a finance product forked from Paperclip. Note: the older root `AGENTS.md` and `doc/*.md` describe the *original Paperclip* — they are reference, not the current product definition.

## 🛑 Read FIRST, every session — before responding to anything non-trivial

**This is a hard requirement, not a suggestion.** At the start of any task — even a quick question — open and read these to restore full context (status, tasks, features, deployment state). They survive context-window resets; this conversation does not.

1. **`docs/stockpilot/ROADMAP.md`** — single source of truth: plan sequence, current status, feature diff vs Paperclip, architecture & conventions, design system, open questions, **and §2.5 the live deployment runbook**. **Update it after finishing a plan or notable change.**
2. **`docs/stockpilot/PROJECT_GOALS.md`** — what StockPilot is and the principles that filter every decision (read-only, never trades; additive over destructive; one codebase / two modes).
3. **`docs/stockpilot/PAPERCLIP_REFERENCE.md`** — module/page inventory of the forked Paperclip code, with keep / reconsider / finance dispositions.

Design spec: `docs/superpowers/specs/2026-05-31-stockpilot-ai-design.md`. Plans: `docs/superpowers/plans/`.

## Working conventions

- **Plans:** write with `superpowers:writing-plans`; execute with `superpowers:subagent-driven-development` (owner always wants subagent-driven — don't ask which approach).
- **Never** add a feature that could place, modify, or cancel a trade. StockPilot is strictly read-only.
- **New board UI page?** Add its route root to `BOARD_ROUTE_ROOTS` in `ui/src/lib/company-routes.ts` (company-prefixed routing).
- **Changed a linked workspace package** (e.g. `packages/market-data`)? Restart the server — tsx only watches `server/src`.
- **Commits:** author `Samy Rabah <samyrabah@icloud.com>`; add `Co-Authored-By: Claude ...`. Push to `main`.
- **Cloud hosting is on RAILWAY, not Vercel** (project `spectacular-trust`, URL `https://paperclipaidb-production.up.railway.app`). One Docker container = UI + API; Supabase = DB. Full runbook + gotchas in **ROADMAP §2.5**. `STOCKPILOT_MODE` switches selfhost vs cloud.
- **Owner is non-technical on infra** — explain plainly, give exact click-by-click dashboard steps, avoid unprompted CLI use.
- **After finishing a plan/feature/fix:** update `docs/stockpilot/ROADMAP.md` (incl. §2.5 if deployment-related).
