# Hire-an-Analyst Flow — Design Spec

**Date:** 2026-06-03 · **Status:** Approved (owner) · **Initiative:** N1

## Problem
You can't easily create your "Wall Street employees." Agent creation shows generic Paperclip roles (CEO/CTO/…), and the 6 finance personas exist only as raw `skills/<persona>/skill.md` files that are **not in the installable skills catalog**, so nothing can attach them. Goal: a one-click "Hire an Analyst" flow that creates an agent pre-wired with the right finance skill + brain.

## What already exists (reuse, don't rebuild)
- **Backend hire endpoint:** `POST /companies/:companyId/agent-hires` (`createAgentHireSchema` = `createAgentSchema` + `sourceIssueId?`) with **finance-role gating** (`assertFinanceRoleAllowed`). Fields used: `name`, `role`, `icon?`, `desiredSkills: string[]` (skill keys), `adapterType`, `adapterConfig` (model, etc.).
- **Skills catalog:** `packages/skills-catalog/catalog/<kind>/<category>/<slug>/SKILL.md` → regenerated to `generated/catalog.json` via `pnpm --filter @paperclipai/skills-catalog build:manifest`. SKILL.md frontmatter: `name`, `description`, `key` (e.g. `paperclipai/optional/finance/equity-analyst`), `recommendedForRoles`, `tags`. Catalog served at `GET /skills/catalog`; `companySkillsApi` installs into a company.
- **Adapter/model selection** patterns live in `ui/src/pages/NewAgent.tsx` (`listUIAdapters`, per-adapter default model). **BYO-keys wizard:** `ui/src/components/ApiKeysWizard.tsx`. **Connected keys:** `apiKeysApi.list(companyId)` → names like `ai.anthropic`.

## Components

### 1. Seed the 6 finance skills into the catalog (the missing plumbing)
Create `packages/skills-catalog/catalog/optional/finance/<slug>/SKILL.md` for: **equity-analyst, news-sentinel, portfolio-manager, macro-researcher, quant-analyst, earnings-scout**. Body = the existing `skills/<slug>/skill.md` content (adapted to SKILL.md). Frontmatter per file:
```
name: <slug>
description: <one-line of what the analyst does>
key: paperclipai/optional/finance/<slug>
recommendedForRoles: [researcher]
tags: [finance, analyst, <persona-specific>]
```
Then regenerate the manifest. Catalog count goes 9 → 15. This makes the skills attachable via `desiredSkills`.

### 2. Persona catalog (pure UI data) — `ui/src/lib/analystPersonas.ts`
```ts
export interface AnalystPersona {
  id: string;            // slug
  name: string;          // "Equity Analyst"
  blurb: string;         // one line for the gallery
  skillKey: string;      // "paperclipai/optional/finance/<slug>"
  role: string;          // agent role to create with (default "researcher")
  icon?: string;         // optional AGENT_ICON name
}
export const ANALYST_PERSONAS: AnalystPersona[]   // the 6
```
Unit-tested: 6 entries, unique ids, skillKey matches the catalog key pattern.

### 3. Hire dialog — `ui/src/components/HireAnalystDialog.tsx`
- Props `{ open, onOpenChange, companyId, onHired(agentId) }`.
- **View A (gallery):** the 6 personas as cards (name + blurb). Select one → View B.
- **View B (configure):** editable name (prefilled = persona name), a **brain/adapter picker** and **model** (reuse NewAgent's adapter list + per-adapter default-model logic), and key handling:
  - On open, read `apiKeysApi.list(companyId)`. Default the adapter to one whose provider key is connected if detectable (e.g. `ai.anthropic` → a Claude adapter); otherwise default to the app's standard default adapter.
  - If **no AI key connected**, show a clear notice + a **"Connect API keys"** button that opens the existing `ApiKeysWizard` inline; after it closes, refresh the keys list. (Still allow proceeding — backend/tier may provide managed keys for subscribers — but nudge.)
  - Allow switching adapter/model freely (this covers "quickly change if multiple connected").
- **Hire:** `POST /companies/:companyId/agent-hires` with `{ name, role: persona.role, icon: persona.icon, desiredSkills: [persona.skillKey], adapterType, adapterConfig: { model, ... } }` via the agents API client (add a `hire` method if missing). On success → invalidate the agents list query → toast → `onHired(agentId)` (navigate to the new agent's detail).
- Errors (e.g. finance-role gated by tier, or adapter invalid) → toast, stay open.

### 4. Entry point
A **"Hire an Analyst"** button in the *Your Analysts* sidebar section header (or near the agents list), opening the dialog.

## Out of scope (v1)
- Auto-creating/sequencing a whole team at once (one analyst per hire).
- Deep adapter↔key validation (we surface "connect a key" but trust the backend's adapter/tier checks).
- Editing persona skill content in-app.

## Testing
- `analystPersonas.test.ts` (6, unique, key pattern). 
- Catalog regeneration verified: `generated/catalog.json` contains the 6 finance keys (a skills-catalog test or assertion).
- `pnpm --filter @paperclipai/ui build` + `pnpm --filter @paperclipai/skills-catalog build` pass.
- Manual acceptance: Hire an Analyst → Equity Analyst → (connect key if needed) → Create → lands on the new agent, which has the equity-analyst skill attached.

## Success criteria
From the sidebar, one click hires a named analyst agent pre-wired with the matching finance skill and a working brain; the skill actually attaches (because it's now in the catalog); the UI/catalog build clean.
