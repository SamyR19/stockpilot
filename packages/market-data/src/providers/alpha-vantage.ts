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
  const y = str.slice(0, 4), mo = str.slice(4, 6), d = str.slice(6, 8)
  const h = str.slice(9, 11), mi = str.slice(11, 13)
  const result = new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`)
  if (isNaN(result.getTime())) {
    throw new MarketDataError(`Invalid date string from Alpha Vantage: "${str}"`, 'alpha-vantage')
  }
  return result
}

export class AlphaVantageProvider implements IMarketDataProvider {
  readonly name = 'alpha-vantage' as const

  constructor(private readonly apiKey: string) {}

  private async apiFetch<T>(params: Record<string, string>): Promise<T> {
    const url = new URL(BASE_URL)
    url.searchParams.set('apikey', this.apiKey)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
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
    const data = await this.apiFetch<any>({ function: 'GLOBAL_QUOTE', symbol: ticker.toUpperCase() })
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
    const data = await this.apiFetch<any>({
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
    const data = await this.apiFetch<any>({
      function: 'TIME_SERIES_DAILY_ADJUSTED',
      symbol: ticker.toUpperCase(),
      outputsize: 'full',
    })
    const series = data['Time Series (Daily)'] ?? {}
    const from = fromDate.getTime(), to = toDate.getTime()
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
        const data = await this.apiFetch<any>({ function: 'EARNINGS_CALENDAR', symbol: ticker.toUpperCase(), horizon: '3month' })
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
      } catch { /* skip failed tickers */ }
    }
    return results
  }
}
