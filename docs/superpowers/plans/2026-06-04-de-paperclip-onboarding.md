# De-Paperclip Onboarding & Agent Framing (N2) — Plan

> Execute subagent-driven. Owner-approved scope (option A): reframe first-run copy to finance, default first agent away from "CEO", and **relabel the `ceo` role's display to "Research Lead" while keeping the underlying `ceo` role + its permissions intact** (it grants `canCreateAgents`/task-assign — see `agent-permissions.ts`). No permission/behavior change; copy + one label only.

**Goal:** New users see a finance research product, not a "run an AI startup" product — without touching the load-bearing role/permission model.

---

### Task 1: Relabel the CEO role + de-CEO the first-agent defaults

**Files:**
- Modify: `packages/shared/src/constants.ts` (the `AGENT_ROLE_LABELS` map)
- Modify: `ui/src/pages/NewAgent.tsx`

- [ ] **Step 1 — relabel.** In `packages/shared/src/constants.ts`, change the `AGENT_ROLE_LABELS` entry `ceo: "CEO"` → `ceo: "Research Lead"`. DO NOT change the enum value/key `ceo` anywhere (it is load-bearing for permissions). Only the display string changes.
- [ ] **Step 2 — first-agent defaults.** In `ui/src/pages/NewAgent.tsx`: the first agent still uses `role: "ceo"` (keep — preserves permissions), but change the default **name/title** from `"CEO"` to `"Research Lead"` (lines ~108-109: `if (!name) setName("Research Lead"); if (!title) setTitle("Research Lead");`). Leave the rest of the first-agent logic intact.
- [ ] **Step 3 — build.** `pnpm --filter @paperclipai/shared build && pnpm --filter @paperclipai/ui build` → PASS. (The label feeds `roleLabels`; the role picker + agent detail will now read "Research Lead".)
- [ ] **Step 4 — commit.**
  ```bash
  git add packages/shared/src/constants.ts ui/src/pages/NewAgent.tsx
  git commit -m "feat(agents): relabel CEO role -> Research Lead; de-CEO first-agent name defaults (keep role mechanism)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 2: Reframe the onboarding wizard copy to finance

**Files:**
- Modify: `ui/src/components/OnboardingWizard.tsx`

- [ ] **Step 1 — read** `ui/src/components/OnboardingWizard.tsx` fully. It currently frames first-run as a startup: `DEFAULT_TASK_DESCRIPTION` (~line 67) says *"You are the CEO. You set the direction for the company. - hire a founding engineer …"*; `agentName` defaults to `"CEO"` (~line 114); state/labels say "company name / company goal".
- [ ] **Step 2 — reframe copy (strings only; do NOT rename state variables or change the data being created, just the user-facing text + defaults):**
  - `DEFAULT_TASK_DESCRIPTION` → a finance research brief, e.g.:
    ```
    You are the research lead. Set the direction for the research workspace.
    A good first move:
    - hire an Equity Analyst to research a stock you care about
    - add a few tickers to the watchlist to track
    - request a short briefing on the current market
    ```
  - `agentName` default `"CEO"` → `"Research Lead"`.
  - Any user-visible **"company"** wording → **"workspace"** (e.g. "Name your company" → "Name your workspace"; "company goal" label → "workspace goal"). Keep variable names like `companyName`/`companyGoal`/`createdCompanyId` AS-IS (renaming them is out of scope and risky) — only change the displayed text.
  - Replace any "hire a founding engineer / employees / build your team to ship product" startup language with finance equivalents (hire analysts, track tickers, get research).
  - If a step explicitly explains the "AI company" concept, reframe to "your AI research workspace / your team of analysts."
- [ ] **Step 3 — build.** `pnpm --filter @paperclipai/ui build` → PASS. Also run the onboarding test if present: `pnpm --filter @paperclipai/ui exec vitest run src/components/OnboardingWizard.test.tsx` (if it asserts old copy strings, update those assertions to the new finance copy and note it).
- [ ] **Step 4 — commit.**
  ```bash
  git add ui/src/components/OnboardingWizard.tsx
  git commit -m "feat(onboarding): reframe first-run wizard to finance (workspace + analysts, not company + CEO)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 3: Verify + roadmap

- [ ] `pnpm --filter @paperclipai/shared build && pnpm --filter @paperclipai/ui build` → PASS. Grep check: `grep -rn '"CEO"' ui/src | grep -viE "test"` should no longer show first-run defaults (org-chart internal `"ceo"` value refs are fine).
- [ ] In `docs/stockpilot/ROADMAP.md` §7c mark **N2 ✅ done** (copy reframe + CEO→Research Lead relabel; role/permission mechanism unchanged; deeper CEO removal = option B, deferred).
- [ ] Commit `docs: mark de-Paperclip onboarding done (N2)`.

---

## Notes
- **Do not** change the `ceo` enum value, `role === "ceo"` checks, or any permission logic. Option B (removing the CEO concept) is explicitly deferred.
- Keep changes to **display strings + first-agent name defaults + one role label**. Reversible.
