# Hire-an-Analyst Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox steps.

**Goal:** One-click "Hire an Analyst" that creates a finance-persona agent (skill pre-attached + chosen brain) via the existing `agent-hires` endpoint — after seeding the 6 finance skills into the installable catalog.

**Architecture:** (1) seed `catalog/optional/finance/<slug>/SKILL.md` + regenerate manifest; (2) pure persona catalog (UI); (3) Hire dialog composing `apiKeysApi` + `ApiKeysWizard` + the `agent-hires` endpoint; (4) sidebar entry.

**Spec:** `docs/superpowers/specs/2026-06-03-hire-an-analyst-design.md`

---

### Task 1: Seed the 6 finance skills into the catalog

**Files:**
- Create: `packages/skills-catalog/catalog/optional/finance/{equity-analyst,news-sentinel,portfolio-manager,macro-researcher,quant-analyst,earnings-scout}/SKILL.md`
- Regenerate: `packages/skills-catalog/generated/catalog.json` (via script)

- [ ] **Step 1: Read source + an example catalog skill**
  Read each `skills/<slug>/skill.md` (the existing content for equity-analyst, news-sentinel, portfolio-manager, macro-researcher, quant-analyst, earnings-scout) and one existing catalog file `packages/skills-catalog/catalog/optional/content/release-announcement/SKILL.md` for the exact frontmatter shape.

- [ ] **Step 2: Create the 6 catalog SKILL.md files**
  For each slug, create `packages/skills-catalog/catalog/optional/finance/<slug>/SKILL.md` with frontmatter then the body copied/adapted from `skills/<slug>/skill.md`:
  ```
  ---
  name: <slug>
  description: <one concise line — see mapping below>
  key: paperclipai/optional/finance/<slug>
  recommendedForRoles:
    - researcher
  tags:
    - finance
    - analyst
    - <persona tag>
  ---

  <body from skills/<slug>/skill.md>
  ```
  Descriptions (use these):
  - equity-analyst: "Produce deep fundamental research on individual stocks with a clear BUY/HOLD/SELL recommendation."
  - news-sentinel: "Monitor and summarize market-moving news and sentiment for tracked tickers."
  - portfolio-manager: "Review portfolio holdings, allocation, and risk; surface actionable observations (not advice)."
  - macro-researcher: "Analyze macro conditions (rates, inflation, growth) and their impact on markets and sectors."
  - quant-analyst: "Run quantitative/statistical analysis on prices and factors to find signals and anomalies."
  - earnings-scout: "Track upcoming earnings, estimates, and post-report reactions for tracked tickers."
  Tags per persona: equity-analyst→[finance,analyst,fundamental]; news-sentinel→[finance,analyst,news]; portfolio-manager→[finance,analyst,portfolio]; macro-researcher→[finance,analyst,macro]; quant-analyst→[finance,analyst,quant]; earnings-scout→[finance,analyst,earnings].
  If a `skills/<slug>/skill.md` body is missing, write a short body matching the description (3–6 lines of responsibilities + output format).

- [ ] **Step 3: Regenerate + validate the manifest**
  Run: `pnpm --filter @paperclipai/skills-catalog build:manifest`
  Expected: "Wrote generated/catalog.json with 15 catalog skills." (9 + 6). Then `pnpm --filter @paperclipai/skills-catalog build` and `pnpm --filter @paperclipai/skills-catalog test` → PASS. If `validate` exists, run `pnpm --filter @paperclipai/skills-catalog validate`.

- [ ] **Step 4: Verify the keys are present**
  Run: `node -e "const c=require('./packages/skills-catalog/generated/catalog.json'); console.log(c.skills.filter(s=>s.key.includes('finance')).map(s=>s.key))"`
  Expected: the 6 `paperclipai/optional/finance/<slug>` keys.

- [ ] **Step 5: Commit**
  ```bash
  git add packages/skills-catalog/catalog/optional/finance packages/skills-catalog/generated/catalog.json
  git commit -m "feat(skills): add 6 finance analyst skills to the catalog

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 2: Persona catalog (pure) + tests

**Files:**
- Create: `ui/src/lib/analystPersonas.ts`
- Test: `ui/src/lib/analystPersonas.test.ts`

- [ ] **Step 1: Failing test**
  ```ts
  import { describe, it, expect } from "vitest";
  import { ANALYST_PERSONAS } from "./analystPersonas";
  describe("ANALYST_PERSONAS", () => {
    it("has 6 unique personas with catalog keys", () => {
      expect(ANALYST_PERSONAS).toHaveLength(6);
      const ids = ANALYST_PERSONAS.map((p) => p.id);
      expect(new Set(ids).size).toBe(6);
      for (const p of ANALYST_PERSONAS) {
        expect(p.skillKey).toBe(`paperclipai/optional/finance/${p.id}`);
        expect(p.name.length).toBeGreaterThan(0);
        expect(p.blurb.length).toBeGreaterThan(0);
        expect(p.role.length).toBeGreaterThan(0);
      }
    });
  });
  ```
- [ ] **Step 2:** Run `pnpm --filter @paperclipai/ui exec vitest run src/lib/analystPersonas.test.ts` → FAIL.
- [ ] **Step 3: Implement** `ui/src/lib/analystPersonas.ts`:
  ```ts
  export interface AnalystPersona {
    id: string; name: string; blurb: string; skillKey: string; role: string; icon?: string;
  }
  function persona(id: string, name: string, blurb: string): AnalystPersona {
    return { id, name, blurb, skillKey: `paperclipai/optional/finance/${id}`, role: "researcher" };
  }
  export const ANALYST_PERSONAS: AnalystPersona[] = [
    persona("equity-analyst", "Equity Analyst", "Deep fundamental research on individual stocks with a BUY/HOLD/SELL call."),
    persona("news-sentinel", "News Sentinel", "Monitors and summarizes market-moving news + sentiment for your tickers."),
    persona("portfolio-manager", "Portfolio Manager", "Reviews holdings, allocation, and risk; surfaces actionable observations."),
    persona("macro-researcher", "Macro Researcher", "Analyzes rates, inflation, and growth and their impact on markets."),
    persona("quant-analyst", "Quant Analyst", "Quantitative/statistical analysis on prices and factors to find signals."),
    persona("earnings-scout", "Earnings Scout", "Tracks upcoming earnings, estimates, and post-report reactions."),
  ];
  ```
  > Confirm `role: "researcher"` is a valid agent role (`AGENT_ROLES` in `@paperclipai/shared`). If "researcher" is not valid, use "general".
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add ui/src/lib/analystPersonas.ts ui/src/lib/analystPersonas.test.ts
  git commit -m "feat(agents): analyst persona catalog (UI)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 3: Hire dialog + agents API hire method + sidebar entry

**Files:**
- Modify: `ui/src/api/agents.ts` (add a `hire` method if missing)
- Create: `ui/src/components/HireAnalystDialog.tsx`
- Modify: `ui/src/components/Sidebar.tsx` (and/or `SidebarAgents.tsx`) to add the button

- [ ] **Step 1: Learn the patterns**
  READ: `ui/src/api/agents.ts` (does a hire/create method exist? the endpoint is `POST /companies/:companyId/agent-hires`); `ui/src/pages/NewAgent.tsx` (adapter list via `listUIAdapters`/`../adapters`, per-adapter default model, how it builds `adapterType`/`adapterConfig`); `ui/src/components/ApiKeysWizard.tsx` (props `{ open, onOpenChange, companyId, onDone? }`); `ui/src/api/apiKeys.ts` (`apiKeysApi.list`); `queryKeys` for agents + apiKeys; `useToastActions`; how `NewAgent`/agents pages navigate to an agent detail after create; and how `Sidebar.tsx`/`SidebarAgents.tsx` render the "Your Analysts" section.

- [ ] **Step 2: Add `agentsApi.hire`** (if not present) in `ui/src/api/agents.ts`:
  ```ts
  hire: (companyId: string, data: Record<string, unknown>) =>
    api.post(`/companies/${encodeURIComponent(companyId)}/agent-hires`, data),
  ```
  (Match the file's existing method style/return typing.)

- [ ] **Step 3: Build `ui/src/components/HireAnalystDialog.tsx`**
  Props `{ open: boolean; onOpenChange: (v: boolean) => void; companyId: string; onHired: (agentId: string) => void }`.
  - `keysQuery = useQuery(queryKeys.apiKeys.list(companyId), () => apiKeysApi.list(companyId), { enabled: open })` → connected names.
  - View A: gallery of `ANALYST_PERSONAS` cards (name + blurb). Select → View B.
  - View B: editable `name` (default = persona.name); **adapter** picker + **model** (reuse NewAgent's adapter source + default-model-per-adapter logic — import the same helpers/list; do NOT hardcode a private list). Default the adapter to one whose provider key is connected if you can map it (e.g. `ai.anthropic` present → a Claude adapter), else the app default. If NO `ai.*` key is connected, show a notice "Connect an AI key so your analyst has a brain" + a "Connect API keys" button that opens `<ApiKeysWizard ... />` inline; on its `onDone`/close, refetch `keysQuery`. Still allow "Hire" (managed keys may exist for subscribers).
  - Hire button → `agentsApi.hire(companyId, { name, role: persona.role, icon: persona.icon, desiredSkills: [persona.skillKey], adapterType, adapterConfig })`. On success: invalidate the agents list query, toast success, `onHired(newAgent.id)`, close. On error: toast the message, stay open.
  - Reuse `@/components/ui/dialog`, Button, Input, Select; match existing dialog styling.

- [ ] **Step 4: Add the "Hire an Analyst" entry**
  In `Sidebar.tsx` (the `SidebarAgents`/"Your Analysts" area) add a "Hire an Analyst" button that opens the dialog. Manage `open` state where it's cleanest; pass `companyId={selectedCompanyId!}`; `onHired={(id) => navigate to the agent detail using the existing pattern}`.

- [ ] **Step 5: Build**
  Run: `pnpm --filter @paperclipai/ui build` → PASS. Fix all type errors (adapter config shape, toast signature, nav).

- [ ] **Step 6: Commit**
  ```bash
  git add ui/src/api/agents.ts ui/src/components/HireAnalystDialog.tsx ui/src/components/Sidebar.tsx ui/src/components/SidebarAgents.tsx
  git commit -m "feat(agents): Hire-an-Analyst dialog wired to agent-hires endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 4: Verify + roadmap

- [ ] **Step 1:** `pnpm --filter @paperclipai/ui exec vitest run src/lib/analystPersonas.test.ts && pnpm --filter @paperclipai/ui build && pnpm --filter @paperclipai/skills-catalog build` → all PASS.
- [ ] **Step 2:** In `docs/stockpilot/ROADMAP.md` §7c mark **N1 ✅ done** (catalog-seeded finance skills + Hire-an-Analyst dialog). Note follow-ups: hire a whole team at once; richer adapter↔key validation.
- [ ] **Step 3:** Commit `docs: mark Hire-an-Analyst done (N1)`.

---

## Self-Review notes
- **Spec coverage:** catalog seeding (Task 1), persona data (Task 2), dialog + adapter/model + connect-key + hire endpoint + entry (Task 3), verify+docs (Task 4). Covered.
- **Consistency:** `skillKey = paperclipai/optional/finance/<id>` identical in Task 1 (catalog `key`), Task 2 (persona), Task 3 (`desiredSkills`). Hire payload matches `createAgentHireSchema` fields.
- **Risks/notes:** confirm `role: "researcher"` ∈ AGENT_ROLES (else "general"); reuse NewAgent's real adapter list rather than hardcoding; the server `agent-hires` enforces finance-role/tier + adapter validity — surface its errors rather than pre-validating.
