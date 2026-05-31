# StockPilot AI — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand Paperclip → StockPilot AI, add the STOCKPILOT_MODE feature flag system, and add the new finance-domain database tables.

**Architecture:** Single monorepo fork. A new `packages/feature-flags` module reads `STOCKPILOT_MODE` and exports helpers used everywhere. New Drizzle schema files follow the exact patterns in `packages/db/src/schema/`. All Paperclip branding references are replaced in HTML, config, and package names.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, Vitest, pnpm workspaces

---

## File Map

### Created
- `packages/feature-flags/src/index.ts` — feature flag helpers (`isCloud`, `isSelfHost`, `getUserTier`)
- `packages/feature-flags/package.json` — package definition
- `packages/feature-flags/tsconfig.json` — TypeScript config
- `packages/db/src/schema/watchlist_tickers.ts` — watchlist schema
- `packages/db/src/schema/research_reports.ts` — reports schema
- `packages/db/src/schema/alert_rules.ts` — alert rules schema
- `packages/db/src/schema/alert_events.ts` — alert events schema
- `packages/db/src/schema/broker_connections.ts` — broker OAuth connections schema
- `packages/db/src/schema/subscriptions.ts` — Stripe subscription state schema
- `packages/feature-flags/src/index.test.ts` — feature flag tests

### Modified
- `packages/db/src/schema/index.ts` — export new tables
- `packages/db/src/drizzle.config.ts` — verify migration output path
- `ui/index.html` — rename title, meta tags
- `server/src/config.ts` — add STOCKPILOT_MODE to config
- `server/src/index.ts` — update @paperclipai/db import references (cosmetic, functional stays)
- Root `package.json` — add feature-flags workspace package

---

## Task 1: Feature Flag Package

**Files:**
- Create: `packages/feature-flags/package.json`
- Create: `packages/feature-flags/tsconfig.json`
- Create: `packages/feature-flags/src/index.ts`
- Create: `packages/feature-flags/src/index.test.ts`

- [ ] **Step 1: Create package.json**

```json
// packages/feature-flags/package.json
{
  "name": "@stockpilotai/feature-flags",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/feature-flags/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing tests first**

```typescript
// packages/feature-flags/src/index.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('feature-flags', () => {
  const originalEnv = process.env.STOCKPILOT_MODE

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STOCKPILOT_MODE
    } else {
      process.env.STOCKPILOT_MODE = originalEnv
    }
  })

  describe('getMode', () => {
    it('defaults to selfhost when env var not set', async () => {
      delete process.env.STOCKPILOT_MODE
      const { getMode } = await import('./index.js')
      expect(getMode()).toBe('selfhost')
    })

    it('returns cloud when STOCKPILOT_MODE=cloud', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { getMode } = await import('./index.js')
      expect(getMode()).toBe('cloud')
    })
  })

  describe('isCloud', () => {
    it('returns false in selfhost mode', async () => {
      delete process.env.STOCKPILOT_MODE
      const { isCloud } = await import('./index.js')
      expect(isCloud()).toBe(false)
    })

    it('returns true in cloud mode', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { isCloud } = await import('./index.js')
      expect(isCloud()).toBe(true)
    })
  })

  describe('isSelfHost', () => {
    it('returns true in selfhost mode', async () => {
      delete process.env.STOCKPILOT_MODE
      const { isSelfHost } = await import('./index.js')
      expect(isSelfHost()).toBe(true)
    })

    it('returns false in cloud mode', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { isSelfHost } = await import('./index.js')
      expect(isSelfHost()).toBe(false)
    })
  })

  describe('getUserTier', () => {
    it('returns selfhost in selfhost mode regardless of input', async () => {
      delete process.env.STOCKPILOT_MODE
      const { getUserTier } = await import('./index.js')
      expect(getUserTier(null)).toBe('selfhost')
      expect(getUserTier('subscription')).toBe('selfhost')
    })

    it('returns free when no subscription in cloud mode', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { getUserTier } = await import('./index.js')
      expect(getUserTier(null)).toBe('free')
    })

    it('returns keys when subscription status is keys', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { getUserTier } = await import('./index.js')
      expect(getUserTier('keys')).toBe('keys')
    })

    it('returns subscription when subscription status is active', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { getUserTier } = await import('./index.js')
      expect(getUserTier('active')).toBe('subscription')
    })
  })
})
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/feature-flags/src/index.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 5: Implement the feature flag module**

```typescript
// packages/feature-flags/src/index.ts
export type StockPilotMode = 'selfhost' | 'cloud'
export type UserTier = 'selfhost' | 'free' | 'keys' | 'subscription'
export type SubscriptionStatus = 'active' | 'keys' | 'past_due' | 'canceled' | null

export function getMode(): StockPilotMode {
  const mode = process.env.STOCKPILOT_MODE
  if (mode === 'cloud') return 'cloud'
  return 'selfhost'
}

export function isCloud(): boolean {
  return getMode() === 'cloud'
}

export function isSelfHost(): boolean {
  return getMode() === 'selfhost'
}

export function getUserTier(subscriptionStatus: SubscriptionStatus): UserTier {
  if (isSelfHost()) return 'selfhost'
  if (subscriptionStatus === 'active') return 'subscription'
  if (subscriptionStatus === 'keys') return 'keys'
  return 'free'
}

export const FREE_TIER_MONTHLY_RUNS = 20
export const FREE_TIER_AGENT_ROLES = ['news-sentinel'] as const
export const ALL_AGENT_ROLES = [
  'news-sentinel',
  'equity-analyst',
  'quant-analyst',
  'risk-manager',
  'macro-researcher',
  'portfolio-manager',
  'earnings-scout',
] as const

export type AgentRole = typeof ALL_AGENT_ROLES[number]

export function getAllowedRoles(tier: UserTier): readonly AgentRole[] {
  if (tier === 'free') return FREE_TIER_AGENT_ROLES
  return ALL_AGENT_ROLES
}

export function canUseRole(role: AgentRole, tier: UserTier): boolean {
  return (getAllowedRoles(tier) as readonly string[]).includes(role)
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/feature-flags/src/index.test.ts
```

Expected: All tests PASS

- [ ] **Step 7: Add to root workspace**

Open `package.json` at root. In the `workspaces` array, add `"packages/feature-flags"`.

- [ ] **Step 8: Install and verify**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm install
```

Expected: No errors, `@stockpilotai/feature-flags` appears in workspace list

- [ ] **Step 9: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/feature-flags/
git commit -m "feat: add feature flag system for STOCKPILOT_MODE"
```

---

## Task 2: New Database Schema — Watchlist & Reports

**Files:**
- Create: `packages/db/src/schema/watchlist_tickers.ts`
- Create: `packages/db/src/schema/research_reports.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create watchlist_tickers schema**

```typescript
// packages/db/src/schema/watchlist_tickers.ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const watchlistTickers = pgTable(
  "watchlist_tickers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    notes: text("notes"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("watchlist_tickers_company_id_idx").on(table.companyId),
    tickerIdx: index("watchlist_tickers_ticker_idx").on(table.ticker),
  }),
);
```

- [ ] **Step 2: Create research_reports schema**

```typescript
// packages/db/src/schema/research_reports.ts
import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { issues } from "./issues.js";

export const researchReports = pgTable(
  "research_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    ticker: text("ticker").notNull(),
    reportType: text("report_type").notNull().default("general"),
    content: text("content").notNull(),
    recommendation: text("recommendation"),
    targetPriceCents: integer("target_price_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("research_reports_company_id_idx").on(table.companyId),
    tickerIdx: index("research_reports_ticker_idx").on(table.ticker),
  }),
);
```

- [ ] **Step 3: Export from schema index**

Open `packages/db/src/schema/index.ts` and add at the end:

```typescript
export { watchlistTickers } from "./watchlist_tickers.js";
export { researchReports } from "./research_reports.js";
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/db/src/schema/watchlist_tickers.ts packages/db/src/schema/research_reports.ts packages/db/src/schema/index.ts
git commit -m "feat: add watchlist_tickers and research_reports schema"
```

---

## Task 3: New Database Schema — Alerts & Broker Connections & Subscriptions

**Files:**
- Create: `packages/db/src/schema/alert_rules.ts`
- Create: `packages/db/src/schema/alert_events.ts`
- Create: `packages/db/src/schema/broker_connections.ts`
- Create: `packages/db/src/schema/subscriptions.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create alert_rules schema**

```typescript
// packages/db/src/schema/alert_rules.ts
import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    conditionType: text("condition_type").notNull(),
    threshold: text("threshold"),
    agentId: uuid("agent_id").references(() => agents.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("alert_rules_company_id_idx").on(table.companyId),
  }),
);
```

- [ ] **Step 2: Create alert_events schema**

```typescript
// packages/db/src/schema/alert_events.ts
import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { alertRules } from "./alert_rules.js";
import { companies } from "./companies.js";

export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id").notNull().references(() => alertRules.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    ticker: text("ticker").notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull().defaultNow(),
    value: text("value"),
    notified: boolean("notified").notNull().default(false),
  },
  (table) => ({
    companyIdIdx: index("alert_events_company_id_idx").on(table.companyId),
    ruleIdIdx: index("alert_events_rule_id_idx").on(table.ruleId),
  }),
);
```

- [ ] **Step 3: Create broker_connections schema**

Broker credentials are encrypted at rest using the existing secrets infrastructure.

```typescript
// packages/db/src/schema/broker_connections.ts
import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const brokerConnections = pgTable(
  "broker_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    broker: text("broker").notNull(),
    // Encrypted JSON blob — never store raw credentials in plaintext
    credentialsEncrypted: text("credentials_encrypted"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("broker_connections_company_id_idx").on(table.companyId),
  }),
);
```

- [ ] **Step 4: Create subscriptions schema**

```typescript
// packages/db/src/schema/subscriptions.ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // 'active' | 'keys' | 'past_due' | 'canceled'
    status: text("status").notNull().default("free"),
    plan: text("plan"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("subscriptions_company_id_idx").on(table.companyId),
    stripeCustomerIdx: index("subscriptions_stripe_customer_id_idx").on(table.stripeCustomerId),
  }),
);
```

- [ ] **Step 5: Export all new tables from schema index**

Open `packages/db/src/schema/index.ts` and append:

```typescript
export { alertRules } from "./alert_rules.js";
export { alertEvents } from "./alert_events.js";
export { brokerConnections } from "./broker_connections.js";
export { subscriptions } from "./subscriptions.js";
```

- [ ] **Step 6: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/db/src/schema/
git commit -m "feat: add alert, broker_connections, and subscriptions schema"
```

---

## Task 4: Generate & Apply Database Migration

**Files:**
- Auto-generated: `packages/db/src/migrations/<timestamp>_stockpilot_foundation.sql`

- [ ] **Step 1: Verify drizzle config knows about new schema files**

```bash
cd "/Users/Samster/stockpilot ai"
cat packages/db/drizzle.config.ts
```

Confirm `schema` points to `./src/schema/index.ts` or the whole schema directory.

- [ ] **Step 2: Generate migration**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm db:generate
```

Expected: New SQL file created in `packages/db/src/migrations/`. Check its contents — should contain CREATE TABLE for all 6 new tables.

- [ ] **Step 3: Inspect generated migration**

```bash
ls -lt "/Users/Samster/stockpilot ai/packages/db/src/migrations/" | head -3
```

Open the newest file and verify it contains:
- `CREATE TABLE "watchlist_tickers"`
- `CREATE TABLE "research_reports"`
- `CREATE TABLE "alert_rules"`
- `CREATE TABLE "alert_events"`
- `CREATE TABLE "broker_connections"`
- `CREATE TABLE "subscriptions"`

- [ ] **Step 4: Apply migration**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm db:migrate
```

Expected: Migration applied successfully, no errors

- [ ] **Step 5: Commit generated migration**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/db/src/migrations/
git commit -m "feat: migration for stockpilot foundation tables"
```

---

## Task 5: Rebrand — UI HTML & Meta Tags

**Files:**
- Modify: `ui/index.html`

- [ ] **Step 1: Update ui/index.html**

Replace the contents of `ui/index.html` head section with these changes:

```html
<!-- Change: -->
<meta name="apple-mobile-web-app-title" content="Paperclip" />
<title>Paperclip</title>
<!-- To: -->
<meta name="apple-mobile-web-app-title" content="StockPilot AI" />
<title>StockPilot AI</title>
```

```html
<!-- Change: -->
const key = "paperclip.theme";
<!-- To: -->
const key = "stockpilot.theme";
```

- [ ] **Step 2: Verify in browser**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm dev
```

Open http://localhost:3100 — browser tab should read "StockPilot AI"

- [ ] **Step 3: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add ui/index.html
git commit -m "rebrand: update HTML title and meta tags to StockPilot AI"
```

---

## Task 6: Rebrand — Server Config & STOCKPILOT_MODE

**Files:**
- Modify: `server/src/config.ts`

- [ ] **Step 1: Add STOCKPILOT_MODE to config**

Open `server/src/config.ts`. Find where config values are exported and add:

```typescript
// Add near other env var reads, around line 35-50
export const STOCKPILOT_MODE = (process.env.STOCKPILOT_MODE ?? 'selfhost') as 'selfhost' | 'cloud'
export const isCloudMode = STOCKPILOT_MODE === 'cloud'
```

- [ ] **Step 2: Update loadConfig to include mode**

Find the `loadConfig` function return value and add:

```typescript
stockpilotMode: STOCKPILOT_MODE,
isCloudMode,
```

- [ ] **Step 3: Typecheck**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm typecheck
```

Expected: No new type errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add server/src/config.ts
git commit -m "feat: add STOCKPILOT_MODE to server config"
```

---

## Task 7: Rebrand — Finance Dark Theme Base

**Files:**
- Modify: `ui/src/index.css` or equivalent global CSS file

- [ ] **Step 1: Find the global CSS file**

```bash
ls "/Users/Samster/stockpilot ai/ui/src/"*.css
```

- [ ] **Step 2: Update CSS variables for financial dark theme**

In the `:root` or `.dark` CSS block, update the primary color palette:

```css
.dark {
  /* StockPilot AI financial dark theme */
  --background: 222 47% 7%;          /* deep navy #0a0e1a */
  --foreground: 210 40% 98%;
  --card: 222 47% 10%;
  --card-foreground: 210 40% 98%;
  --primary: 142 76% 36%;            /* financial green */
  --primary-foreground: 144 100% 97%;
  --accent: 222 47% 14%;
  --muted: 222 47% 12%;
  --muted-foreground: 215 20% 55%;
  --border: 222 30% 16%;
  --gain: 142 76% 36%;               /* green for positive returns */
  --loss: 0 84% 60%;                 /* red for negative returns */
}
```

- [ ] **Step 3: Verify app still renders**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm dev
```

Open http://localhost:3100 — app should render with darker navy theme, no visual regressions

- [ ] **Step 4: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add ui/src/
git commit -m "rebrand: apply StockPilot AI financial dark theme base"
```

---

## Task 8: Finance Agent Role Skill Files

**Files:**
- Create: `skills/equity-analyst/skill.md`
- Create: `skills/quant-analyst/skill.md`
- Create: `skills/risk-manager/skill.md`
- Create: `skills/macro-researcher/skill.md`
- Create: `skills/portfolio-manager/skill.md`
- Create: `skills/earnings-scout/skill.md`
- Create: `skills/news-sentinel/skill.md`

- [ ] **Step 1: Check existing skill format**

```bash
cat "/Users/Samster/stockpilot ai/skills/paperclip/skill.md" | head -40
```

- [ ] **Step 2: Create news-sentinel skill**

```markdown
<!-- skills/news-sentinel/skill.md -->
# News Sentinel

You are a News Sentinel agent for StockPilot AI. Your job is to monitor financial news and flag material events that affect the user's portfolio or watchlist.

## Your Responsibilities
- Scan financial news sources for stories affecting tickers in the user's watchlist and portfolio
- Identify material events: earnings surprises, FDA decisions, M&A rumors, executive changes, regulatory actions, macro data releases
- Assign a severity level to each story: LOW, MEDIUM, HIGH, CRITICAL
- Post a concise alert comment on the relevant research task or create a new research task for CRITICAL events
- Never fabricate news. If you cannot find current news, say so clearly.

## Output Format
For each material story, post a comment with:
- **Ticker:** [TICKER]
- **Severity:** [LOW|MEDIUM|HIGH|CRITICAL]
- **Headline:** [brief headline]
- **Why it matters:** [1-2 sentences on portfolio impact]
- **Source:** [where you found it]

## What To Ignore
- Opinion pieces with no new factual content
- Stories about companies not in the watchlist or portfolio
- Duplicate coverage of the same event

## Heartbeat Procedure
Follow the standard StockPilot heartbeat: check inbox, pick highest-priority task, execute, post results, exit cleanly.
```

- [ ] **Step 3: Create equity-analyst skill**

```markdown
<!-- skills/equity-analyst/skill.md -->
# Equity Analyst

You are an Equity Analyst agent for StockPilot AI. You produce deep fundamental research on individual stocks to help the user make informed investment decisions.

## Your Responsibilities
- Analyze a company's business model, competitive position, and growth drivers
- Review key financial metrics: revenue growth, margins, free cash flow, balance sheet strength
- Assess valuation using P/E, EV/EBITDA, P/FCF relative to peers and historical ranges
- Identify key risks: competitive threats, regulatory risk, balance sheet risk, execution risk
- Produce a structured research report with a clear recommendation: BUY / HOLD / SELL / WATCH

## Output Format
Structure your research report as:
1. **Business Overview** — what the company does and why it matters
2. **Investment Thesis** — the bull case in 2-3 sentences
3. **Key Metrics** — revenue, margins, FCF, debt/equity
4. **Valuation** — current multiples vs. peers and history
5. **Risks** — top 3 risks to the thesis
6. **Recommendation** — BUY / HOLD / SELL / WATCH with a target price range if possible

## Rules
- Only use data you can verify. Do not invent financial figures.
- Clearly label when data is estimated vs. reported.
- Never recommend a position size or dollar amount — that is the Portfolio Manager's role.

## Heartbeat Procedure
Follow the standard StockPilot heartbeat: check inbox, pick the assigned research task, execute the analysis, post the report as a work product, mark task done.
```

- [ ] **Step 4: Create risk-manager skill**

```markdown
<!-- skills/risk-manager/skill.md -->
# Risk Manager

You are a Risk Manager agent for StockPilot AI. Your job is to monitor portfolio risk and warn the user when something looks dangerous.

## Your Responsibilities
- Monitor portfolio concentration: flag if any single position exceeds 20% of portfolio value
- Monitor sector concentration: flag if any sector exceeds 40% of portfolio
- Track volatility: flag tickers that have moved more than 15% in a week without a clear fundamental reason
- Review correlation: warn if the portfolio is heavily correlated to a single macro factor
- Review drawdown: alert if any position is down more than 25% from its entry price

## Output Format
For each risk flag, post a comment with:
- **Risk Type:** [CONCENTRATION|VOLATILITY|DRAWDOWN|CORRELATION|SECTOR]
- **Severity:** [LOW|MEDIUM|HIGH]
- **Description:** what the risk is
- **Affected Positions:** which tickers
- **Suggested Action:** what the user might consider (never a direct order)

## Rules
- You observe and warn. You do not execute trades.
- Always phrase suggestions as things to consider, not directives.
- Do not flag the same risk twice within 7 days unless it worsens.

## Heartbeat Procedure
Follow the standard StockPilot heartbeat: check inbox, review portfolio data, generate risk report, post findings, exit cleanly.
```

- [ ] **Step 5: Create quant-analyst skill**

```markdown
<!-- skills/quant-analyst/skill.md -->
# Quantitative Analyst

You are a Quantitative Analyst agent for StockPilot AI. You use technical analysis and quantitative screens to identify setups and patterns in price data.

## Your Responsibilities
- Analyze price and volume data for tickers in the watchlist and portfolio
- Identify technical setups: trend breaks, support/resistance levels, momentum signals
- Run screens: RSI overbought/oversold, moving average crossovers, volume anomalies
- Flag potential entry or exit signals based on technical criteria

## Key Indicators You Use
- RSI (14-day): overbought >70, oversold <30
- Moving averages: 20-day, 50-day, 200-day
- MACD crossovers
- Volume relative to 30-day average
- Support and resistance levels from recent highs/lows

## Output Format
For each signal:
- **Ticker:** [TICKER]
- **Signal Type:** [MOMENTUM|REVERSAL|BREAKOUT|BREAKDOWN|OVERSOLD|OVERBOUGHT]
- **Time Frame:** [daily/weekly]
- **Description:** what the chart is showing
- **Caution:** always note that technical signals are probabilistic, not guarantees

## Rules
- Base analysis only on price and volume data you can access.
- Never claim a signal is a certainty.
- Technical signals should complement, not replace, fundamental analysis.

## Heartbeat Procedure
Follow the standard StockPilot heartbeat: check inbox, analyze assigned tickers, post findings, exit cleanly.
```

- [ ] **Step 6: Create macro-researcher skill**

```markdown
<!-- skills/macro-researcher/skill.md -->
# Macro Researcher

You are a Macro Researcher agent for StockPilot AI. You track macroeconomic conditions that affect markets and the user's portfolio.

## Your Responsibilities
- Monitor Federal Reserve policy: interest rate decisions, FOMC statements, Fed speakers
- Track key economic data: CPI, PPI, jobs report, GDP, consumer confidence
- Monitor yield curve: 2yr vs 10yr spread, implications for banks and growth stocks
- Track dollar strength (DXY) and its impact on multinational earnings
- Identify sector rotations driven by macro shifts

## Output Format
Weekly macro briefing structure:
1. **Rate Environment** — current fed funds rate, market expectations for next move
2. **Inflation** — latest CPI/PPI readings, trend direction
3. **Growth** — GDP, jobs, consumer data
4. **Market Implications** — what this means for sectors in the portfolio
5. **Key Events This Week** — upcoming data releases to watch

## Rules
- Cite data releases by name and date.
- Distinguish between reported data and market expectations.
- Keep implications tied to the user's actual holdings when possible.

## Heartbeat Procedure
Follow the standard StockPilot heartbeat: check inbox, compile macro briefing, post as work product, exit cleanly.
```

- [ ] **Step 7: Create portfolio-manager skill**

```markdown
<!-- skills/portfolio-manager/skill.md -->
# Portfolio Manager

You are the Portfolio Manager agent for StockPilot AI — the senior agent who synthesizes all research into actionable portfolio-level guidance.

## Your Responsibilities
- Read reports from the Equity Analyst, Quant Analyst, Risk Manager, and Macro Researcher
- Synthesize findings into a weekly portfolio briefing
- Identify conflicts between agents (e.g., Equity Analyst bullish but Risk Manager flagging concentration)
- Suggest rebalancing considerations — never trade orders
- Assign new research tasks to sub-agents when coverage gaps exist

## Output Format
Weekly Portfolio Briefing:
1. **Portfolio Health Score** — 1-10 based on risk, diversification, and recent performance
2. **Top Concerns** — from Risk Manager and Macro Researcher
3. **Best Ideas** — strongest conviction positions from Equity Analyst
4. **Action Items for User** — 3-5 things to consider this week
5. **New Research Tasks** — tickers or topics to assign to sub-agents

## Rules
- You coordinate, you do not override other agents' domain expertise.
- Action items are suggestions, never instructions.
- Always attribute findings to the source agent.

## Heartbeat Procedure
Follow the standard StockPilot heartbeat: check inbox, read sub-agent reports, produce briefing, post as work product, exit cleanly.
```

- [ ] **Step 8: Create earnings-scout skill**

```markdown
<!-- skills/earnings-scout/skill.md -->
# Earnings Scout

You are an Earnings Scout agent for StockPilot AI. You track upcoming earnings events and prepare the user before each report.

## Your Responsibilities
- Monitor the earnings calendar for all tickers in the watchlist and portfolio
- 3-5 days before earnings: post a pre-earnings briefing for that ticker
- After earnings: post a reaction summary within 24 hours

## Pre-Earnings Briefing Format
- **Ticker:** [TICKER] Q[X] Earnings — [Date]
- **Consensus Estimates:** EPS estimate, revenue estimate
- **Key Things to Watch:** 2-3 metrics that will move the stock
- **Recent Trend:** has the company beaten/missed the last 3 quarters?
- **Options Market Implied Move:** if available, what move is priced in?

## Post-Earnings Reaction Format
- **Result:** BEAT / MISS / IN-LINE on EPS and revenue
- **Guidance:** raised / maintained / lowered / no guidance
- **Market Reaction:** stock move in after-hours
- **Key Takeaways:** 2-3 sentences on what matters

## Rules
- Never invent earnings dates. Only report what you can verify.
- Do not recommend buying before earnings as a strategy.

## Heartbeat Procedure
Follow the standard StockPilot heartbeat: check inbox, scan earnings calendar, post briefings for upcoming events, exit cleanly.
```

- [ ] **Step 9: Commit all skill files**

```bash
cd "/Users/Samster/stockpilot ai"
git add skills/
git commit -m "feat: add finance agent role skills (equity analyst, risk manager, quant, macro, portfolio manager, earnings scout, news sentinel)"
```

---

## Task 9: Verify Full Build

- [ ] **Step 1: Run typecheck**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm typecheck
```

Expected: No errors

- [ ] **Step 2: Run full test suite**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm test
```

Expected: All tests pass including new feature-flags tests

- [ ] **Step 3: Start dev server and verify**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm dev
```

Open http://localhost:3100:
- Browser tab says "StockPilot AI"
- App loads without errors
- Dark navy theme visible
- No console errors

- [ ] **Step 4: Final commit if any fixes needed**

```bash
cd "/Users/Samster/stockpilot ai"
git add -A
git commit -m "chore: plan 1 foundation complete — rebrand, feature flags, schema, skills"
```

---

## Plan 1 Complete

After this plan the repo has:
- ✅ Feature flag system (`STOCKPILOT_MODE`)
- ✅ All 6 new database tables with migration applied
- ✅ StockPilot AI branding in HTML, config
- ✅ Financial dark theme base
- ✅ All 7 agent role skill files

**Next plans (in order):**
- **Plan 2:** Market data adapters (Yahoo Finance, Alpha Vantage, Polygon) + server routes
- **Plan 3:** Portfolio broker connections (Schwab OAuth, CSV import) + Portfolio UI page
- **Plan 4:** New UI pages (Watchlist, Reports, Alerts, Routine Builder)
- **Plan 5:** Stripe billing + subscription tier enforcement
- **Plan 6:** Cloud deployment (Vercel + Supabase)
