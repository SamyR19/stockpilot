import type { IMarketDataProvider, StockQuote, NewsItem, HistoricalPrice, EarningsEvent } from '../types.js'
import { MarketDataError } from '../types.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i

// A minimal User-Agent. Counter-intuitively, Yahoo's public endpoints
// aggressively rate-limit (HTTP 429) requests bearing a full desktop-Chrome
// UA string (a common bot signature), while a bare `Mozilla/5.0` is served
// normally. Verified empirically against the v8 chart endpoint.
const USER_AGENT = 'Mozilla/5.0'

// The chart endpoint (v8) does NOT require a crumb/cookie, unlike the v7 quote
// endpoint that the deprecated yahoo-finance2 library relies on. It is far more
// reliable and returns everything we need for a quote and for history.
const CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const NEWS_RSS_BASE = 'https://feeds.finance.yahoo.com/rss/2.0/headline'

const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 600

function validateTicker(ticker: string): void {
  if (!ticker || ticker.trim().length === 0) {
    throw new MarketDataError('Ticker cannot be empty', 'yahoo-finance')
  }
  if (!TICKER_REGEX.test(ticker)) {
    throw new MarketDataError(`Invalid ticker format: ${ticker}`, 'yahoo-finance', ticker)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch JSON from a Yahoo endpoint with a browser User-Agent and bounded
 * retry/backoff on HTTP 429. Throws a MarketDataError flagged `rateLimited`
 * when the upstream keeps returning 429 so callers can surface a clear message.
 */
async function fetchYahooJson<T>(url: string, ticker: string): Promise<T> {
  let lastStatus = 0
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } })
    } catch (err) {
      throw new MarketDataError(
        `Network error fetching ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
        'yahoo-finance',
        ticker,
      )
    }
    if (res.status === 429) {
      lastStatus = 429
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1))
        continue
      }
      throw new MarketDataError(
        `Yahoo Finance rate limit hit for ${ticker}. Add an Alpha Vantage or Polygon API key for reliable data.`,
        'yahoo-finance',
        ticker,
        true,
      )
    }
    if (!res.ok) {
      throw new MarketDataError(
        `Yahoo Finance returned HTTP ${res.status} for ${ticker}`,
        'yahoo-finance',
        ticker,
      )
    }
    try {
      return (await res.json()) as T
    } catch {
      throw new MarketDataError(`Yahoo Finance returned a non-JSON response for ${ticker}`, 'yahoo-finance', ticker)
    }
  }
  // Unreachable, but keeps the type checker satisfied.
  throw new MarketDataError(`Yahoo Finance request failed for ${ticker} (status ${lastStatus})`, 'yahoo-finance', ticker)
}

interface ChartMeta {
  symbol?: string
  currency?: string
  regularMarketPrice?: number
  chartPreviousClose?: number
  previousClose?: number
  regularMarketVolume?: number
  regularMarketTime?: number
  fiftyTwoWeekHigh?: number
  fiftyTwoWeekLow?: number
  marketState?: string
}

interface ChartResponse {
  chart: {
    error: { code?: string; description?: string } | null
    result: Array<{
      meta: ChartMeta
      timestamp?: number[]
      indicators: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
        adjclose?: Array<{ adjclose?: Array<number | null> }>
      }
    }>
  }
}

function normalizeMarketState(state: string | undefined): StockQuote['marketState'] {
  switch ((state ?? '').toUpperCase()) {
    case 'PRE':
    case 'PREPRE':
      return 'PRE'
    case 'REGULAR':
      return 'REGULAR'
    case 'POST':
    case 'POSTPOST':
      return 'POST'
    case 'CLOSED':
      return 'CLOSED'
    default:
      return 'UNKNOWN'
  }
}

function lastNumber(arr: Array<number | null> | undefined): number | undefined {
  if (!arr) return undefined
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

export class YahooFinanceProvider implements IMarketDataProvider {
  readonly name = 'yahoo-finance' as const

  async getQuote(ticker: string): Promise<StockQuote> {
    validateTicker(ticker)
    const symbol = ticker.toUpperCase()
    const url = `${CHART_BASE}/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`
    const data = await fetchYahooJson<ChartResponse>(url, symbol)

    const result = data.chart?.result?.[0]
    if (!result?.meta) {
      throw new MarketDataError(`No quote data returned for ${symbol}`, 'yahoo-finance', symbol)
    }
    const meta = result.meta
    const price = meta.regularMarketPrice ?? lastNumber(result.indicators?.quote?.[0]?.close) ?? 0
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change = price - previousClose
    const changePercent = previousClose ? (change / previousClose) * 100 : 0
    const volume = meta.regularMarketVolume ?? lastNumber(result.indicators?.quote?.[0]?.volume) ?? 0

    return {
      ticker: meta.symbol ?? symbol,
      price,
      change,
      changePercent,
      volume,
      marketCap: undefined,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? undefined,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? undefined,
      currency: meta.currency ?? 'USD',
      marketState: normalizeMarketState(meta.marketState),
      timestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date(),
      provider: 'yahoo-finance',
    }
  }

  async getNews(ticker: string, limit = 10): Promise<NewsItem[]> {
    validateTicker(ticker)
    const symbol = ticker.toUpperCase()
    // News is non-critical: any failure (rate limit, deprecated feed, network)
    // returns an empty list rather than breaking the page.
    try {
      const url = `${NEWS_RSS_BASE}?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, text/xml' } })
      if (!res.ok) return []
      const xml = await res.text()
      return parseRssNews(xml, symbol).slice(0, limit)
    } catch {
      return []
    }
  }

  async getHistory(ticker: string, fromDate: Date, toDate: Date): Promise<HistoricalPrice[]> {
    validateTicker(ticker)
    const symbol = ticker.toUpperCase()
    const period1 = Math.floor(fromDate.getTime() / 1000)
    const period2 = Math.floor(toDate.getTime() / 1000)
    const url = `${CHART_BASE}/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit`
    const data = await fetchYahooJson<ChartResponse>(url, symbol)

    const result = data.chart?.result?.[0]
    const timestamps = result?.timestamp
    const quote = result?.indicators?.quote?.[0]
    if (!timestamps || !quote) return []
    const adjclose = result?.indicators?.adjclose?.[0]?.adjclose

    const rows: HistoricalPrice[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close?.[i]
      if (typeof close !== 'number' || !Number.isFinite(close)) continue // skip gaps
      rows.push({
        date: new Date(timestamps[i]! * 1000),
        open: quote.open?.[i] ?? close,
        high: quote.high?.[i] ?? close,
        low: quote.low?.[i] ?? close,
        close,
        adjClose: adjclose?.[i] ?? undefined,
        volume: quote.volume?.[i] ?? 0,
      })
    }
    return rows
  }

  async getEarningsCalendar(_tickers: string[]): Promise<EarningsEvent[]> {
    // The earnings calendar requires the crumb-protected quoteSummary endpoint,
    // which is unreliable without an API key. Return empty rather than failing;
    // Alpha Vantage / Polygon providers cover this when keys are configured.
    return []
  }
}

function parseRssNews(xml: string, symbol: string): NewsItem[] {
  const items: NewsItem[] = []
  const itemRegex = /<item>([\s\S]*?)<\/item>/g
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]!
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link')
    const pubDate = extractTag(block, 'pubDate')
    if (!title || !link) continue
    const parsed = pubDate ? new Date(pubDate) : new Date()
    items.push({
      title,
      summary: '',
      url: link,
      source: 'Yahoo Finance',
      publishedAt: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
      tickers: [symbol],
      provider: 'yahoo-finance',
    })
  }
  return items
}

function extractTag(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(block)
  if (cdata) return cdata[1]!.trim()
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block)
  return plain ? plain[1]!.trim() : ''
}
