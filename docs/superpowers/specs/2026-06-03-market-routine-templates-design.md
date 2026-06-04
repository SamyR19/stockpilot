# Market Routine Templates — Design Spec

**Date:** 2026-06-03 · **Status:** Approved (owner chose option A) · **Queue item:** #2 of 8

## Problem
StockPilot already has a full routine engine + builder (`routines` table, triggers, `routineService.tickScheduledTriggers`, `Routines.tsx`/`RoutineDetail.tsx`). What's missing is the **finance on-ramp**: standing up a useful market routine today means hand-filling a generic form. We add **finance routine templates** — one-click presets that pre-configure a routine + schedule trigger for common market workflows.

## Approach
Pure **client-side composition** of existing APIs — no new backend, no new tables.
- `routinesApi.create(companyId, { title, description, assigneeAgentId })` — the agent's natural-language instructions live in `description`.
- `routinesApi.createTrigger(routineId, { kind: "schedule", cronExpression, timezone })` — the schedule.

## Components

### 1. Template catalog (pure data) — `ui/src/lib/routineTemplates.ts`
```ts
export interface RoutineTemplate {
  id: string;            // stable slug
  name: string;          // "Daily watchlist briefing"
  blurb: string;         // one-line description for the picker
  roleHint: string;      // suggested finance agent role, shown as guidance
  defaultTitle: string;  // prefilled routine title
  promptBody: string;    // prefilled `description` (the agent instructions)
  cronExpression: string;
  timezone: string;      // default "America/New_York"
  scheduleLabel: string; // human text e.g. "Weekdays 8:00am ET"
}
export const ROUTINE_TEMPLATES: RoutineTemplate[]
```
v1 templates:
1. **Daily watchlist briefing** — News Sentinel; `0 8 * * 1-5` ET; instructions: summarize overnight news + notable moves for the user's watchlist tickers, post a concise briefing.
2. **Weekly portfolio review** — Portfolio analyst; `0 7 * * 1` ET; review current holdings, flag big movers / allocation drift.
3. **Earnings watch** — `30 7 * * 1-5` ET; list watchlist/holdings tickers reporting earnings in the next 7 days and what to watch.

A pure helper `buildRoutineDraftFromTemplate(t)` returns `{ title, description }` for `routinesApi.create`. Unit-tested (deterministic, no I/O).

### 2. "New from template" flow — `ui/src/components/NewRoutineFromTemplateDialog.tsx` + wire into `ui/src/pages/Routines.tsx`
- A button "New from template" near the existing "New Routine" action on `Routines.tsx`.
- Dialog: list template cards (name + blurb + scheduleLabel + roleHint). Selecting one shows an editable mini-form: **title**, **instructions** (`description`, prefilled, editable textarea), **assignee agent** (dropdown of the company's existing agents — reuse however `Routines.tsx`/agents API already lists agents), and the **schedule** (shown read-only as `scheduleLabel`; advanced cron edit out of scope for v1 — user can edit the trigger later in RoutineDetail).
- On submit: `await routinesApi.create(companyId, { title, description, assigneeAgentId })` → then `await routinesApi.createTrigger(routine.id, { kind: "schedule", cronExpression: t.cronExpression, timezone: t.timezone, label: t.name })` → invalidate the routines list query → toast "Routine created from template" → navigate to the new RoutineDetail (reuse existing nav pattern).
- Error handling: if trigger creation fails after routine creation, surface a toast telling the user the routine was created but the schedule wasn't (so they can add it in RoutineDetail) — no orphaned silent failure.

## Reuse / consistency
- Use the existing `Dialog` component, the existing `routinesApi`, the existing agent-list source, the existing toast + query-invalidation patterns already in `Routines.tsx`. Do not restyle existing UI.

## Out of scope (v1)
- Editing the cron in the dialog (do it in RoutineDetail afterward).
- Auto-creating a finance agent if none exists (user picks an existing agent; if they have none, show guidance to create one first).
- Server-side template catalog / per-company custom templates.

## Testing
- Unit: `routineTemplates.test.ts` — catalog integrity (unique ids, valid 5-field cron strings, non-empty prompts) + `buildRoutineDraftFromTemplate` output.
- Build: `pnpm --filter @paperclipai/ui build` passes.
- Manual acceptance: "New from template" → pick "Daily watchlist briefing" → choose an agent → Create → lands on RoutineDetail with a schedule trigger present.

## Success criteria
Creating a routine from a template produces a routine + an enabled schedule trigger using only existing endpoints; the routines list shows it; the UI builds clean.
