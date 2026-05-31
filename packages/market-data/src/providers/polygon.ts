import type { IMarketDataProvider, StockQuote, NewsItem, HistoricalPrice, EarningsEvent } from '../types.js'
import { MarketDataError } from '../types.js'

const BASE_URL = 'https://api.polygon.io'

export class PolygonProvider implements IMarketDataProvider {
  readonly name = 'polygon' as const

  constructor(private readonly apiKey: string) {}

  private async apiFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    url.searchParams.set('apiKey', this.apiKey)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new MarketDataError(`Polygon HTTP error: ${res.status}`, 'polygon')
    }
    return res.json() as Promise<T>
  }

  async getQuote(ticker: string): Promise<StockQuote> {
    const t = ticker.toUpperCase()
    const data = await this.apiFetch<any>(`/v2/aggs/ticker/${t}/prev`, { adjusted: 'true' })
    const result = data.results?.[0]
    if (!result) {
      throw new MarketDataError(`No quote data for ${t}`, 'polygon', t)
    }
    const change = (result.c ?? 0) - (result.o ?? 0)
    const changePercent = result.o ? (change / result.o) * 100 : 0
    return {
      ticker: result.T ?? t,
      price: result.c ?? 0,
      change,
      changePercent,
      volume: result.v ?? 0,
      currency: 'USD',
      marketState: 'CLOSED',
      timestamp: result.t ? new Date(result.t) : new Date(),
      provider: 'polygon',
    }
  }

  async getNews(ticker: string, limit = 10): Promise<NewsItem[]> {
    const t = ticker.toUpperCase()
    const data = await this.apiFetch<any>('/v2/reference/news', {
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
    const data = await this.apiFetch<any>(`/v2/aggs/ticker/${t}/range/1/day/${from}/${to}`, {
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
    // Earnings calendar requires Polygon paid tier — return empty for free tier
    return []
  }
}
