# Alert Evaluation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make active `alert_rules` fire into `alert_events` on the existing scheduler tick, with edge-trigger + cooldown anti-spam, and surface fired events in the Alerts UI.

**Architecture:** A pure `evaluateRule` function (no I/O, fully unit-tested) + an `alertEngine().tick()` orchestrator that dedupes quote fetches, applies cooldown via a new `alert_rules.last_triggered_at` column, inserts events, and is invoked from the existing heartbeat `setInterval` in `server/src/index.ts`. A `GET /:companyId/events` route + a "Triggered alerts" section on the Alerts page expose results.

**Tech Stack:** TypeScript (ESM, NodeNext), Drizzle ORM (Postgres), Express 5, Vitest, React 19 + React Query v5, `@paperclipai/market-data`.

**Spec:** `docs/superpowers/specs/2026-06-03-alert-evaluation-engine-design.md`

---

### Task 1: DB migration + schema for `last_triggered_at`

**Files:**
- Create: `packages/db/src/migrations/0096_alert_last_triggered.sql`
- Modify: `packages/db/src/schema/alert_rules.ts`

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/src/migrations/0096_alert_last_triggered.sql`:
```sql
ALTER TABLE "alert_rules" ADD COLUMN "last_triggered_at" timestamp with time zone;
```

- [ ] **Step 2: Add the column to the Drizzle schema**

In `packages/db/src/schema/alert_rules.ts`, inside the `pgTable("alert_rules", {...})` column object, after `active: ...`, add:
```ts
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
```
Ensure `timestamp` is already imported from `drizzle-orm/pg-core` (it is — `createdAt` uses it).

- [ ] **Step 3: Verify migration numbering + schema typecheck**

Run: `pnpm --filter @paperclipai/db build`
Expected: PASS (runs `check:migrations` then `tsc`); no numbering error.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/migrations/0096_alert_last_triggered.sql packages/db/src/schema/alert_rules.ts
git commit -m "feat(db): add alert_rules.last_triggered_at for alert cooldown"
```

---

### Task 2: Pure rule evaluator + tests

**Files:**
- Create: `server/src/services/alert-evaluator.ts`
- Test: `server/src/services/__tests__/alert-evaluator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/__tests__/alert-evaluator.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { evaluateRule, type AlertRuleInput, type EvalContext } from "../alert-evaluator.js";

const baseQuote = {
  ticker: "AAPL", price: 100, change: 1, changePercent: 2, volume: 1_000_000,
  currency: "USD", marketState: "REGULAR" as const, timestamp: new Date(), provider: "yahoo-finance" as const,
};
function rule(partial: Partial<AlertRuleInput>): AlertRuleInput {
  return { conditionType: "price_above", threshold: "90", ticker: "AAPL", ...partial };
}
const now = new Date("2026-06-03T12:00:00Z");

describe("evaluateRule", () => {
  it("price_above fires when price >= threshold", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: "90" }), { quote: baseQuote, now }))
      .toEqual({ fired: true, value: "100" });
  });
  it("price_above does not fire below threshold", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: "110" }), { quote: baseQuote, now }).fired).toBe(false);
  });
  it("price_below fires when price <= threshold", () => {
    expect(evaluateRule(rule({ conditionType: "price_below", threshold: "110" }), { quote: baseQuote, now }).fired).toBe(true);
  });
  it("percent_change uses absolute value", () => {
    const q = { ...baseQuote, changePercent: -5 };
    expect(evaluateRule(rule({ conditionType: "percent_change", threshold: "4" }), { quote: q, now }).fired).toBe(true);
  });
  it("earnings_date fires when an earnings report is within threshold days", () => {
    const ctx: EvalContext = { now, earnings: [{ ticker: "AAPL", reportDate: new Date("2026-06-06T00:00:00Z"), provider: "yahoo-finance" }] };
    expect(evaluateRule(rule({ conditionType: "earnings_date", threshold: "7" }), ctx).fired).toBe(true);
  });
  it("volume_spike needs a baseline (no false-fire without it)", () => {
    expect(evaluateRule(rule({ conditionType: "volume_spike", threshold: "2" }), { quote: baseQuote, now }).fired).toBe(false);
    expect(evaluateRule(rule({ conditionType: "volume_spike", threshold: "2" }), { quote: baseQuote, now, volumeBaseline: 400_000 }).fired).toBe(true);
  });
  it("missing/NaN threshold never fires", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: undefined }), { quote: baseQuote, now }).fired).toBe(false);
  });
  it("missing quote never fires for quote-based conditions", () => {
    expect(evaluateRule(rule({ conditionType: "price_above", threshold: "1" }), { now }).fired).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/alert-evaluator.test.ts`
Expected: FAIL ("Cannot find module ../alert-evaluator.js").

- [ ] **Step 3: Write the implementation**

Create `server/src/services/alert-evaluator.ts`:
```ts
import type { StockQuote, EarningsEvent } from "@stockpilotai/market-data";

export type AlertConditionType =
  | "price_above" | "price_below" | "percent_change" | "volume_spike" | "earnings_date";

export interface AlertRuleInput {
  ticker: string;
  conditionType: AlertConditionType;
  threshold: string | null | undefined;
}

export interface EvalContext {
  now: Date;
  quote?: StockQuote;
  earnings?: EarningsEvent[];
  volumeBaseline?: number;
}

export interface EvalResult {
  fired: boolean;
  value: string | null;
}

const NO: EvalResult = { fired: false, value: null };

function num(threshold: string | null | undefined): number | null {
  if (threshold == null || threshold.trim() === "") return null;
  const n = Number(threshold);
  return Number.isFinite(n) ? n : null;
}

export function evaluateRule(rule: AlertRuleInput, ctx: EvalContext): EvalResult {
  switch (rule.conditionType) {
    case "price_above": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote) return NO;
      return ctx.quote.price >= t ? { fired: true, value: String(ctx.quote.price) } : NO;
    }
    case "price_below": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote) return NO;
      return ctx.quote.price <= t ? { fired: true, value: String(ctx.quote.price) } : NO;
    }
    case "percent_change": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote) return NO;
      return Math.abs(ctx.quote.changePercent) >= t
        ? { fired: true, value: String(ctx.quote.changePercent) } : NO;
    }
    case "volume_spike": {
      const t = num(rule.threshold);
      if (t == null || !ctx.quote || ctx.volumeBaseline == null || ctx.volumeBaseline <= 0) return NO;
      return ctx.quote.volume >= t * ctx.volumeBaseline
        ? { fired: true, value: String(ctx.quote.volume) } : NO;
    }
    case "earnings_date": {
      const days = num(rule.threshold) ?? 7;
      if (!ctx.earnings || ctx.earnings.length === 0) return NO;
      const horizon = ctx.now.getTime() + days * 24 * 60 * 60 * 1000;
      const hit = ctx.earnings.find(
        (e) => e.reportDate.getTime() >= ctx.now.getTime() && e.reportDate.getTime() <= horizon,
      );
      return hit ? { fired: true, value: hit.reportDate.toISOString() } : NO;
    }
    default:
      return NO;
  }
}
```
> NOTE: import path `@stockpilotai/market-data` — confirm the package name in `packages/market-data/package.json`. If it is still `@paperclipai/market-data`, use that instead (this is consistent with whatever queue item #7 rename has reached at execution time).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/alert-evaluator.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/alert-evaluator.ts server/src/services/__tests__/alert-evaluator.test.ts
git commit -m "feat(alerts): pure rule evaluator with unit tests"
```

---

### Task 3: Engine service (orchestration) + tests

**Files:**
- Create: `server/src/services/alert-engine.ts`
- Test: `server/src/services/__tests__/alert-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/services/__tests__/alert-engine.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createAlertEngine } from "../alert-engine.js";

function makeDbStub(rules: any[]) {
  const inserted: any[] = [];
  const updated: any[] = [];
  const db: any = {
    // chainable select().from().where() → returns active rules
    select: () => ({ from: () => ({ where: () => Promise.resolve(rules) }) }),
    insert: () => ({ values: (v: any) => { inserted.push(v); return Promise.resolve(); } }),
    update: () => ({ set: (s: any) => ({ where: () => { updated.push(s); return Promise.resolve(); } }) }),
  };
  return { db, inserted, updated };
}
const quote = (over: any = {}) => ({ ticker: "AAPL", price: 100, change: 0, changePercent: 0, volume: 0, currency: "USD", marketState: "REGULAR", timestamp: new Date(), provider: "yahoo-finance", ...over });

describe("alertEngine.tick", () => {
  it("fires a price_above rule once and stamps last_triggered_at", async () => {
    const rules = [{ id: "r1", companyId: "c1", ticker: "AAPL", conditionType: "price_above", threshold: "90", active: true, lastTriggeredAt: null }];
    const { db, inserted, updated } = makeDbStub(rules);
    const marketClient = { getQuote: vi.fn().mockResolvedValue(quote({ price: 100 })) } as any;
    const engine = createAlertEngine(db, { marketClient, cooldownMinutes: 360 });
    const r = await engine.tick(new Date("2026-06-03T12:00:00Z"));
    expect(r.fired).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].ruleId).toBe("r1");
    expect(updated).toHaveLength(1);
    expect(marketClient.getQuote).toHaveBeenCalledTimes(1);
  });

  it("respects cooldown (does not re-fire within window)", async () => {
    const recent = new Date("2026-06-03T11:00:00Z"); // 1h ago, cooldown 6h
    const rules = [{ id: "r1", companyId: "c1", ticker: "AAPL", conditionType: "price_above", threshold: "90", active: true, lastTriggeredAt: recent }];
    const { db, inserted } = makeDbStub(rules);
    const marketClient = { getQuote: vi.fn().mockResolvedValue(quote({ price: 100 })) } as any;
    const engine = createAlertEngine(db, { marketClient, cooldownMinutes: 360 });
    const r = await engine.tick(new Date("2026-06-03T12:00:00Z"));
    expect(r.fired).toBe(0);
    expect(inserted).toHaveLength(0);
    // still skips the network fetch for a cooled-down rule
    expect(marketClient.getQuote).not.toHaveBeenCalled();
  });

  it("dedupes quote fetches per ticker and isolates per-ticker errors", async () => {
    const rules = [
      { id: "r1", companyId: "c1", ticker: "AAPL", conditionType: "price_above", threshold: "90", active: true, lastTriggeredAt: null },
      { id: "r2", companyId: "c1", ticker: "AAPL", conditionType: "price_below", threshold: "200", active: true, lastTriggeredAt: null },
      { id: "r3", companyId: "c1", ticker: "BAD", conditionType: "price_above", threshold: "1", active: true, lastTriggeredAt: null },
    ];
    const { db, inserted } = makeDbStub(rules);
    const getQuote = vi.fn((t: string) => t === "BAD" ? Promise.reject(new Error("429")) : Promise.resolve(quote({ ticker: t, price: 100 })));
    const engine = createAlertEngine(db, { marketClient: { getQuote } as any, cooldownMinutes: 360 });
    const r = await engine.tick(new Date());
    expect(getQuote).toHaveBeenCalledTimes(2); // AAPL once (deduped), BAD once
    expect(r.fired).toBe(2);   // r1 + r2
    expect(r.errors).toBe(1);  // BAD
    expect(inserted).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/alert-engine.test.ts`
Expected: FAIL ("Cannot find module ../alert-engine.js").

- [ ] **Step 3: Write the implementation**

Create `server/src/services/alert-engine.ts`:
```ts
import { and, eq } from "drizzle-orm";
import { alertRules, alertEvents } from "@paperclipai/db";
import type { Db } from "@paperclipai/db";
import type { StockQuote, EarningsEvent } from "@stockpilotai/market-data";
import { evaluateRule, type AlertConditionType } from "./alert-evaluator.js";
import { logger } from "../middleware/logger.js";

interface MarketClientLike {
  getQuote(ticker: string): Promise<StockQuote>;
  getEarningsCalendar?(ticker: string): Promise<EarningsEvent[]>;
}

export interface AlertEngineDeps {
  marketClient: MarketClientLike;
  cooldownMinutes: number;
}

export interface TickResult { evaluated: number; fired: number; errors: number; }

interface RuleRow {
  id: string; companyId: string; ticker: string;
  conditionType: AlertConditionType; threshold: string | null;
  active: boolean; lastTriggeredAt: Date | null;
}

export function createAlertEngine(db: Db, deps: AlertEngineDeps) {
  const cooldownMs = deps.cooldownMinutes * 60 * 1000;

  async function tick(now: Date): Promise<TickResult> {
    const rules = (await db.select().from(alertRules).where(eq(alertRules.active, true))) as RuleRow[];
    const result: TickResult = { evaluated: 0, fired: 0, errors: 0 };

    // Only rules off cooldown need data.
    const due = rules.filter((r) => !r.lastTriggeredAt || now.getTime() - r.lastTriggeredAt.getTime() >= cooldownMs);
    const tickers = Array.from(new Set(due.map((r) => r.ticker)));

    const quotes = new Map<string, StockQuote>();
    const earningsByTicker = new Map<string, EarningsEvent[]>();
    const needEarnings = new Set(due.filter((r) => r.conditionType === "earnings_date").map((r) => r.ticker));

    for (const ticker of tickers) {
      try {
        quotes.set(ticker, await deps.marketClient.getQuote(ticker));
        if (needEarnings.has(ticker) && deps.marketClient.getEarningsCalendar) {
          earningsByTicker.set(ticker, await deps.marketClient.getEarningsCalendar(ticker));
        }
      } catch (err) {
        result.errors += 1;
        logger.warn({ err, ticker }, "alert engine: market fetch failed for ticker");
      }
    }

    for (const rule of due) {
      result.evaluated += 1;
      const quote = quotes.get(rule.ticker);
      const earnings = earningsByTicker.get(rule.ticker);
      // Skip rules whose required data failed to load.
      if (rule.conditionType === "earnings_date" ? !earnings : !quote) continue;
      const { fired, value } = evaluateRule(rule, { now, quote, earnings });
      if (!fired) continue;
      try {
        await db.insert(alertEvents).values({
          ruleId: rule.id, companyId: rule.companyId, ticker: rule.ticker, value, notified: false,
        });
        await db.update(alertRules).set({ lastTriggeredAt: now }).where(eq(alertRules.id, rule.id));
        result.fired += 1;
      } catch (err) {
        result.errors += 1;
        logger.error({ err, ruleId: rule.id }, "alert engine: failed to record event");
      }
    }
    return result;
  }

  return { tick };
}
```
> NOTE on the `and` import: only `eq` is used above; remove the unused `and` import if the linter flags it. Confirm `@paperclipai/db` exports `Db`, `alertRules`, `alertEvents` (it does — see `packages/db/src/schema/index.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/alert-engine.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/alert-engine.ts server/src/services/__tests__/alert-engine.test.ts
git commit -m "feat(alerts): alert engine tick with dedupe, cooldown, error isolation"
```

---

### Task 4: Config — alert cooldown + market-client builder helper

**Files:**
- Modify: `server/src/config.ts`
- Create: `server/src/services/market-client.ts`

- [ ] **Step 1: Add cooldown config**

In `server/src/config.ts`, add to the returned config object (near other numeric settings, e.g. after the heartbeat scheduler fields):
```ts
    alertCooldownMinutes: Number(process.env.PAPERCLIP_ALERT_COOLDOWN_MINUTES) || 360,
```
And add `alertCooldownMinutes: number;` to the config type/interface in the same file.

- [ ] **Step 2: Create a shared market-client builder**

Create `server/src/services/market-client.ts`:
```ts
import { MarketDataClient } from "@stockpilotai/market-data";
import { ALPHA_VANTAGE_API_KEY, POLYGON_API_KEY } from "../config.js";

export function createDefaultMarketClient(): MarketDataClient {
  return new MarketDataClient({
    alphaVantageApiKey: ALPHA_VANTAGE_API_KEY,
    polygonApiKey: POLYGON_API_KEY,
  });
}
```
> NOTE: mirror how `server/src/routes/market.ts:84` constructs `new MarketDataClient(providers)` — match the exact provider-config shape it uses. Confirm `ALPHA_VANTAGE_API_KEY` / `POLYGON_API_KEY` exports in `config.ts` (they exist).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @paperclipai/server exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/config.ts server/src/services/market-client.ts
git commit -m "feat(alerts): alert cooldown config + shared market client builder"
```

---

### Task 5: Wire the engine into the scheduler

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Construct engine + run on startup and each tick**

In `server/src/index.ts`:
1. Add imports near the other service imports:
```ts
import { createAlertEngine } from "./services/alert-engine.js";
import { createDefaultMarketClient } from "./services/market-client.js";
```
2. Inside `if (config.heartbeatSchedulerEnabled) { ... }` (where `heartbeat` and `routines` are created), add:
```ts
    const alertEngine = createAlertEngine(db as any, {
      marketClient: createDefaultMarketClient(),
      cooldownMinutes: config.alertCooldownMinutes,
    });
    void alertEngine.tick(new Date())
      .then((r) => { if (r.fired > 0) logger.info({ ...r }, "alert engine startup tick fired events"); })
      .catch((err) => logger.error({ err }, "alert engine startup tick failed"));
```
3. Inside the existing `setInterval(() => { ... }, config.heartbeatSchedulerIntervalMs)` body (alongside `routines.tickScheduledTriggers`), add:
```ts
      void alertEngine.tick(new Date())
        .then((r) => { if (r.fired > 0) logger.info({ ...r }, "alert engine tick fired events"); })
        .catch((err) => logger.error({ err }, "alert engine tick failed"));
```

- [ ] **Step 2: Build the server**

Run: `pnpm --filter "@paperclipai/server..." build`
Expected: PASS; `server/dist/index.js` produced.

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(alerts): run alert engine on startup and each scheduler tick"
```

---

### Task 6: `GET /:companyId/events` route + test

**Files:**
- Modify: `server/src/routes/alerts.ts`
- Test: `server/src/routes/__tests__/alerts-events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/src/routes/__tests__/alerts-events.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { createAlertsRouter } from "../alerts.js";

// Minimal stub Db returning two events for company c1.
function stubDb() {
  return {
    select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ orderBy: () => ({ limit: () => Promise.resolve([
      { id: "e1", ticker: "AAPL", conditionType: "price_above", value: "101", triggeredAt: new Date(), notified: false },
    ]) }) }) }) }) }),
  } as any;
}
function appWith(db: any) {
  const app = express();
  app.use((req, _res, next) => { (req as any).actor = { source: "local_implicit" }; next(); });
  app.use("/api/alerts", createAlertsRouter(db));
  return app;
}

describe("GET /api/alerts/:companyId/events", () => {
  it("returns recent events for the company", async () => {
    const res = await request(appWith(stubDb())).get("/api/alerts/c1/events");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].ticker).toBe("AAPL");
  });
});
```
> NOTE: match the existing test harness used by other alerts/route tests in `server/src/routes/__tests__/` for how `req.actor`/auth is stubbed — copy that exact pattern instead of the simplified middleware above if one exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/__tests__/alerts-events.test.ts`
Expected: FAIL (404 — route not defined).

- [ ] **Step 3: Implement the route**

In `server/src/routes/alerts.ts`:
1. Extend imports: `import { alertRules, alertEvents } from '@paperclipai/db'` and add `desc` to the drizzle import: `import { eq, and, desc } from 'drizzle-orm'`.
2. Add this handler inside `createAlertsRouter`, after the existing `GET /:companyId` handler:
```ts
  // GET /api/alerts/:companyId/events — recent fired events
  router.get('/:companyId/events', async (req, res, next) => {
    try {
      const { companyId } = req.params
      assertCompanyAccess(req, companyId)
      const limit = Math.min(Number(req.query.limit) || 50, 200)
      const rows = await db
        .select({
          id: alertEvents.id,
          ticker: alertEvents.ticker,
          conditionType: alertRules.conditionType,
          value: alertEvents.value,
          triggeredAt: alertEvents.triggeredAt,
          notified: alertEvents.notified,
        })
        .from(alertEvents)
        .innerJoin(alertRules, eq(alertEvents.ruleId, alertRules.id))
        .where(eq(alertEvents.companyId, companyId))
        .orderBy(desc(alertEvents.triggeredAt))
        .limit(limit)
      res.json(rows)
    } catch (err) {
      next(err)
    }
  })
```
> Route order: Express matches `/:companyId/events` distinctly from `/:companyId`, but register `/:companyId/events` BEFORE any catch-all; placing it right after the list handler is fine.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @paperclipai/server exec vitest run src/routes/__tests__/alerts-events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/alerts.ts server/src/routes/__tests__/alerts-events.test.ts
git commit -m "feat(alerts): GET /:companyId/events route for fired alerts"
```

---

### Task 7: "Triggered alerts" UI section

**Files:**
- Modify: `ui/src/lib/queryKeys.ts`
- Modify: `ui/src/pages/Alerts.tsx`

- [ ] **Step 1: Add the query key**

In `ui/src/lib/queryKeys.ts`, inside the `alerts: { ... }` object, add:
```ts
    events: (companyId: string) => ["alerts", companyId, "events"] as const,
```

- [ ] **Step 2: Add the events query + section to the Alerts page**

In `ui/src/pages/Alerts.tsx`:
1. Add a query using the existing fetch helper pattern in the file (copy how the rules list `useQuery` is written — same `apiFetch`/`queryKeys` style):
```tsx
  const eventsQuery = useQuery({
    queryKey: queryKeys.alerts.events(selectedCompanyId!),
    queryFn: () => apiFetch(`/api/alerts/${selectedCompanyId}/events`),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  })
```
2. Render a "Triggered alerts" card/section below the rules list. Each row: ticker (monospace), condition label, value, and relative time. Use the existing `EmptyState` when `eventsQuery.data?.length === 0`, and `PageSkeleton`/spinner pattern already used on the page for loading. Match the page's existing Card/list markup — do not introduce new component styles.

- [ ] **Step 3: Build the UI**

Run: `pnpm --filter @paperclipai/ui build`
Expected: PASS (`tsc -b && vite build`).

- [ ] **Step 4: Commit**

```bash
git add ui/src/lib/queryKeys.ts ui/src/pages/Alerts.tsx
git commit -m "feat(alerts): Triggered alerts section on Alerts page"
```

---

### Task 8: Full verification + roadmap update

**Files:**
- Modify: `docs/stockpilot/ROADMAP.md`

- [ ] **Step 1: Run server tests + typecheck**

Run: `pnpm --filter @paperclipai/server exec vitest run src/services/__tests__/alert-evaluator.test.ts src/services/__tests__/alert-engine.test.ts src/routes/__tests__/alerts-events.test.ts`
Expected: all PASS.

- [ ] **Step 2: Full build**

Run: `pnpm --filter "@paperclipai/server..." build && pnpm --filter @paperclipai/ui build`
Expected: PASS.

- [ ] **Step 3: Update roadmap**

In `docs/stockpilot/ROADMAP.md` §7b, mark item 1 ✅ done; in the feature diff table add the alert engine row (engine + events route + UI). Note the deferred follow-ups: agent auto-dispatch on fire, notification delivery.

- [ ] **Step 4: Commit**

```bash
git add docs/stockpilot/ROADMAP.md
git commit -m "docs: mark alert evaluation engine done (queue item #1)"
```

---

## Self-Review notes (author)

- **Spec coverage:** evaluator (Task 2), engine + dedupe/cooldown/errors (Task 3), migration (Task 1), config (Task 4), scheduler wiring (Task 5), events route (Task 6), UI section (Task 7), verification + docs (Task 8). All spec sections covered. Out-of-scope items (agent dispatch, notification delivery) intentionally excluded.
- **Type consistency:** `evaluateRule(rule, ctx)` signature is identical in Tasks 2/3; `createAlertEngine(db, { marketClient, cooldownMinutes })` and `tick(now): TickResult {evaluated,fired,errors}` consistent across Task 3 test + impl + Task 5 wiring.
- **Known execution-time check:** the `@stockpilotai/market-data` vs `@paperclipai/market-data` package name depends on how far the rename (queue item #7) has progressed. Each importing step notes "confirm the actual package name." Default to whatever `packages/market-data/package.json#name` currently is.
