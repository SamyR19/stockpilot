# Alert Evaluation Engine — Design Spec

**Date:** 2026-06-03
**Status:** Approved (owner, defaults accepted)
**Work-queue item:** #1 of 8 (see `docs/stockpilot/ROADMAP.md` §7b)

## Problem

StockPilot lets users create `alert_rules` (Alerts UI), but nothing evaluates them — `alert_events` are never produced. "Price alerts" are a core product promise and currently do not fire. This builds the engine that turns active rules into events on a schedule, and surfaces fired events in the UI.

## Existing surface (do not change shape)

- **`alert_rules`** (`packages/db/src/schema/alert_rules.ts`): `id, companyId, ticker, conditionType, threshold (text), agentId?, active, createdAt`. `conditionType ∈ {price_above, price_below, percent_change, volume_spike, earnings_date}` (DB check constraint).
- **`alert_events`** (`packages/db/src/schema/alert_events.ts`): `id, ruleId, companyId, ticker, triggeredAt, value (text), notified (bool)`.
- **`MarketDataClient.getQuote(ticker)`** → `StockQuote { price, change, changePercent, volume, ... }` (`packages/market-data`). Tier-aware provider selection already exists.
- **Scheduler:** `server/src/index.ts` runs a `setInterval` (gated by `config.heartbeatSchedulerEnabled`, period `config.heartbeatSchedulerIntervalMs`) that calls `heartbeat.tickTimers` and `routines.tickScheduledTriggers`. The alert engine hooks in here.
- Alerts route: `server/src/routes/alerts.ts` (rule CRUD; `ALERT_CONDITION_TYPES`, `NUMERIC_THRESHOLD_CONDITIONS` defined inline).

## Architecture

One new service, plus a thin route + UI section. No new infrastructure.

### 1. Pure evaluator (isolated, unit-tested)
`server/src/services/alert-evaluator.ts`
```
evaluateRule(rule, ctx): { fired: boolean; value: string | null }
```
- `ctx = { quote?: StockQuote; earnings?: EarningsEvent[]; volumeBaseline?: number; now: Date }`
- No DB, no network — pure function over inputs. This is the testable core.
- Logic per condition:
  - `price_above`: `quote.price >= Number(threshold)` → value = price
  - `price_below`: `quote.price <= Number(threshold)` → value = price
  - `percent_change`: `Math.abs(quote.changePercent) >= Number(threshold)` → value = changePercent
  - `earnings_date`: any earnings `reportDate` within `Number(threshold ?? 7)` days from `now` → value = reportDate ISO
  - `volume_spike`: if `volumeBaseline` available and `quote.volume >= Number(threshold) * volumeBaseline` → value = volume; if no baseline, return `{ fired: false }` (never false-fire)
- Invalid/missing threshold or missing data → `{ fired: false, value: null }`.

### 2. Engine service (orchestration)
`server/src/services/alert-engine.ts` → `alertEngine(db, { marketClient }).tick(now)`
- Load **active** rules across all companies.
- **Anti-spam:** skip a rule whose `alert_rules.last_triggered_at` is within the cooldown (default **6h**, `config.alertCooldownMinutes`). Combined with edge-triggering: only fire when condition is true AND (no `last_triggered_at` OR cooldown elapsed).
- **Dedupe** quote fetches by ticker (one `getQuote` per unique ticker per tick). For `earnings_date` rules, fetch earnings once per ticker. `volume_spike` baseline = prior-day average volume from `getHistory` (best-effort; cached per tick).
- For each fired rule: insert `alert_events` row (ruleId, companyId, ticker, value, notified=false) and set `alert_rules.last_triggered_at = now`.
- **Error isolation:** a failed ticker fetch (bad symbol, 429) is caught and logged; it fails only that ticker, never the tick. Returns `{ evaluated, fired, errors }` for logging.
- Tier/provider selection reuses existing market-client config; no per-rule key resolution in this plan (that's queue item #5).

### 3. Scheduler wiring
In `server/src/index.ts`, inside the existing heartbeat `setInterval`, add:
```
void alertEngine(db, { marketClient }).tick(new Date())
  .then(r => { if (r.fired > 0) logger.info({ ...r }, "alert engine fired events"); })
  .catch(err => logger.error({ err }, "alert engine tick failed"));
```
Also run once on startup (after `waitForExternalAdapters`) like the other reconcilers. Construct a shared `MarketDataClient` from config once.

### 4. API + UI
- `GET /api/alerts/events?limit=` in `alerts.ts` — list recent `alert_events` for the company (joined with rule ticker/condition), newest first. Auth via `assertCompanyAccess`.
- **Alerts page** (`ui/src/pages/Alerts.tsx`): add a **"Triggered alerts"** section listing recent events (ticker, condition, value, time). React Query key in `ui/src/lib/queryKeys.ts`. Empty state via `EmptyState`.

## Data changes

- **Migration**: add `last_triggered_at timestamptz NULL` to `alert_rules` (next migration number after current max). Update `packages/db/src/schema/alert_rules.ts`.
- No change to `alert_events`.

## Config

- `config.alertCooldownMinutes` (default 360 = 6h), env `PAPERCLIP_ALERT_COOLDOWN_MINUTES`.
- Engine runs only when `config.heartbeatSchedulerEnabled` (same gate as routines).

## Out of scope (explicit, follow-ups)

- **Agent auto-dispatch** on fire (`rule.agentId` → enqueue a research run). Deferred to v1.1.
- **Delivery/notifications** (email/push). `notified` stays false; UI display only for now.
- Per-company data-key resolution into the market client — that is queue item #5.

## Testing

- Unit: `alert-evaluator.test.ts` — table-driven cases for every condition (fire / no-fire / boundary / missing data / bad threshold).
- Service: `alert-engine.test.ts` — mocked db + mocked marketClient: dedupe, cooldown/edge-trigger, error isolation, event insertion + `last_triggered_at` update.
- Route: events endpoint returns company-scoped events; access control enforced.

## Success criteria

- Creating a `price_above` rule below current price → an `alert_event` appears within one scheduler tick and shows in the Alerts "Triggered" section; it does not re-fire within the cooldown.
- A 429/bad-ticker on one rule does not block others.
- `pnpm --filter @paperclipai/server typecheck` and the new tests pass.
