# CLAUDE.md — StockPilot AI

This repo is **StockPilot AI**, a finance product forked from Paperclip. Note: the older root `AGENTS.md` and `doc/*.md` describe the *original Paperclip* — they are reference, not the current product definition.

## 🛑 Read before building anything

Before starting a plan, adding a feature, or making a non-trivial change, read:

1. **`docs/stockpilot/ROADMAP.md`** — single source of truth: plan sequence, current status, feature diff vs Paperclip, architecture & conventions, design system, open questions. **Update it after finishing a plan or notable change.**
2. **`docs/stockpilot/PROJECT_GOALS.md`** — what StockPilot is and the principles that filter every decision (read-only, never trades; additive over destructive; one codebase / two modes).
3. **`docs/stockpilot/PAPERCLIP_REFERENCE.md`** — module/page inventory of the forked Paperclip code, with keep / reconsider / finance dispositions.

Design spec: `docs/superpowers/specs/2026-05-31-stockpilot-ai-design.md`. Plans: `docs/superpowers/plans/`.

## Working conventions

- **Plans:** write with `superpowers:writing-plans`; execute with `superpowers:subagent-driven-development` (owner always wants subagent-driven — don't ask which approach).
- **Never** add a feature that could place, modify, or cancel a trade. StockPilot is strictly read-only.
- **New board UI page?** Add its route root to `BOARD_ROUTE_ROOTS` in `ui/src/lib/company-routes.ts` (company-prefixed routing).
- **Changed a linked workspace package** (e.g. `packages/market-data`)? Restart the server — tsx only watches `server/src`.
- **Commits:** author `Samy Rabah <samyrabah@icloud.com>`; add `Co-Authored-By: Claude ...`. Push to `main`.
- **After finishing a plan/feature/fix:** update `docs/stockpilot/ROADMAP.md`.
