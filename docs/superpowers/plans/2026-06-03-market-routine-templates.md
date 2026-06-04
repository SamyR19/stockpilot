# Market Routine Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One-click finance routine presets that create a routine + schedule trigger from the existing routine APIs.

**Architecture:** A pure template catalog + draft-builder (unit-tested), and a "New from template" dialog wired into `Routines.tsx` that composes `routinesApi.create` + `routinesApi.createTrigger`. No backend changes.

**Tech Stack:** React 19 + Vite, React Query v5, shadcn/ui Dialog, existing `routinesApi` (`ui/src/api/routines.ts`).

**Spec:** `docs/superpowers/specs/2026-06-03-market-routine-templates-design.md`

---

### Task 1: Template catalog + draft builder + unit tests

**Files:**
- Create: `ui/src/lib/routineTemplates.ts`
- Test: `ui/src/lib/routineTemplates.test.ts`

- [ ] **Step 1: Write the failing test**

Create `ui/src/lib/routineTemplates.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ROUTINE_TEMPLATES, buildRoutineDraftFromTemplate } from "./routineTemplates";

describe("ROUTINE_TEMPLATES", () => {
  it("has unique ids", () => {
    const ids = ROUTINE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("every template has a 5-field cron and non-empty prompt", () => {
    for (const t of ROUTINE_TEMPLATES) {
      expect(t.cronExpression.trim().split(/\s+/)).toHaveLength(5);
      expect(t.promptBody.trim().length).toBeGreaterThan(0);
      expect(t.timezone.trim().length).toBeGreaterThan(0);
    }
  });
  it("buildRoutineDraftFromTemplate maps title + description", () => {
    const t = ROUTINE_TEMPLATES[0];
    expect(buildRoutineDraftFromTemplate(t)).toEqual({ title: t.defaultTitle, description: t.promptBody });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `pnpm --filter @paperclipai/ui exec vitest run src/lib/routineTemplates.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the catalog**

Create `ui/src/lib/routineTemplates.ts`:
```ts
export interface RoutineTemplate {
  id: string;
  name: string;
  blurb: string;
  roleHint: string;
  defaultTitle: string;
  promptBody: string;
  cronExpression: string;
  timezone: string;
  scheduleLabel: string;
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    id: "daily-watchlist-briefing",
    name: "Daily watchlist briefing",
    blurb: "Overnight news + notable moves for your watchlist, every market morning.",
    roleHint: "Best with a News Sentinel agent",
    defaultTitle: "Daily watchlist briefing",
    promptBody:
      "Every weekday morning, review the user's watchlist tickers. Summarize the most important overnight news, pre-market moves, and notable price/volume changes for each. Produce a concise briefing (bullet points per ticker, then a short overall summary). Flag anything that may need the user's attention.",
    cronExpression: "0 8 * * 1-5",
    timezone: "America/New_York",
    scheduleLabel: "Weekdays 8:00am ET",
  },
  {
    id: "weekly-portfolio-review",
    name: "Weekly portfolio review",
    blurb: "Review your holdings and flag movers + allocation drift, every Monday.",
    roleHint: "Best with a Portfolio analyst agent",
    defaultTitle: "Weekly portfolio review",
    promptBody:
      "Once a week, review the user's current portfolio holdings. Identify the biggest gainers and losers over the past week, note any meaningful changes in allocation or concentration risk, and summarize the portfolio's overall posture. Provide a short, actionable review (not financial advice).",
    cronExpression: "0 7 * * 1",
    timezone: "America/New_York",
    scheduleLabel: "Mondays 7:00am ET",
  },
  {
    id: "earnings-watch",
    name: "Earnings watch",
    blurb: "Surface upcoming earnings for your watchlist + holdings, with what to watch.",
    roleHint: "Works with any research agent",
    defaultTitle: "Earnings watch",
    promptBody:
      "Each weekday, list the user's watchlist and holdings tickers that report earnings within the next 7 days. For each, note the report date and the key things to watch (estimates, recent guidance, prior surprises). Keep it brief and scannable.",
    cronExpression: "30 7 * * 1-5",
    timezone: "America/New_York",
    scheduleLabel: "Weekdays 7:30am ET",
  },
];

export function buildRoutineDraftFromTemplate(t: RoutineTemplate): { title: string; description: string } {
  return { title: t.defaultTitle, description: t.promptBody };
}
```

- [ ] **Step 4: Run test, verify PASS**

Run: `pnpm --filter @paperclipai/ui exec vitest run src/lib/routineTemplates.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/routineTemplates.ts ui/src/lib/routineTemplates.test.ts
git commit -m "feat(routines): finance routine template catalog + draft builder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: "New from template" dialog + wire into Routines page

**Files:**
- Create: `ui/src/components/NewRoutineFromTemplateDialog.tsx`
- Modify: `ui/src/pages/Routines.tsx`

- [ ] **Step 1: Read the integration points**

READ `ui/src/pages/Routines.tsx` fully and note: how it imports/uses `routinesApi`, how it gets `selectedCompanyId` (`useCompany()`), how it lists the company's **agents** (find the agents query/source — there must be one for the assignee dropdown; if none exists on this page, use `agentsApi.list(companyId)` from `ui/src/api/agents.ts`), how it shows **toasts**, how it **invalidates** the routines list query (queryKey), and how it **navigates** to a routine detail after create (`createIssueDetailLocationState`/router). Reuse all of these.

- [ ] **Step 2: Build the dialog component**

Create `ui/src/components/NewRoutineFromTemplateDialog.tsx`. Requirements (use the existing `Dialog`, `Button`, `Input`, `Select`, `Textarea` from `@/components/ui/*` and match `Routines.tsx` styling):
- Props: `{ open, onOpenChange, companyId, agents, onCreated(routineId) }` where `agents` is the list already available in `Routines.tsx` (id + display name).
- State: `selectedTemplateId | null`, editable `title`, editable `description`, `assigneeAgentId`.
- View A (no template selected): a list of cards from `ROUTINE_TEMPLATES` (name, blurb, scheduleLabel, roleHint). Clicking a card selects it and prefills `title`/`description` via `buildRoutineDraftFromTemplate`.
- View B (template selected): editable `title` input, `description` textarea (prefilled), assignee `Select` (options = `agents`), read-only schedule line showing `template.scheduleLabel`, a "Back" button, and a "Create routine" submit button (disabled while submitting or if no assignee selected — if agents list is empty, show guidance text "Create an agent first" and disable submit).
- On submit:
```ts
const routine = await routinesApi.create(companyId, { title, description, assigneeAgentId });
try {
  await routinesApi.createTrigger(routine.id, {
    kind: "schedule",
    cronExpression: template.cronExpression,
    timezone: template.timezone,
    label: template.name,
  });
} catch (err) {
  // routine created but schedule failed — tell the user to add it in detail view
  toast.error("Routine created, but the schedule couldn't be added. Open it and add a trigger.");
}
onCreated(routine.id);
onOpenChange(false);
```
Use the exact `toast` API the page already uses. Type the `routinesApi` responses as the file already does (`Routine` has an `id`).

- [ ] **Step 3: Wire into Routines.tsx**

- Add a **"New from template"** button next to the existing create action.
- Add state `const [templateDialogOpen, setTemplateDialogOpen] = useState(false)`.
- Render `<NewRoutineFromTemplateDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} companyId={selectedCompanyId!} agents={<the agents list already in this page>} onCreated={(routineId) => { /* invalidate routines list query (same queryKey the page uses) + navigate to the routine detail using the page's existing nav pattern */ }} />`.
- If the page does not already load agents, add an `agentsApi.list(selectedCompanyId)` query (enabled on `selectedCompanyId`) and pass its data.

- [ ] **Step 4: Build**

Run: `pnpm --filter @paperclipai/ui build`
Expected: PASS (`tsc -b && vite build`). Fix any type errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/NewRoutineFromTemplateDialog.tsx ui/src/pages/Routines.tsx
git commit -m "feat(routines): New-from-template dialog on Routines page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verify + roadmap update

**Files:**
- Modify: `docs/stockpilot/ROADMAP.md`

- [ ] **Step 1: Run UI test + build**

Run: `pnpm --filter @paperclipai/ui exec vitest run src/lib/routineTemplates.test.ts && pnpm --filter @paperclipai/ui build`
Expected: test PASS, build PASS.

- [ ] **Step 2: Update roadmap**

In `docs/stockpilot/ROADMAP.md` §7b, mark item 2 ✅ done (finance routine templates on the existing routine engine: catalog + New-from-template dialog). Note out-of-scope follow-ups (in-dialog cron editing, auto-create agent, server-side custom templates).

- [ ] **Step 3: Commit**

```bash
git add docs/stockpilot/ROADMAP.md
git commit -m "docs: mark market routine templates done (queue item #2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes
- **Spec coverage:** catalog + builder (Task 1), dialog + wiring + compose create/trigger + error handling (Task 2), verify + docs (Task 3). Covered.
- **Consistency:** `buildRoutineDraftFromTemplate` returns `{title, description}` (Task 1) consumed in Task 2. `routinesApi.create`/`createTrigger` signatures match `ui/src/api/routines.ts`. Trigger payload matches `createRoutineTriggerSchema` (`kind:"schedule", cronExpression, timezone, label`).
- **Execution note:** Task 2 is integration-heavy — the subagent MUST read `Routines.tsx` and reuse its agent-list/toast/invalidate/nav patterns rather than inventing new ones.
