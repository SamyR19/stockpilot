# StockPilot AI — Plan 2: Market Data Adapters

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `packages/market-data` library with Yahoo Finance, Alpha Vantage, and Polygon providers, then expose live market data via server API routes that agents and the UI can call.

**Architecture:** A new `packages/market-data` workspace package exports a `MarketDataClient` that selects the best available provider based on which API keys are configured. Yahoo Finance is always available (no key needed). Alpha Vantage and Polygon unlock on their respective keys. Server routes in `server/src/routes/market.ts` wrap the client with auth, validation, and rate limiting.

**Tech Stack:** TypeScript, `yahoo-finance2` npm package, Alpha Vantage REST API, Polygon.io REST API, Express, Zod (input validation), Vitest

---

## File Map

### Created
- `packages/market-data/package.json`
- `packages/market-data/tsconfig.json`
- `packages/market-data/src/types.ts` — shared data types (StockQuote, NewsItem, HistoricalPrice, EarningsEvent)
- `packages/market-data/src/providers/yahoo-finance.ts` — Yahoo Finance provider (free tier)
- `packages/market-data/src/providers/alpha-vantage.ts` — Alpha Vantage provider (API key)
- `packages/market-data/src/providers/polygon.ts` — Polygon.io provider (API key)
- `packages/market-data/src/client.ts` — MarketDataClient (selects provider, unified interface)
- `packages/market-data/src/index.ts` — package exports
- `packages/market-data/src/providers/yahoo-finance.test.ts` — Yahoo Finance tests (mock HTTP)
- `packages/market-data/src/client.test.ts` — MarketDataClient tests
- `server/src/routes/market.ts` — Express routes: quote, news, history, earnings-calendar

### Modified
- Root `package.json` — add `packages/market-data` to workspaces (if not using glob)
- `server/src/app.ts` — mount market routes
- `server/src/config.ts` — add ALPHA_VANTAGE_API_KEY, POLYGON_API_KEY env vars

---

## Task 1: Market Data Types

**Files:**
- Create: `packages/market-data/package.json`
- Create: `packages/market-data/tsconfig.json`
- Create: `packages/market-data/src/types.ts`
- Create: `packages/market-data/src/index.ts`

- [ ] **Step 1: Read an existing package for patterns**

```bash
cat "/Users/Samster/stockpilot ai/packages/shared/package.json"
cat "/Users/Samster/stockpilot ai/packages/shared/tsconfig.json"
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "@stockpilotai/market-data",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "yahoo-finance2": "^2.13.3",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create tsconfig.json** (copy pattern from `packages/shared/tsconfig.json`, adjust paths)

- [ ] **Step 4: Create `src/types.ts`**

```typescript
// packages/market-data/src/types.ts

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
  timestamp: Date
  provider: MarketDataProvider
}

export interface NewsItem {
  title: string
  summary: string
  url: string
  source: string
  publishedAt: Date
  tickers: string[]
  sentiment?: 'positive' | 'negative' | 'neutral'
  provider: MarketDataProvider
}

export interface HistoricalPrice {
  date: Date
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
  reportDate: Date
  estimatedEPS?: number
  actualEPS?: number
  fiscalQuarter?: string
  provider: MarketDataProvider
}

export interface MarketDataProviderConfig {
  alphaVantageApiKey?: string
  polygonApiKey?: string
}

export type MarketDataProvider = 'yahoo-finance' | 'alpha-vantage' | 'polygon'

export interface IMarketDataProvider {
  name: MarketDataProvider
  getQuote(ticker: string): Promise<StockQuote>
  getNews(ticker: string, limit?: number): Promise<NewsItem[]>
  getHistory(ticker: string, fromDate: Date, toDate: Date): Promise<HistoricalPrice[]>
  getEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]>
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    public readonly provider: MarketDataProvider,
    public readonly ticker?: string,
  ) {
    super(message)
    this.name = 'MarketDataError'
  }
}
```

- [ ] **Step 5: Create `src/index.ts`**

```typescript
// packages/market-data/src/index.ts
export type {
  StockQuote,
  NewsItem,
  HistoricalPrice,
  EarningsEvent,
  MarketDataProviderConfig,
  MarketDataProvider,
  IMarketDataProvider,
} from './types.js'
export { MarketDataError } from './types.js'
export { MarketDataClient } from './client.js'
```

- [ ] **Step 6: Install dependencies**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add packages/market-data/
git commit -m "feat: add market-data package scaffold and types"
```

---

## Task 2: Yahoo Finance Provider

**Files:**
- Create: `packages/market-data/src/providers/yahoo-finance.ts`
- Create: `packages/market-data/src/providers/yahoo-finance.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/market-data/src/providers/yahoo-finance.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { YahooFinanceProvider } from './yahoo-finance.js'

vi.mock('yahoo-finance2', () => ({
  default: {
    quote: vi.fn(),
    search: vi.fn(),
    historical: vi.fn(),
    quoteSummary: vi.fn(),
  },
}))

import yahooFinance from 'yahoo-finance2'

describe('YahooFinanceProvider', () => {
  let provider: YahooFinanceProvider

  beforeEach(() => {
    provider = new YahooFinanceProvider()
    vi.clearAllMocks()
  })

  describe('getQuote', () => {
    it('returns a StockQuote for a valid ticker', async () => {
      vi.mocked(yahooFinance.quote).mockResolvedValue({
        symbol: 'AAPL',
        regularMarketPrice: 175.50,
        regularMarketChange: 2.30,
        regularMarketChangePercent: 1.33,
        regularMarketVolume: 55000000,
        marketCap: 2700000000000,
        fiftyTwoWeekHigh: 199.62,
        fiftyTwoWeekLow: 124.17,
        currency: 'USD',
        marketState: 'REGULAR',
        regularMarketTime: new Date('2026-05-31T20:00:00Z'),
      } as any)

      const quote = await provider.getQuote('AAPL')

      expect(quote.ticker).toBe('AAPL')
      expect(quote.price).toBe(175.50)
      expect(quote.change).toBe(2.30)
      expect(quote.changePercent).toBe(1.33)
      expect(quote.provider).toBe('yahoo-finance')
    })

    it('throws MarketDataError when yahoo-finance2 throws', async () => {
      vi.mocked(yahooFinance.quote).mockRejectedValue(new Error('Not found'))

      await expect(provider.getQuote('INVALID')).rejects.toThrow('MarketDataError')
    })

    it('validates ticker is not empty', async () => {
      await expect(provider.getQuote('')).rejects.toThrow('MarketDataError')
    })
  })

  describe('getNews', () => {
    it('returns news items for a ticker', async () => {
      vi.mocked(yahooFinance.search).mockResolvedValue({
        news: [
          {
            title: 'Apple Reports Record Revenue',
            link: 'https://example.com/apple-revenue',
            publisher: 'Reuters',
            providerPublishTime: 1748736000,
            relatedTickers: ['AAPL'],
          },
        ],
      } as any)

      const news = await provider.getNews('AAPL', 5)

      expect(news).toHaveLength(1)
      expect(news[0].title).toBe('Apple Reports Record Revenue')
      expect(news[0].provider).toBe('yahoo-finance')
    })

    it('returns empty array when no news found', async () => {
      vi.mocked(yahooFinance.search).mockResolvedValue({ news: [] } as any)
      const news = await provider.getNews('AAPL')
      expect(news).toEqual([])
    })
  })

  describe('getHistory', () => {
    it('returns historical prices', async () => {
      const mockData = [
        { date: new Date('2026-05-01'), open: 170, high: 176, low: 169, close: 174, adjClose: 174, volume: 50000000 },
      ]
      vi.mocked(yahooFinance.historical).mockResolvedValue(mockData as any)

      const history = await provider.getHistory('AAPL', new Date('2026-05-01'), new Date('2026-05-31'))

      expect(history).toHaveLength(1)
      expect(history[0].close).toBe(174)
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/providers/yahoo-finance.test.ts 2>&1 | tail -5
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement Yahoo Finance provider**

```typescript
// packages/market-data/src/providers/yahoo-finance.ts
import yahooFinance from 'yahoo-finance2'
import type { IMarketDataProvider, StockQuote, NewsItem, HistoricalPrice, EarningsEvent } from '../types.js'
import { MarketDataError } from '../types.js'

function validateTicker(ticker: string): void {
  if (!ticker || ticker.trim().length === 0) {
    throw new MarketDataError('Ticker cannot be empty', 'yahoo-finance')
  }
  if (!/^[A-Z0-9.\-^=]{1,20}$/i.test(ticker)) {
    throw new MarketDataError(`Invalid ticker format: ${ticker}`, 'yahoo-finance', ticker)
  }
}

export class YahooFinanceProvider implements IMarketDataProvider {
  readonly name = 'yahoo-finance' as const

  async getQuote(ticker: string): Promise<StockQuote> {
    validateTicker(ticker)
    try {
      const result = await yahooFinance.quote(ticker.toUpperCase())
      return {
        ticker: result.symbol ?? ticker.toUpperCase(),
        price: result.regularMarketPrice ?? 0,
        change: result.regularMarketChange ?? 0,
        changePercent: result.regularMarketChangePercent ?? 0,
        volume: result.regularMarketVolume ?? 0,
        marketCap: result.marketCap ?? undefined,
        fiftyTwoWeekHigh: result.fiftyTwoWeekHigh ?? undefined,
        fiftyTwoWeekLow: result.fiftyTwoWeekLow ?? undefined,
        currency: result.currency ?? 'USD',
        marketState: (result.marketState as StockQuote['marketState']) ?? 'UNKNOWN',
        timestamp: result.regularMarketTime ?? new Date(),
        provider: 'yahoo-finance',
      }
    } catch (err) {
      if (err instanceof MarketDataError) throw err
      throw new MarketDataError(
        `Failed to fetch quote for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
        'yahoo-finance',
        ticker,
      )
    }
  }

  async getNews(ticker: string, limit = 10): Promise<NewsItem[]> {
    validateTicker(ticker)
    try {
      const result = await yahooFinance.search(ticker.toUpperCase(), { newsCount: limit })
      return (result.news ?? []).map((item: any) => ({
        title: item.title ?? '',
        summary: '',
        url: item.link ?? '',
        source: item.publisher ?? '',
        publishedAt: item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000)
          : new Date(),
        tickers: item.relatedTickers ?? [ticker.toUpperCase()],
        provider: 'yahoo-finance' as const,
      }))
    } catch (err) {
      if (err instanceof MarketDataError) throw err
      throw new MarketDataError(
        `Failed to fetch news for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
        'yahoo-finance',
        ticker,
      )
    }
  }

  async getHistory(ticker: string, fromDate: Date, toDate: Date): Promise<HistoricalPrice[]> {
    validateTicker(ticker)
    try {
      const results = await yahooFinance.historical(ticker.toUpperCase(), {
        period1: fromDate,
        period2: toDate,
      })
      return results.map((item: any) => ({
        date: item.date,
        open: item.open ?? 0,
        high: item.high ?? 0,
        low: item.low ?? 0,
        close: item.close ?? 0,
        adjClose: item.adjClose ?? undefined,
        volume: item.volume ?? 0,
      }))
    } catch (err) {
      if (err instanceof MarketDataError) throw err
      throw new MarketDataError(
        `Failed to fetch history for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
        'yahoo-finance',
        ticker,
      )
    }
  }

  async getEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]> {
    const results: EarningsEvent[] = []
    for (const ticker of tickers) {
      try {
        validateTicker(ticker)
        const summary = await yahooFinance.quoteSummary(ticker.toUpperCase(), {
          modules: ['calendarEvents'],
        })
        const events = (summary as any).calendarEvents?.earnings
        if (events?.earningsDate?.length) {
          results.push({
            ticker: ticker.toUpperCase(),
            reportDate: new Date(events.earningsDate[0]),
            estimatedEPS: events.earningsAverage?.raw ?? undefined,
            fiscalQuarter: undefined,
            provider: 'yahoo-finance',
          })
        }
      } catch {
        // Skip tickers that fail — don't abort the whole calendar
      }
    }
    return results
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/providers/yahoo-finance.test.ts 2>&1 | tail -10
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/market-data/src/providers/
git commit -m "feat: add Yahoo Finance market data provider"
```

---

## Task 3: Alpha Vantage Provider

**Files:**
- Create: `packages/market-data/src/providers/alpha-vantage.ts`
- Create: `packages/market-data/src/providers/alpha-vantage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/market-data/src/providers/alpha-vantage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AlphaVantageProvider } from './alpha-vantage.js'
import { MarketDataError } from '../types.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockAlphaVantageResponse(data: unknown) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => data,
  })
}

describe('AlphaVantageProvider', () => {
  let provider: AlphaVantageProvider

  beforeEach(() => {
    provider = new AlphaVantageProvider('test-api-key')
    vi.clearAllMocks()
  })

  describe('getQuote', () => {
    it('returns a StockQuote for a valid ticker', async () => {
      mockAlphaVantageResponse({
        'Global Quote': {
          '01. symbol': 'AAPL',
          '05. price': '175.50',
          '09. change': '2.30',
          '10. change percent': '1.3300%',
          '06. volume': '55000000',
          '07. latest trading day': '2026-05-31',
        },
      })

      const quote = await provider.getQuote('AAPL')

      expect(quote.ticker).toBe('AAPL')
      expect(quote.price).toBe(175.50)
      expect(quote.change).toBe(2.30)
      expect(quote.provider).toBe('alpha-vantage')
    })

    it('throws MarketDataError when API returns empty response', async () => {
      mockAlphaVantageResponse({ 'Global Quote': {} })
      await expect(provider.getQuote('INVALID')).rejects.toThrow(MarketDataError)
    })

    it('throws MarketDataError when rate limited', async () => {
      mockAlphaVantageResponse({
        Note: 'Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute',
      })
      await expect(provider.getQuote('AAPL')).rejects.toThrow('rate limit')
    })
  })

  describe('getNews', () => {
    it('returns news items', async () => {
      mockAlphaVantageResponse({
        feed: [
          {
            title: 'Apple Q2 Earnings Beat',
            url: 'https://example.com/apple',
            source: 'Reuters',
            time_published: '20260531T120000',
            ticker_sentiment: [{ ticker: 'AAPL', ticker_sentiment_label: 'Bullish' }],
            summary: 'Apple reported Q2 earnings above expectations.',
          },
        ],
      })

      const news = await provider.getNews('AAPL', 5)

      expect(news).toHaveLength(1)
      expect(news[0].title).toBe('Apple Q2 Earnings Beat')
      expect(news[0].sentiment).toBe('positive')
      expect(news[0].provider).toBe('alpha-vantage')
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/providers/alpha-vantage.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement Alpha Vantage provider**

```typescript
// packages/market-data/src/providers/alpha-vantage.ts
import type { IMarketDataProvider, StockQuote, NewsItem, HistoricalPrice, EarningsEvent } from '../types.js'
import { MarketDataError } from '../types.js'

const BASE_URL = 'https://www.alphavantage.co/query'

function parseSentiment(label?: string): NewsItem['sentiment'] {
  if (!label) return 'neutral'
  const l = label.toLowerCase()
  if (l.includes('bullish')) return 'positive'
  if (l.includes('bearish')) return 'negative'
  return 'neutral'
}

function parseAlphaDate(str: string): Date {
  // Format: 20260531T120000
  const y = str.slice(0, 4)
  const mo = str.slice(4, 6)
  const d = str.slice(6, 8)
  const h = str.slice(9, 11)
  const mi = str.slice(11, 13)
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`)
}

export class AlphaVantageProvider implements IMarketDataProvider {
  readonly name = 'alpha-vantage' as const

  constructor(private readonly apiKey: string) {}

  private async fetch<T>(params: Record<string, string>): Promise<T> {
    const url = new URL(BASE_URL)
    url.searchParams.set('apikey', this.apiKey)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new MarketDataError(`Alpha Vantage HTTP error: ${res.status}`, 'alpha-vantage')
    }
    const data = (await res.json()) as T & { Note?: string; Information?: string }
    const note = (data as any).Note ?? (data as any).Information
    if (note?.toLowerCase().includes('rate limit') || note?.toLowerCase().includes('call frequency')) {
      throw new MarketDataError('Alpha Vantage rate limit reached', 'alpha-vantage')
    }
    return data
  }

  async getQuote(ticker: string): Promise<StockQuote> {
    const data = await this.fetch<any>({ function: 'GLOBAL_QUOTE', symbol: ticker.toUpperCase() })
    const q = data['Global Quote']
    if (!q || !q['05. price']) {
      throw new MarketDataError(`No data returned for ${ticker}`, 'alpha-vantage', ticker)
    }
    return {
      ticker: q['01. symbol'] ?? ticker.toUpperCase(),
      price: parseFloat(q['05. price']),
      change: parseFloat(q['09. change'] ?? '0'),
      changePercent: parseFloat((q['10. change percent'] ?? '0%').replace('%', '')),
      volume: parseInt(q['06. volume'] ?? '0', 10),
      currency: 'USD',
      marketState: 'UNKNOWN',
      timestamp: q['07. latest trading day'] ? new Date(q['07. latest trading day']) : new Date(),
      provider: 'alpha-vantage',
    }
  }

  async getNews(ticker: string, limit = 10): Promise<NewsItem[]> {
    const data = await this.fetch<any>({
      function: 'NEWS_SENTIMENT',
      tickers: ticker.toUpperCase(),
      limit: String(limit),
    })
    return (data.feed ?? []).slice(0, limit).map((item: any) => ({
      title: item.title ?? '',
      summary: item.summary ?? '',
      url: item.url ?? '',
      source: item.source ?? '',
      publishedAt: item.time_published ? parseAlphaDate(item.time_published) : new Date(),
      tickers: (item.ticker_sentiment ?? []).map((t: any) => t.ticker),
      sentiment: parseSentiment(item.ticker_sentiment?.[0]?.ticker_sentiment_label),
      provider: 'alpha-vantage' as const,
    }))
  }

  async getHistory(ticker: string, fromDate: Date, toDate: Date): Promise<HistoricalPrice[]> {
    const data = await this.fetch<any>({
      function: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol: ticker.toUpperCase(),
      outputsize: 'full',
    })
    const series = data['Time Series (Daily)'] ?? {}
    const from = fromDate.getTime()
    const to = toDate.getTime()
    return Object.entries(series)
      .map(([dateStr, v]: [string, any]) => ({
        date: new Date(dateStr),
        open: parseFloat(v['1. open']),
        high: parseFloat(v['2. high']),
        low: parseFloat(v['3. low']),
        close: parseFloat(v['4. close']),
        adjClose: parseFloat(v['5. adjusted close']),
        volume: parseInt(v['6. volume'], 10),
      }))
      .filter((p) => p.date.getTime() >= from && p.date.getTime() <= to)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  async getEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]> {
    const results: EarningsEvent[] = []
    for (const ticker of tickers) {
      try {
        const data = await this.fetch<any>({ function: 'EARNINGS_CALENDAR', symbol: ticker.toUpperCase(), horizon: '3month' })
        // Alpha Vantage returns CSV for this endpoint
        if (typeof data === 'string') {
          const lines = (data as string).split('\n').slice(1).filter(Boolean)
          for (const line of lines) {
            const [symbol, , reportDate, , , estimate] = line.split(',')
            if (symbol?.trim().toUpperCase() === ticker.toUpperCase() && reportDate) {
              results.push({
                ticker: ticker.toUpperCase(),
                reportDate: new Date(reportDate.trim()),
                estimatedEPS: estimate ? parseFloat(estimate) : undefined,
                provider: 'alpha-vantage',
              })
            }
          }
        }
      } catch {
        // Skip failed tickers
      }
    }
    return results
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/providers/alpha-vantage.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/market-data/src/providers/alpha-vantage.ts packages/market-data/src/providers/alpha-vantage.test.ts
git commit -m "feat: add Alpha Vantage market data provider"
```

---

## Task 4: Polygon.io Provider

**Files:**
- Create: `packages/market-data/src/providers/polygon.ts`
- Create: `packages/market-data/src/providers/polygon.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/market-data/src/providers/polygon.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PolygonProvider } from './polygon.js'
import { MarketDataError } from '../types.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockPolygonResponse(data: unknown, ok = true) {
  mockFetch.mockResolvedValue({ ok, status: ok ? 200 : 403, json: async () => data })
}

describe('PolygonProvider', () => {
  let provider: PolygonProvider

  beforeEach(() => {
    provider = new PolygonProvider('test-api-key')
    vi.clearAllMocks()
  })

  describe('getQuote', () => {
    it('returns a StockQuote from previous close', async () => {
      mockPolygonResponse({
        status: 'OK',
        results: [{
          T: 'AAPL',
          c: 175.50,
          o: 173.20,
          h: 176.80,
          l: 172.50,
          v: 55000000,
        }],
      })

      const quote = await provider.getQuote('AAPL')

      expect(quote.ticker).toBe('AAPL')
      expect(quote.price).toBe(175.50)
      expect(quote.provider).toBe('polygon')
    })

    it('throws MarketDataError on 403 (invalid API key)', async () => {
      mockPolygonResponse({ status: 'ERROR', error: 'Forbidden' }, false)
      await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)
    })

    it('throws MarketDataError when results are empty', async () => {
      mockPolygonResponse({ status: 'OK', results: [] })
      await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)
    })
  })

  describe('getNews', () => {
    it('returns news items for a ticker', async () => {
      mockPolygonResponse({
        status: 'OK',
        results: [{
          title: 'Apple Beats Q2 Estimates',
          article_url: 'https://example.com/apple',
          publisher: { name: 'Benzinga' },
          published_utc: '2026-05-31T12:00:00Z',
          tickers: ['AAPL'],
          description: 'Apple reported strong Q2 results.',
        }],
      })

      const news = await provider.getNews('AAPL')

      expect(news).toHaveLength(1)
      expect(news[0].title).toBe('Apple Beats Q2 Estimates')
      expect(news[0].provider).toBe('polygon')
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/providers/polygon.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement Polygon provider**

```typescript
// packages/market-data/src/providers/polygon.ts
import type { IMarketDataProvider, StockQuote, NewsItem, HistoricalPrice, EarningsEvent } from '../types.js'
import { MarketDataError } from '../types.js'

const BASE_URL = 'https://api.polygon.io'

export class PolygonProvider implements IMarketDataProvider {
  readonly name = 'polygon' as const

  constructor(private readonly apiKey: string) {}

  private async fetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    url.searchParams.set('apiKey', this.apiKey)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new MarketDataError(`Polygon HTTP error: ${res.status}`, 'polygon')
    }
    return res.json() as Promise<T>
  }

  async getQuote(ticker: string): Promise<StockQuote> {
    const t = ticker.toUpperCase()
    const data = await this.fetch<any>(`/v2/aggs/ticker/${t}/prev`, { adjusted: 'true' })
    const result = data.results?.[0]
    if (!result) {
      throw new MarketDataError(`No quote data for ${t}`, 'polygon', t)
    }
    return {
      ticker: result.T ?? t,
      price: result.c ?? 0,
      change: (result.c ?? 0) - (result.o ?? 0),
      changePercent: result.o ? (((result.c - result.o) / result.o) * 100) : 0,
      volume: result.v ?? 0,
      currency: 'USD',
      marketState: 'CLOSED',
      timestamp: result.t ? new Date(result.t) : new Date(),
      provider: 'polygon',
    }
  }

  async getNews(ticker: string, limit = 10): Promise<NewsItem[]> {
    const t = ticker.toUpperCase()
    const data = await this.fetch<any>('/v2/reference/news', {
      ticker: t,
      limit: String(limit),
      sort: 'published_utc',
      order: 'desc',
    })
    return (data.results ?? []).map((item: any) => ({
      title: item.title ?? '',
      summary: item.description ?? '',
      url: item.article_url ?? '',
      source: item.publisher?.name ?? '',
      publishedAt: item.published_utc ? new Date(item.published_utc) : new Date(),
      tickers: item.tickers ?? [t],
      provider: 'polygon' as const,
    }))
  }

  async getHistory(ticker: string, fromDate: Date, toDate: Date): Promise<HistoricalPrice[]> {
    const t = ticker.toUpperCase()
    const from = fromDate.toISOString().slice(0, 10)
    const to = toDate.toISOString().slice(0, 10)
    const data = await this.fetch<any>(`/v2/aggs/ticker/${t}/range/1/day/${from}/${to}`, {
      adjusted: 'true',
      sort: 'asc',
    })
    return (data.results ?? []).map((item: any) => ({
      date: new Date(item.t),
      open: item.o ?? 0,
      high: item.h ?? 0,
      low: item.l ?? 0,
      close: item.c ?? 0,
      volume: item.v ?? 0,
    }))
  }

  async getEarningsCalendar(_tickers: string[]): Promise<EarningsEvent[]> {
    // Polygon earnings calendar requires paid tier — return empty for now
    return []
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/providers/polygon.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/market-data/src/providers/polygon.ts packages/market-data/src/providers/polygon.test.ts
git commit -m "feat: add Polygon.io market data provider"
```

---

## Task 5: MarketDataClient

**Files:**
- Create: `packages/market-data/src/client.ts`
- Create: `packages/market-data/src/client.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/market-data/src/client.test.ts
import { describe, it, expect, vi } from 'vitest'
import { MarketDataClient } from './client.js'

vi.mock('./providers/yahoo-finance.js', () => ({
  YahooFinanceProvider: vi.fn().mockImplementation(() => ({
    name: 'yahoo-finance',
    getQuote: vi.fn().mockResolvedValue({ ticker: 'AAPL', price: 175, provider: 'yahoo-finance' }),
    getNews: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    getEarningsCalendar: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('./providers/alpha-vantage.js', () => ({
  AlphaVantageProvider: vi.fn().mockImplementation(() => ({
    name: 'alpha-vantage',
    getQuote: vi.fn().mockResolvedValue({ ticker: 'AAPL', price: 176, provider: 'alpha-vantage' }),
    getNews: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    getEarningsCalendar: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('./providers/polygon.js', () => ({
  PolygonProvider: vi.fn().mockImplementation(() => ({
    name: 'polygon',
    getQuote: vi.fn().mockResolvedValue({ ticker: 'AAPL', price: 177, provider: 'polygon' }),
    getNews: vi.fn().mockResolvedValue([]),
    getHistory: vi.fn().mockResolvedValue([]),
    getEarningsCalendar: vi.fn().mockResolvedValue([]),
  })),
}))

describe('MarketDataClient', () => {
  describe('provider selection', () => {
    it('uses yahoo-finance when no API keys configured', async () => {
      const client = new MarketDataClient({})
      const quote = await client.getQuote('AAPL')
      expect(quote.provider).toBe('yahoo-finance')
    })

    it('uses alpha-vantage when alphaVantageApiKey is set', async () => {
      const client = new MarketDataClient({ alphaVantageApiKey: 'test-key' })
      const quote = await client.getQuote('AAPL')
      expect(quote.provider).toBe('alpha-vantage')
    })

    it('uses polygon when polygonApiKey is set', async () => {
      const client = new MarketDataClient({ polygonApiKey: 'test-key' })
      const quote = await client.getQuote('AAPL')
      expect(quote.provider).toBe('polygon')
    })

    it('prefers polygon over alpha-vantage when both keys set', async () => {
      const client = new MarketDataClient({ polygonApiKey: 'pk', alphaVantageApiKey: 'ak' })
      const quote = await client.getQuote('AAPL')
      expect(quote.provider).toBe('polygon')
    })
  })

  describe('availableProviders', () => {
    it('returns only yahoo-finance with no keys', () => {
      const client = new MarketDataClient({})
      expect(client.availableProviders).toEqual(['yahoo-finance'])
    })

    it('returns all providers when both keys set', () => {
      const client = new MarketDataClient({ alphaVantageApiKey: 'ak', polygonApiKey: 'pk' })
      expect(client.availableProviders).toContain('yahoo-finance')
      expect(client.availableProviders).toContain('alpha-vantage')
      expect(client.availableProviders).toContain('polygon')
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/client.test.ts 2>&1 | tail -5
```

- [ ] **Step 3: Implement MarketDataClient**

```typescript
// packages/market-data/src/client.ts
import { YahooFinanceProvider } from './providers/yahoo-finance.js'
import { AlphaVantageProvider } from './providers/alpha-vantage.js'
import { PolygonProvider } from './providers/polygon.js'
import type {
  IMarketDataProvider,
  MarketDataProvider,
  MarketDataProviderConfig,
  StockQuote,
  NewsItem,
  HistoricalPrice,
  EarningsEvent,
} from './types.js'

export class MarketDataClient {
  private readonly primary: IMarketDataProvider
  private readonly providers: IMarketDataProvider[]

  constructor(config: MarketDataProviderConfig) {
    this.providers = [new YahooFinanceProvider()]

    if (config.alphaVantageApiKey) {
      this.providers.push(new AlphaVantageProvider(config.alphaVantageApiKey))
    }
    if (config.polygonApiKey) {
      this.providers.push(new PolygonProvider(config.polygonApiKey))
    }

    // Prefer highest-quality provider: polygon > alpha-vantage > yahoo
    this.primary = this.providers[this.providers.length - 1]
  }

  get availableProviders(): MarketDataProvider[] {
    return this.providers.map((p) => p.name)
  }

  getQuote(ticker: string): Promise<StockQuote> {
    return this.primary.getQuote(ticker)
  }

  getNews(ticker: string, limit?: number): Promise<NewsItem[]> {
    return this.primary.getNews(ticker, limit)
  }

  getHistory(ticker: string, fromDate: Date, toDate: Date): Promise<HistoricalPrice[]> {
    return this.primary.getHistory(ticker, fromDate, toDate)
  }

  getEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]> {
    return this.primary.getEarningsCalendar(tickers)
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/Samster/stockpilot ai"
pnpm vitest run packages/market-data/src/client.test.ts 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add packages/market-data/src/client.ts packages/market-data/src/client.test.ts
git commit -m "feat: add MarketDataClient with provider selection logic"
```

---

## Task 6: Server Config — Add API Key Env Vars

**Files:**
- Modify: `server/src/config.ts`

- [ ] **Step 1: Read `server/src/config.ts`** to find where to add new env vars

- [ ] **Step 2: Add market data API keys to config**

Find where `STOCKPILOT_MODE` was added and add after it:

```typescript
export const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY ?? undefined
export const POLYGON_API_KEY = process.env.POLYGON_API_KEY ?? undefined
```

- [ ] **Step 3: Add to `Config` interface and `loadConfig()` return**

In the `Config` interface add:
```typescript
alphaVantageApiKey: string | undefined
polygonApiKey: string | undefined
```

In the `loadConfig()` return object add:
```typescript
alphaVantageApiKey: ALPHA_VANTAGE_API_KEY,
polygonApiKey: POLYGON_API_KEY,
```

- [ ] **Step 4: Run typecheck**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add server/src/config.ts
git commit -m "feat: add ALPHA_VANTAGE_API_KEY and POLYGON_API_KEY to server config"
```

---

## Task 7: Market API Routes

**Files:**
- Create: `server/src/routes/market.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Read `server/src/app.ts`** to understand how routes are mounted (look for `app.use('/api/...')` calls)

- [ ] **Step 2: Read one existing route file** (e.g. `server/src/routes/companies.ts`) to understand auth middleware patterns

- [ ] **Step 3: Create `server/src/routes/market.ts`**

```typescript
// server/src/routes/market.ts
import { Router } from 'express'
import { z } from 'zod'
import { MarketDataClient } from '@stockpilotai/market-data'
import { loadConfig } from '../config.js'
import { logger } from '../middleware/logger.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i
const tickerSchema = z.string().regex(TICKER_REGEX, 'Invalid ticker symbol')

function getMarketClient(): MarketDataClient {
  const config = loadConfig()
  return new MarketDataClient({
    alphaVantageApiKey: config.alphaVantageApiKey,
    polygonApiKey: config.polygonApiKey,
  })
}

export function createMarketRouter(): Router {
  const router = Router()

  // GET /api/market/quote/:ticker
  router.get('/quote/:ticker', async (req, res) => {
    const parse = tickerSchema.safeParse(req.params.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    try {
      const client = getMarketClient()
      const quote = await client.getQuote(parse.data.toUpperCase())
      return res.json(quote)
    } catch (err) {
      logger.error({ err, ticker: req.params.ticker }, 'Failed to fetch quote')
      return res.status(502).json({ error: 'Failed to fetch market data' })
    }
  })

  // GET /api/market/news/:ticker?limit=10
  router.get('/news/:ticker', async (req, res) => {
    const parse = tickerSchema.safeParse(req.params.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 50)
    try {
      const client = getMarketClient()
      const news = await client.getNews(parse.data.toUpperCase(), limit)
      return res.json(news)
    } catch (err) {
      logger.error({ err, ticker: req.params.ticker }, 'Failed to fetch news')
      return res.status(502).json({ error: 'Failed to fetch news' })
    }
  })

  // GET /api/market/history/:ticker?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/history/:ticker', async (req, res) => {
    const parse = tickerSchema.safeParse(req.params.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    const fromStr = String(req.query.from ?? '')
    const toStr = String(req.query.to ?? '')
    const fromDate = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const toDate = toStr ? new Date(toStr) : new Date()
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' })
    }
    try {
      const client = getMarketClient()
      const history = await client.getHistory(parse.data.toUpperCase(), fromDate, toDate)
      return res.json(history)
    } catch (err) {
      logger.error({ err, ticker: req.params.ticker }, 'Failed to fetch history')
      return res.status(502).json({ error: 'Failed to fetch price history' })
    }
  })

  // GET /api/market/earnings-calendar?tickers=AAPL,MSFT,GOOGL
  router.get('/earnings-calendar', async (req, res) => {
    const raw = String(req.query.tickers ?? '')
    if (!raw) {
      return res.status(400).json({ error: 'tickers query param required (comma-separated)' })
    }
    const tickers = raw
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => TICKER_REGEX.test(t))
      .slice(0, 20) // max 20 tickers
    if (tickers.length === 0) {
      return res.status(400).json({ error: 'No valid tickers provided' })
    }
    try {
      const client = getMarketClient()
      const calendar = await client.getEarningsCalendar(tickers)
      return res.json(calendar)
    } catch (err) {
      logger.error({ err }, 'Failed to fetch earnings calendar')
      return res.status(502).json({ error: 'Failed to fetch earnings calendar' })
    }
  })

  // GET /api/market/providers — shows which providers are active
  router.get('/providers', (_req, res) => {
    const client = getMarketClient()
    return res.json({ providers: client.availableProviders })
  })

  return router
}
```

- [ ] **Step 4: Mount the router in `server/src/app.ts`**

Find where other routes are imported and mounted (look for `import` + `app.use('/api/...')`). Add:

```typescript
import { createMarketRouter } from './routes/market.js'
// ... inside createApp() where routes are mounted:
app.use('/api/market', createMarketRouter())
```

- [ ] **Step 5: Add `@stockpilotai/market-data` as a dependency of the server package**

Read `server/package.json`, then add:
```json
"@stockpilotai/market-data": "workspace:*"
```
to the `dependencies` field.

Then run:
```bash
cd "/Users/Samster/stockpilot ai" && pnpm install
```

- [ ] **Step 6: Run typecheck**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm typecheck
```

Fix any type errors before committing.

- [ ] **Step 7: Commit**

```bash
cd "/Users/Samster/stockpilot ai"
git add server/src/routes/market.ts server/src/app.ts server/package.json
git commit -m "feat: add /api/market routes (quote, news, history, earnings-calendar)"
```

---

## Task 8: Verify Full Build & Smoke Test

- [ ] **Step 1: Run typecheck**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm typecheck
```

Expected: no errors

- [ ] **Step 2: Run test suite**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm test 2>&1 | tail -10
```

Expected: new market-data tests pass (yahoo, alpha-vantage, polygon, client)

- [ ] **Step 3: Start dev server and smoke test the routes**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm dev &
sleep 8
curl -s http://localhost:3100/api/market/providers | head -c 200
curl -s "http://localhost:3100/api/market/quote/AAPL" | head -c 300
```

Expected: `/api/market/providers` returns `{"providers":["yahoo-finance"]}` and `/api/market/quote/AAPL` returns a JSON quote object with price, change, etc.

- [ ] **Step 4: Kill dev server**

```bash
pkill -f "pnpm dev" || true
```

- [ ] **Step 5: Final commit if any fixes**

```bash
cd "/Users/Samster/stockpilot ai"
git add -A
git commit -m "chore: plan 2 complete — market data adapters and API routes"
```
