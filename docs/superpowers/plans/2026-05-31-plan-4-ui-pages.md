# Plan 4: UI Pages — Portfolio, Watchlist, Alerts, Market

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four new finance pages (Portfolio, Watchlist, Alerts, Market) wired end-to-end from DB → backend API → frontend UI, with sidebar navigation.

**Architecture:** Backend adds CRUD routes for watchlist and alerts (market and broker routes already exist from Plans 2–3). Frontend adds API modules, query keys, stub pages, sidebar nav, and then fills in each page. Pages use React Query for data fetching, shadcn/ui components, and the existing `useCompany()` + `useBreadcrumbs()` hooks.

**Tech Stack:** Express + Drizzle ORM (backend), React 19 + React Query v5 + shadcn/ui + lucide-react (frontend), Vitest (tests), Tailwind CSS v4

---

## File Map

**New backend files:**
- `server/src/routes/watchlist.ts` — CRUD for `watchlist_tickers` table
- `server/src/routes/alerts.ts` — CRUD for `alert_rules` table
- `server/src/routes/watchlist.test.ts`
- `server/src/routes/alerts.test.ts`

**Modified backend files:**
- `server/src/app.ts` — mount watchlist and alerts routers

**New frontend files:**
- `ui/src/api/market.ts` — calls `/api/market/*`
- `ui/src/api/broker.ts` — calls `/api/broker/*`
- `ui/src/api/watchlist.ts` — calls `/api/watchlist/*`
- `ui/src/api/alerts.ts` — calls `/api/alerts/*`
- `ui/src/pages/Portfolio.tsx`
- `ui/src/pages/Watchlist.tsx`
- `ui/src/pages/Alerts.tsx`
- `ui/src/pages/Market.tsx`

**Modified frontend files:**
- `ui/src/lib/queryKeys.ts` — add market, broker, watchlist, alerts sections
- `ui/src/App.tsx` — add 4 routes inside `boardRoutes()`
- `ui/src/components/Sidebar.tsx` — add "Finance" section with 4 nav items

---

### Task 1: Backend watchlist & alerts CRUD routes

**Files:**
- Create: `server/src/routes/watchlist.ts`
- Create: `server/src/routes/alerts.ts`
- Modify: `server/src/app.ts`
- Create: `server/src/routes/watchlist.test.ts`
- Create: `server/src/routes/alerts.test.ts`

- [ ] **Step 1: Write failing tests for watchlist router**

Create `server/src/routes/watchlist.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createWatchlistRouter } from './watchlist.js'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}

const COMPANY_ID = '11111111-1111-1111-1111-111111111111'

function mockReq(companyId: string) {
  return { user: { companyMemberships: [{ companyId, role: 'member' }] } }
}

function buildApp(companyId: string) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.assign(req, mockReq(companyId))
    next()
  })
  app.use('/api/watchlist', createWatchlistRouter(mockDb as any))
  return app
}

describe('watchlist router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET /:companyId returns ticker list', async () => {
    const rows = [{ id: 'abc', ticker: 'AAPL', notes: null, addedAt: new Date().toISOString() }]
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    })
    const res = await request(buildApp(COMPANY_ID))
      .get(`/api/watchlist/${COMPANY_ID}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].ticker).toBe('AAPL')
  })

  it('POST /:companyId adds ticker', async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'new-id', ticker: 'MSFT', notes: null, addedAt: new Date().toISOString() }]),
      }),
    })
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/watchlist/${COMPANY_ID}`)
      .send({ ticker: 'MSFT' })
    expect(res.status).toBe(201)
    expect(res.body.ticker).toBe('MSFT')
  })

  it('DELETE /:companyId/:ticker removes ticker', async () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    })
    const res = await request(buildApp(COMPANY_ID))
      .delete(`/api/watchlist/${COMPANY_ID}/AAPL`)
    expect(res.status).toBe(204)
  })

  it('POST /:companyId rejects invalid ticker', async () => {
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/watchlist/${COMPANY_ID}`)
      .send({ ticker: 'this is not a ticker!!!' })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm --filter @paperclipai/server exec vitest run src/routes/watchlist.test.ts
```

Expected: FAIL — `createWatchlistRouter` not found.

- [ ] **Step 3: Implement watchlist router**

Create `server/src/routes/watchlist.ts`:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { watchlistTickers } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i
const tickerSchema = z.string().regex(TICKER_REGEX, 'Invalid ticker symbol')

export function createWatchlistRouter(db: Db): Router {
  const router = Router()

  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // GET /api/watchlist/:companyId
  router.get('/:companyId', async (req, res) => {
    const { companyId } = req.params
    try {
      assertCompanyAccess(req, companyId)
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const rows = await db
      .select({
        id: watchlistTickers.id,
        ticker: watchlistTickers.ticker,
        notes: watchlistTickers.notes,
        addedAt: watchlistTickers.addedAt,
      })
      .from(watchlistTickers)
      .where(eq(watchlistTickers.companyId, companyId))
    return res.json(rows)
  })

  // POST /api/watchlist/:companyId  body: { ticker, notes? }
  router.post('/:companyId', async (req, res) => {
    const { companyId } = req.params
    try {
      assertCompanyAccess(req, companyId)
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const parse = tickerSchema.safeParse(req.body?.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    const ticker = parse.data.toUpperCase()
    const notes: string | null = typeof req.body?.notes === 'string' ? req.body.notes : null
    try {
      const rows = await db
        .insert(watchlistTickers)
        .values({ companyId, ticker, notes })
        .returning({
          id: watchlistTickers.id,
          ticker: watchlistTickers.ticker,
          notes: watchlistTickers.notes,
          addedAt: watchlistTickers.addedAt,
        })
      return res.status(201).json(rows[0])
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: `${ticker} is already on your watchlist` })
      }
      throw err
    }
  })

  // DELETE /api/watchlist/:companyId/:ticker
  router.delete('/:companyId/:ticker', async (req, res) => {
    const { companyId, ticker } = req.params
    try {
      assertCompanyAccess(req, companyId)
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    await db
      .delete(watchlistTickers)
      .where(and(eq(watchlistTickers.companyId, companyId), eq(watchlistTickers.ticker, ticker.toUpperCase())))
    return res.status(204).send()
  })

  return router
}
```

- [ ] **Step 4: Run watchlist tests — expect PASS**

```bash
pnpm --filter @paperclipai/server exec vitest run src/routes/watchlist.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 5: Write failing tests for alerts router**

Create `server/src/routes/alerts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createAlertsRouter } from './alerts.js'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}
const COMPANY_ID = '22222222-2222-2222-2222-222222222222'

function buildApp(companyId: string) {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    Object.assign(req, { user: { companyMemberships: [{ companyId, role: 'member' }] } })
    next()
  })
  app.use('/api/alerts', createAlertsRouter(mockDb as any))
  return app
}

describe('alerts router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET /:companyId returns alert rules', async () => {
    const rows = [{ id: 'r1', ticker: 'AAPL', conditionType: 'price_above', threshold: '200', active: true, createdAt: new Date().toISOString() }]
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(rows) }) })
    const res = await request(buildApp(COMPANY_ID)).get(`/api/alerts/${COMPANY_ID}`)
    expect(res.status).toBe(200)
    expect(res.body[0].conditionType).toBe('price_above')
  })

  it('POST /:companyId creates alert rule', async () => {
    const row = { id: 'new', ticker: 'TSLA', conditionType: 'price_below', threshold: '100', active: true, createdAt: new Date().toISOString() }
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }) })
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/alerts/${COMPANY_ID}`)
      .send({ ticker: 'TSLA', conditionType: 'price_below', threshold: '100' })
    expect(res.status).toBe(201)
    expect(res.body.ticker).toBe('TSLA')
  })

  it('POST /:companyId rejects invalid conditionType', async () => {
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/alerts/${COMPANY_ID}`)
      .send({ ticker: 'AAPL', conditionType: 'invalid_type' })
    expect(res.status).toBe(400)
  })

  it('DELETE /:companyId/:alertId deletes rule', async () => {
    mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    const res = await request(buildApp(COMPANY_ID)).delete(`/api/alerts/${COMPANY_ID}/some-id`)
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
pnpm --filter @paperclipai/server exec vitest run src/routes/alerts.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement alerts router**

Create `server/src/routes/alerts.ts`:

```typescript
import { Router } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { alertRules, ALERT_CONDITION_TYPES } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i

const createAlertSchema = z.object({
  ticker: z.string().regex(TICKER_REGEX, 'Invalid ticker symbol'),
  conditionType: z.enum(ALERT_CONDITION_TYPES),
  threshold: z.string().optional(),
  agentId: z.string().uuid().optional(),
})

export function createAlertsRouter(db: Db): Router {
  const router = Router()

  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // GET /api/alerts/:companyId
  router.get('/:companyId', async (req, res) => {
    const { companyId } = req.params
    try { assertCompanyAccess(req, companyId) } catch { return res.status(403).json({ error: 'Forbidden' }) }
    const rows = await db
      .select({
        id: alertRules.id,
        ticker: alertRules.ticker,
        conditionType: alertRules.conditionType,
        threshold: alertRules.threshold,
        agentId: alertRules.agentId,
        active: alertRules.active,
        createdAt: alertRules.createdAt,
      })
      .from(alertRules)
      .where(eq(alertRules.companyId, companyId))
    return res.json(rows)
  })

  // POST /api/alerts/:companyId
  router.post('/:companyId', async (req, res) => {
    const { companyId } = req.params
    try { assertCompanyAccess(req, companyId) } catch { return res.status(403).json({ error: 'Forbidden' }) }
    const parse = createAlertSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.errors[0]?.message ?? 'Invalid input' })
    }
    const { ticker, conditionType, threshold, agentId } = parse.data
    const rows = await db
      .insert(alertRules)
      .values({ companyId, ticker: ticker.toUpperCase(), conditionType, threshold: threshold ?? null, agentId: agentId ?? null })
      .returning({
        id: alertRules.id,
        ticker: alertRules.ticker,
        conditionType: alertRules.conditionType,
        threshold: alertRules.threshold,
        agentId: alertRules.agentId,
        active: alertRules.active,
        createdAt: alertRules.createdAt,
      })
    return res.status(201).json(rows[0])
  })

  // DELETE /api/alerts/:companyId/:alertId
  router.delete('/:companyId/:alertId', async (req, res) => {
    const { companyId, alertId } = req.params
    try { assertCompanyAccess(req, companyId) } catch { return res.status(403).json({ error: 'Forbidden' }) }
    await db
      .delete(alertRules)
      .where(and(eq(alertRules.companyId, companyId), eq(alertRules.id, alertId)))
    return res.status(204).send()
  })

  // PATCH /api/alerts/:companyId/:alertId  body: { active: boolean }
  router.patch('/:companyId/:alertId', async (req, res) => {
    const { companyId, alertId } = req.params
    try { assertCompanyAccess(req, companyId) } catch { return res.status(403).json({ error: 'Forbidden' }) }
    const parse = z.object({ active: z.boolean() }).safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: 'active (boolean) required' })
    const rows = await db
      .update(alertRules)
      .set({ active: parse.data.active })
      .where(and(eq(alertRules.companyId, companyId), eq(alertRules.id, alertId)))
      .returning({ id: alertRules.id, active: alertRules.active })
    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' })
    return res.json(rows[0])
  })

  return router
}
```

- [ ] **Step 8: Run alerts tests — expect PASS**

```bash
pnpm --filter @paperclipai/server exec vitest run src/routes/alerts.test.ts
```

Expected: 4 tests passing.

- [ ] **Step 9: Mount routers in app.ts**

In `server/src/app.ts`, add these two imports near the top with other route imports (around line 45):

```typescript
import { createWatchlistRouter } from "./routes/watchlist.js";
import { createAlertsRouter } from "./routes/alerts.js";
```

Then after the broker router mount (around line 320, after `api.use('/broker', ...)`):

```typescript
  api.use('/watchlist', createWatchlistRouter(db))
  api.use('/alerts', createAlertsRouter(db))
```

- [ ] **Step 10: Typecheck server**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm --filter @paperclipai/server typecheck
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add server/src/routes/watchlist.ts server/src/routes/watchlist.test.ts server/src/routes/alerts.ts server/src/routes/alerts.test.ts server/src/app.ts
git commit -m "feat: add watchlist and alerts CRUD API routes"
```

---

### Task 2: Frontend API modules + queryKeys

**Files:**
- Create: `ui/src/api/market.ts`
- Create: `ui/src/api/broker.ts`
- Create: `ui/src/api/watchlist.ts`
- Create: `ui/src/api/alerts.ts`
- Modify: `ui/src/lib/queryKeys.ts`

- [ ] **Step 1: Create market API module**

Create `ui/src/api/market.ts`:

```typescript
import { api } from "./client";

export interface StockQuote {
  ticker: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  currency: string
  marketState: 'PRE' | 'REGULAR' | 'POST' | 'CLOSED' | 'UNKNOWN'
  timestamp: string
  provider: string
}

export interface NewsItem {
  title: string
  summary: string
  url: string
  source: string
  publishedAt: string
  tickers: string[]
  sentiment?: 'positive' | 'negative' | 'neutral'
  provider: string
}

export interface HistoricalPrice {
  date: string
  open: number
  high: number
  low: number
  close: number
  adjClose?: number
  volume: number
}

export interface EarningsEvent {
  ticker: string
  companyName?: string
  reportDate: string
  estimatedEPS?: number
  actualEPS?: number
  fiscalQuarter?: string
  provider: string
}

export const marketApi = {
  getQuote: (ticker: string) =>
    api.get<StockQuote>(`/market/quote/${encodeURIComponent(ticker)}`),

  getNews: (ticker: string, limit = 10) =>
    api.get<NewsItem[]>(`/market/news/${encodeURIComponent(ticker)}?limit=${limit}`),

  getHistory: (ticker: string, from: string, to: string) =>
    api.get<HistoricalPrice[]>(`/market/history/${encodeURIComponent(ticker)}?from=${from}&to=${to}`),

  getEarningsCalendar: (tickers: string[]) =>
    api.get<EarningsEvent[]>(`/market/earnings-calendar?tickers=${tickers.map(encodeURIComponent).join(',')}`),
};
```

- [ ] **Step 2: Create broker API module**

Create `ui/src/api/broker.ts`:

```typescript
import { api } from "./client";

export interface BrokerConnection {
  id: string
  companyId: string
  broker: string
  active: boolean
  lastSyncedAt: string | null
  tokenExpiresAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PortfolioHolding {
  ticker: string
  assetType: string
  quantity: number
  averageCost: number
  marketValue: number
  broker: string
}

export interface SchwabAuthUrlResponse {
  url: string
}

export const brokerApi = {
  listConnections: (companyId: string) =>
    api.get<BrokerConnection[]>(`/broker/connections/${companyId}`),

  deactivateConnection: (companyId: string, connectionId: string) =>
    api.delete<{ ok: true }>(`/broker/connections/${companyId}/${connectionId}`),

  getSchwabAuthUrl: (companyId: string) =>
    api.get<SchwabAuthUrlResponse>(`/broker/schwab/auth-url?companyId=${encodeURIComponent(companyId)}`),

  getPortfolio: (companyId: string) =>
    api.get<PortfolioHolding[]>(`/broker/portfolio/${companyId}`),

  importCsv: (companyId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return fetch(`/api/broker/portfolio/${companyId}/csv-import`, {
      method: 'POST',
      body: form,
      credentials: 'include',
    }).then(async (r) => {
      if (!r.ok) throw new Error(await r.text())
      return r.json() as Promise<PortfolioHolding[]>
    })
  },
};
```

- [ ] **Step 3: Create watchlist API module**

Create `ui/src/api/watchlist.ts`:

```typescript
import { api } from "./client";

export interface WatchlistTicker {
  id: string
  ticker: string
  notes: string | null
  addedAt: string
}

export const watchlistApi = {
  list: (companyId: string) =>
    api.get<WatchlistTicker[]>(`/watchlist/${companyId}`),

  add: (companyId: string, ticker: string, notes?: string) =>
    api.post<WatchlistTicker>(`/watchlist/${companyId}`, { ticker, notes: notes ?? null }),

  remove: (companyId: string, ticker: string) =>
    api.delete<void>(`/watchlist/${companyId}/${encodeURIComponent(ticker)}`),
};
```

- [ ] **Step 4: Create alerts API module**

Create `ui/src/api/alerts.ts`:

```typescript
import { api } from "./client";

export type AlertConditionType =
  | 'price_above'
  | 'price_below'
  | 'percent_change'
  | 'volume_spike'
  | 'earnings_date'

export interface AlertRule {
  id: string
  ticker: string
  conditionType: AlertConditionType
  threshold: string | null
  agentId: string | null
  active: boolean
  createdAt: string
}

export const CONDITION_LABELS: Record<AlertConditionType, string> = {
  price_above: 'Price above',
  price_below: 'Price below',
  percent_change: 'Price change %',
  volume_spike: 'Volume spike',
  earnings_date: 'Earnings date',
}

export const alertsApi = {
  list: (companyId: string) =>
    api.get<AlertRule[]>(`/alerts/${companyId}`),

  create: (companyId: string, data: { ticker: string; conditionType: AlertConditionType; threshold?: string }) =>
    api.post<AlertRule>(`/alerts/${companyId}`, data),

  delete: (companyId: string, alertId: string) =>
    api.delete<void>(`/alerts/${companyId}/${alertId}`),

  setActive: (companyId: string, alertId: string, active: boolean) =>
    api.patch<{ id: string; active: boolean }>(`/alerts/${companyId}/${alertId}`, { active }),
};
```

- [ ] **Step 5: Add query keys**

In `ui/src/lib/queryKeys.ts`, add these entries to the `queryKeys` object (add before the closing `};`):

```typescript
  market: {
    quote: (ticker: string) => ["market", "quote", ticker] as const,
    news: (ticker: string, limit: number) => ["market", "news", ticker, limit] as const,
    history: (ticker: string, from: string, to: string) => ["market", "history", ticker, from, to] as const,
    earningsCalendar: (tickers: string[]) => ["market", "earnings-calendar", tickers.join(",")] as const,
  },
  broker: {
    connections: (companyId: string) => ["broker", "connections", companyId] as const,
    portfolio: (companyId: string) => ["broker", "portfolio", companyId] as const,
  },
  watchlist: {
    list: (companyId: string) => ["watchlist", companyId] as const,
  },
  alerts: {
    list: (companyId: string) => ["alerts", companyId] as const,
  },
```

- [ ] **Step 6: Typecheck UI**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm --filter @paperclipai/ui typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add ui/src/api/market.ts ui/src/api/broker.ts ui/src/api/watchlist.ts ui/src/api/alerts.ts ui/src/lib/queryKeys.ts
git commit -m "feat: add market, broker, watchlist, alerts API modules and query keys"
```

---

### Task 3: Stub pages + App.tsx routes + Sidebar nav

**Files:**
- Create: `ui/src/pages/Portfolio.tsx` (stub)
- Create: `ui/src/pages/Watchlist.tsx` (stub)
- Create: `ui/src/pages/Alerts.tsx` (stub)
- Create: `ui/src/pages/Market.tsx` (stub)
- Modify: `ui/src/App.tsx`
- Modify: `ui/src/components/Sidebar.tsx`

- [ ] **Step 1: Create stub page files**

Create `ui/src/pages/Portfolio.tsx`:

```typescript
export function Portfolio() {
  return <div className="p-6"><h1 className="text-xl font-semibold">Portfolio</h1><p className="text-muted-foreground mt-1">Coming soon.</p></div>
}
```

Create `ui/src/pages/Watchlist.tsx`:

```typescript
export function Watchlist() {
  return <div className="p-6"><h1 className="text-xl font-semibold">Watchlist</h1><p className="text-muted-foreground mt-1">Coming soon.</p></div>
}
```

Create `ui/src/pages/Alerts.tsx`:

```typescript
export function Alerts() {
  return <div className="p-6"><h1 className="text-xl font-semibold">Alerts</h1><p className="text-muted-foreground mt-1">Coming soon.</p></div>
}
```

Create `ui/src/pages/Market.tsx`:

```typescript
export function Market() {
  return <div className="p-6"><h1 className="text-xl font-semibold">Market</h1><p className="text-muted-foreground mt-1">Coming soon.</p></div>
}
```

- [ ] **Step 2: Add imports to App.tsx**

In `ui/src/App.tsx`, add these four imports after the existing page imports (after `import { NotFoundPage } from "./pages/NotFound";`):

```typescript
import { Portfolio } from "./pages/Portfolio";
import { Watchlist } from "./pages/Watchlist";
import { Alerts } from "./pages/Alerts";
import { Market } from "./pages/Market";
```

- [ ] **Step 3: Add routes to boardRoutes() in App.tsx**

Inside `boardRoutes()`, add these four routes before the `<Route path="*" ...` catch-all:

```tsx
      <Route path="portfolio" element={<Portfolio />} />
      <Route path="watchlist" element={<Watchlist />} />
      <Route path="alerts" element={<Alerts />} />
      <Route path="market" element={<Market />} />
```

- [ ] **Step 4: Add Finance section to Sidebar.tsx**

In `ui/src/components/Sidebar.tsx`, add `TrendingUp`, `Eye`, `Bell`, `BarChart2` to the lucide-react import:

```typescript
import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  Network,
  Boxes,
  Repeat,
  GitBranch,
  Settings,
  TrendingUp,
  Eye,
  Bell,
  BarChart2,
} from "lucide-react";
```

Then add a Finance section after `<SidebarAgents />` and before `<SidebarSection label="Company">`:

```tsx
        <SidebarSection label="Finance">
          <SidebarNavItem to="/portfolio" label="Portfolio" icon={TrendingUp} />
          <SidebarNavItem to="/watchlist" label="Watchlist" icon={Eye} />
          <SidebarNavItem to="/alerts" label="Alerts" icon={Bell} />
          <SidebarNavItem to="/market" label="Market" icon={BarChart2} />
        </SidebarSection>
```

- [ ] **Step 5: Typecheck UI**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add ui/src/pages/Portfolio.tsx ui/src/pages/Watchlist.tsx ui/src/pages/Alerts.tsx ui/src/pages/Market.tsx ui/src/App.tsx ui/src/components/Sidebar.tsx
git commit -m "feat: scaffold finance pages and add sidebar nav and routes"
```

---

### Task 4: Portfolio page

**Files:**
- Modify: `ui/src/pages/Portfolio.tsx`

- [ ] **Step 1: Implement Portfolio page**

Replace the stub content of `ui/src/pages/Portfolio.tsx` with:

```typescript
import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { TrendingUp, Plug, Upload, Trash2, RefreshCw } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { useToast } from "../context/ToastContext"
import { queryKeys } from "../lib/queryKeys"
import { brokerApi } from "../api/broker"
import type { BrokerConnection, PortfolioHolding } from "../api/broker"
import { Button } from "@/components/ui/button"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value)
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function ConnectionCard({ conn, onDisconnect }: { conn: BrokerConnection; onDisconnect: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-medium capitalize">{conn.broker}</p>
        <p className="text-xs text-muted-foreground">
          {conn.lastSyncedAt ? `Last synced ${new Date(conn.lastSyncedAt).toLocaleDateString()}` : "Never synced"}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={onDisconnect} className="text-destructive hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

function HoldingsTable({ holdings }: { holdings: PortfolioHolding[] }) {
  const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0)
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Holdings</h2>
        <span className="text-sm font-semibold">{formatCurrency(totalValue)} total</span>
      </div>
      <div className="border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">Ticker</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Avg Cost</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Market Value</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Gain/Loss</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {holdings.map((h) => {
              const costBasis = h.quantity * h.averageCost
              const gainLoss = h.marketValue - costBasis
              const gainLossPct = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0
              return (
                <tr key={`${h.ticker}-${h.broker}`} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-3 font-mono font-semibold">{h.ticker}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{h.quantity.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(h.averageCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatCurrency(h.marketValue)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${gainLoss >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatCurrency(gainLoss)} ({formatPercent(gainLossPct)})
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground capitalize">{h.broker}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Portfolio() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvHoldings, setCsvHoldings] = useState<PortfolioHolding[]>([])
  const [csvUploading, setCsvUploading] = useState(false)

  useEffect(() => {
    setBreadcrumbs([{ label: "Portfolio" }])
  }, [setBreadcrumbs])

  const { data: connections, isLoading: connLoading } = useQuery({
    queryKey: queryKeys.broker.connections(selectedCompanyId!),
    queryFn: () => brokerApi.listConnections(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const { data: holdings, isLoading: holdingsLoading, refetch: refetchHoldings } = useQuery({
    queryKey: queryKeys.broker.portfolio(selectedCompanyId!),
    queryFn: () => brokerApi.getPortfolio(selectedCompanyId!),
    enabled: !!selectedCompanyId && (connections?.length ?? 0) > 0,
  })

  const disconnectMutation = useMutation({
    mutationFn: ({ connectionId }: { connectionId: string }) =>
      brokerApi.deactivateConnection(selectedCompanyId!, connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.broker.connections(selectedCompanyId!) })
      queryClient.invalidateQueries({ queryKey: queryKeys.broker.portfolio(selectedCompanyId!) })
      showToast({ message: "Broker disconnected", tone: "default" })
    },
  })

  async function handleConnectSchwab() {
    if (!selectedCompanyId) return
    try {
      const { url } = await brokerApi.getSchwabAuthUrl(selectedCompanyId)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      showToast({ message: "Failed to get Schwab auth URL", tone: "destructive" })
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedCompanyId) return
    setCsvUploading(true)
    try {
      const result = await brokerApi.importCsv(selectedCompanyId, file)
      setCsvHoldings(result)
      showToast({ message: `Imported ${result.length} holdings from CSV`, tone: "default" })
    } catch {
      showToast({ message: "Failed to parse CSV", tone: "destructive" })
    } finally {
      setCsvUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={TrendingUp} message="Select a company to view portfolio." />
  }

  if (connLoading) return <PageSkeleton variant="dashboard" />

  const allHoldings = [...(holdings ?? []), ...csvHoldings]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Connected broker accounts and holdings</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={csvUploading}>
            <Upload className="h-4 w-4 mr-1.5" />
            {csvUploading ? "Importing…" : "Import CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleConnectSchwab}>
            <Plug className="h-4 w-4 mr-1.5" />
            Connect Schwab
          </Button>
        </div>
      </div>

      {/* Broker connections */}
      {(connections?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Connected Accounts</h2>
          {connections!.map((conn) => (
            <ConnectionCard
              key={conn.id}
              conn={conn}
              onDisconnect={() => disconnectMutation.mutate({ connectionId: conn.id })}
            />
          ))}
        </div>
      )}

      {/* Holdings */}
      {allHoldings.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span />
            <Button variant="ghost" size="sm" onClick={() => refetchHoldings()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Refresh
            </Button>
          </div>
          <HoldingsTable holdings={allHoldings} />
        </div>
      ) : (connections?.length ?? 0) === 0 ? (
        <EmptyState
          icon={TrendingUp}
          message="No broker connected. Click 'Connect Schwab' to link your account, or import a CSV."
        />
      ) : holdingsLoading ? (
        <PageSkeleton variant="dashboard" />
      ) : (
        <EmptyState icon={TrendingUp} message="No holdings found in connected accounts." />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check what useToast looks like — use the correct toast hook**

Run:
```bash
grep -r "useToast\|showToast\|toast(" "/Users/Samster/stockpilot ai/ui/src/context/ToastContext.tsx" | head -10
grep -r "useToast" "/Users/Samster/stockpilot ai/ui/src/pages/Dashboard.tsx" | head -5
```

If `useToast` / `showToast` doesn't match the actual API, adjust the import and call to match the existing pattern. Look at how `Dashboard.tsx` or another page shows toasts and mirror that.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Fix any type errors.

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/Portfolio.tsx
git commit -m "feat: implement Portfolio page with broker connections and holdings"
```

---

### Task 5: Watchlist page

**Files:**
- Modify: `ui/src/pages/Watchlist.tsx`

- [ ] **Step 1: Implement Watchlist page**

Replace stub in `ui/src/pages/Watchlist.tsx`:

```typescript
import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Eye, Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { watchlistApi } from "../api/watchlist"
import { marketApi } from "../api/market"
import type { WatchlistTicker } from "../api/watchlist"
import type { StockQuote } from "../api/market"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/i

function QuoteBadge({ ticker }: { ticker: string }) {
  const { data } = useQuery({
    queryKey: queryKeys.market.quote(ticker),
    queryFn: () => marketApi.getQuote(ticker),
    staleTime: 60_000,
    retry: false,
  })
  if (!data) return <span className="text-xs text-muted-foreground">—</span>
  const up = data.change >= 0
  return (
    <span className={`flex items-center gap-1 text-sm tabular-nums ${up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      ${data.price.toFixed(2)}
      <span className="text-xs opacity-70">
        ({up ? "+" : ""}{data.changePercent.toFixed(2)}%)
      </span>
    </span>
  )
}

function TickerRow({ item, onRemove }: { item: WatchlistTicker; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="font-mono font-semibold text-sm w-16">{item.ticker}</span>
        <QuoteBadge ticker={item.ticker} />
      </div>
      <div className="flex items-center gap-3">
        {item.notes && <span className="text-xs text-muted-foreground hidden sm:block">{item.notes}</span>}
        <Button variant="ghost" size="icon-sm" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function Watchlist() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const queryClient = useQueryClient()
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Watchlist" }])
  }, [setBreadcrumbs])

  const { data: tickers, isLoading } = useQuery({
    queryKey: queryKeys.watchlist.list(selectedCompanyId!),
    queryFn: () => watchlistApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const addMutation = useMutation({
    mutationFn: (ticker: string) => watchlistApi.add(selectedCompanyId!, ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.list(selectedCompanyId!) })
      setInput("")
      setError(null)
    },
    onError: (err: any) => {
      setError(err?.message ?? "Failed to add ticker")
    },
  })

  const removeMutation = useMutation({
    mutationFn: (ticker: string) => watchlistApi.remove(selectedCompanyId!, ticker),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist.list(selectedCompanyId!) })
    },
  })

  function handleAdd() {
    const val = input.trim().toUpperCase()
    if (!TICKER_RE.test(val)) {
      setError("Invalid ticker symbol")
      return
    }
    addMutation.mutate(val)
  }

  if (!selectedCompanyId) return <EmptyState icon={Eye} message="Select a company to view your watchlist." />
  if (isLoading) return <PageSkeleton variant="dashboard" />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track tickers and monitor live prices</p>
        </div>
      </div>

      {/* Add ticker form */}
      <div className="flex gap-2 max-w-sm">
        <Input
          placeholder="e.g. AAPL"
          value={input}
          onChange={(e) => { setInput(e.target.value.toUpperCase()); setError(null) }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="font-mono"
          maxLength={20}
        />
        <Button onClick={handleAdd} disabled={addMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-destructive -mt-4">{error}</p>}

      {/* Ticker list */}
      {(tickers?.length ?? 0) === 0 ? (
        <EmptyState icon={Eye} message="No tickers on your watchlist yet. Add one above." />
      ) : (
        <div className="border border-border overflow-hidden">
          {tickers!.map((item) => (
            <TickerRow
              key={item.id}
              item={item}
              onRemove={() => removeMutation.mutate(item.ticker)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Fix any type errors.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/Watchlist.tsx
git commit -m "feat: implement Watchlist page with live quote badges"
```

---

### Task 6: Alerts page

**Files:**
- Modify: `ui/src/pages/Alerts.tsx`

- [ ] **Step 1: Implement Alerts page**

Replace stub in `ui/src/pages/Alerts.tsx`:

```typescript
import { useEffect, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { alertsApi, CONDITION_LABELS } from "../api/alerts"
import type { AlertRule, AlertConditionType } from "../api/alerts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "../components/EmptyState"
import { PageSkeleton } from "../components/PageSkeleton"

const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/i
const CONDITION_TYPES: AlertConditionType[] = ['price_above', 'price_below', 'percent_change', 'volume_spike', 'earnings_date']
const NEEDS_THRESHOLD: AlertConditionType[] = ['price_above', 'price_below', 'percent_change']

function AlertRow({ rule, onDelete, onToggle }: { rule: AlertRule; onDelete: () => void; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="font-mono font-semibold text-sm w-16">{rule.ticker}</span>
        <Badge variant={rule.active ? "default" : "secondary"} className="text-xs">
          {CONDITION_LABELS[rule.conditionType]}
          {rule.threshold ? ` ${rule.threshold}` : ""}
        </Badge>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onToggle} title={rule.active ? "Disable alert" : "Enable alert"}>
          {rule.active
            ? <ToggleRight className="h-4 w-4 text-green-500" />
            : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export function Alerts() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const queryClient = useQueryClient()
  const [ticker, setTicker] = useState("")
  const [conditionType, setConditionType] = useState<AlertConditionType>("price_above")
  const [threshold, setThreshold] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Alerts" }])
  }, [setBreadcrumbs])

  const { data: alerts, isLoading } = useQuery({
    queryKey: queryKeys.alerts.list(selectedCompanyId!),
    queryFn: () => alertsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      alertsApi.create(selectedCompanyId!, {
        ticker: ticker.trim().toUpperCase(),
        conditionType,
        threshold: NEEDS_THRESHOLD.includes(conditionType) ? threshold : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.list(selectedCompanyId!) })
      setTicker("")
      setThreshold("")
      setFormError(null)
    },
    onError: (err: any) => setFormError(err?.message ?? "Failed to create alert"),
  })

  const deleteMutation = useMutation({
    mutationFn: (alertId: string) => alertsApi.delete(selectedCompanyId!, alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.list(selectedCompanyId!) }),
  })

  const toggleMutation = useMutation({
    mutationFn: (rule: AlertRule) => alertsApi.setActive(selectedCompanyId!, rule.id, !rule.active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alerts.list(selectedCompanyId!) }),
  })

  function handleCreate() {
    const t = ticker.trim().toUpperCase()
    if (!TICKER_RE.test(t)) { setFormError("Invalid ticker symbol"); return }
    if (NEEDS_THRESHOLD.includes(conditionType) && !threshold.trim()) {
      setFormError("Threshold value is required for this condition type")
      return
    }
    createMutation.mutate()
  }

  if (!selectedCompanyId) return <EmptyState icon={Bell} message="Select a company to manage alerts." />
  if (isLoading) return <PageSkeleton variant="dashboard" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Alerts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Get notified when price conditions are met</p>
      </div>

      {/* Create alert form */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-medium">New Alert</h2>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Ticker (e.g. AAPL)"
            value={ticker}
            onChange={(e) => { setTicker(e.target.value.toUpperCase()); setFormError(null) }}
            className="font-mono w-32"
            maxLength={20}
          />
          <Select value={conditionType} onValueChange={(v) => setConditionType(v as AlertConditionType)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_TYPES.map((ct) => (
                <SelectItem key={ct} value={ct}>{CONDITION_LABELS[ct]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {NEEDS_THRESHOLD.includes(conditionType) && (
            <Input
              placeholder="Value (e.g. 150)"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-32"
            />
          )}
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            Add Alert
          </Button>
        </div>
        {formError && <p className="text-sm text-destructive">{formError}</p>}
      </div>

      {/* Alert list */}
      {(alerts?.length ?? 0) === 0 ? (
        <EmptyState icon={Bell} message="No alerts set. Create one above." />
      ) : (
        <div className="border border-border overflow-hidden">
          {alerts!.map((rule) => (
            <AlertRow
              key={rule.id}
              rule={rule}
              onDelete={() => deleteMutation.mutate(rule.id)}
              onToggle={() => toggleMutation.mutate(rule)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Fix any type errors.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/Alerts.tsx
git commit -m "feat: implement Alerts page with create/delete/toggle"
```

---

### Task 7: Market page

**Files:**
- Modify: `ui/src/pages/Market.tsx`

- [ ] **Step 1: Implement Market page**

Replace stub in `ui/src/pages/Market.tsx`:

```typescript
import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { BarChart2, Search, TrendingUp, TrendingDown, ExternalLink } from "lucide-react"
import { useCompany } from "../context/CompanyContext"
import { useBreadcrumbs } from "../context/BreadcrumbContext"
import { queryKeys } from "../lib/queryKeys"
import { marketApi } from "../api/market"
import type { HistoricalPrice } from "../api/market"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "../components/EmptyState"

const TICKER_RE = /^[A-Z0-9.\-^=]{1,20}$/i

function PriceChart({ prices }: { prices: HistoricalPrice[] }) {
  if (prices.length < 2) return null
  const closes = prices.map((p) => p.close)
  const minClose = Math.min(...closes)
  const maxClose = Math.max(...closes)
  const range = maxClose - minClose || 1
  const w = 600
  const h = 120
  const pad = 8
  const points = prices.map((p, i) => {
    const x = pad + (i / (prices.length - 1)) * (w - pad * 2)
    const y = pad + ((maxClose - p.close) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")
  const isUp = closes[closes.length - 1] >= closes[0]
  const color = isUp ? "#22c55e" : "#ef4444"
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex justify-between text-xs text-muted-foreground mb-2">
        <span>${minClose.toFixed(2)}</span>
        <span>30-day price history</span>
        <span>${maxClose.toFixed(2)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
        <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
      </svg>
    </div>
  )
}

function QuoteCard({ ticker }: { ticker: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: quote, isLoading: quoteLoading, error: quoteError } = useQuery({
    queryKey: queryKeys.market.quote(ticker),
    queryFn: () => marketApi.getQuote(ticker),
    staleTime: 60_000,
  })

  const { data: history } = useQuery({
    queryKey: queryKeys.market.history(ticker, thirtyDaysAgo, today),
    queryFn: () => marketApi.getHistory(ticker, thirtyDaysAgo, today),
    staleTime: 60_000,
  })

  const { data: news } = useQuery({
    queryKey: queryKeys.market.news(ticker, 5),
    queryFn: () => marketApi.getNews(ticker, 5),
    staleTime: 5 * 60_000,
  })

  if (quoteLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (quoteError) return <p className="text-sm text-destructive">Failed to load quote for {ticker}.</p>
  if (!quote) return null

  const up = quote.change >= 0

  return (
    <div className="space-y-4">
      {/* Quote header */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-mono font-bold">{ticker}</h2>
            <p className="text-sm text-muted-foreground capitalize">{quote.marketState.toLowerCase()} market</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums">${quote.price.toFixed(2)}</p>
            <p className={`flex items-center justify-end gap-1 text-sm tabular-nums font-medium ${up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {up ? "+" : ""}{quote.change.toFixed(2)} ({up ? "+" : ""}{quote.changePercent.toFixed(2)}%)
            </p>
          </div>
        </div>
        {(quote.fiftyTwoWeekHigh || quote.fiftyTwoWeekLow) && (
          <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
            {quote.fiftyTwoWeekHigh && <span>52W High: <span className="text-foreground">${quote.fiftyTwoWeekHigh.toFixed(2)}</span></span>}
            {quote.fiftyTwoWeekLow && <span>52W Low: <span className="text-foreground">${quote.fiftyTwoWeekLow.toFixed(2)}</span></span>}
            {quote.volume && <span>Volume: <span className="text-foreground">{quote.volume.toLocaleString()}</span></span>}
          </div>
        )}
      </div>

      {/* Price chart */}
      {history && history.length > 1 && <PriceChart prices={history} />}

      {/* News */}
      {news && news.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Recent News</h3>
          <div className="border border-border divide-y divide-border overflow-hidden">
            {news.map((item, i) => (
              <a
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-accent/30 transition-colors no-underline text-inherit block"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.source} · {new Date(item.publishedAt).toLocaleDateString()}
                    {item.sentiment && (
                      <Badge variant={item.sentiment === "positive" ? "default" : item.sentiment === "negative" ? "destructive" : "secondary"} className="ml-2 text-[10px]">
                        {item.sentiment}
                      </Badge>
                    )}
                  </p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Market() {
  const { selectedCompanyId } = useCompany()
  const { setBreadcrumbs } = useBreadcrumbs()
  const [input, setInput] = useState("")
  const [activeTicker, setActiveTicker] = useState<string | null>(null)

  useEffect(() => {
    setBreadcrumbs([{ label: "Market" }])
  }, [setBreadcrumbs])

  function handleSearch() {
    const val = input.trim().toUpperCase()
    if (TICKER_RE.test(val)) setActiveTicker(val)
  }

  if (!selectedCompanyId) return <EmptyState icon={BarChart2} message="Select a company to use market data." />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Market</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Look up quotes, price history, and news</p>
      </div>

      <div className="flex gap-2 max-w-sm">
        <Input
          placeholder="Enter ticker (e.g. AAPL)"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="font-mono"
          maxLength={20}
        />
        <Button onClick={handleSearch}>
          <Search className="h-4 w-4 mr-1" />
          Look up
        </Button>
      </div>

      {activeTicker ? (
        <QuoteCard ticker={activeTicker} />
      ) : (
        <EmptyState icon={BarChart2} message="Enter a ticker symbol above to look up a stock." />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @paperclipai/ui typecheck
```

Fix any type errors.

- [ ] **Step 3: Push to GitHub**

```bash
git add ui/src/pages/Market.tsx
git commit -m "feat: implement Market page with quote, history chart, and news"
git push origin HEAD
```

---

## Self-Review

### Spec coverage
- ✅ Portfolio page — broker connections list, holdings table, CSV import, connect Schwab button
- ✅ Watchlist page — list tickers, add ticker, remove ticker, live quote badge per ticker
- ✅ Alerts page — list alerts, create alert (ticker + condition type + threshold), toggle active, delete
- ✅ Market page — ticker search, quote card, 30-day price history SVG chart, news feed
- ✅ Backend CRUD routes for watchlist and alerts (market and broker already existed)
- ✅ Sidebar Finance section with all 4 nav items
- ✅ Routes wired in App.tsx

### Placeholder scan
None found — all steps have full code.

### Type consistency
- `WatchlistTicker`, `AlertRule`, `StockQuote`, `HistoricalPrice`, `NewsItem`, `BrokerConnection`, `PortfolioHolding` defined in Task 2 and reused consistently in Tasks 3–7.
- `queryKeys.market.*`, `queryKeys.broker.*`, `queryKeys.watchlist.*`, `queryKeys.alerts.*` defined in Task 2 and used in Tasks 3–7.
- `ALERT_CONDITION_TYPES` exported from `api/alerts.ts` and used in Alerts page.
