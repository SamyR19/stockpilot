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
    /** True when the upstream provider rejected the request due to rate limiting (HTTP 429). */
    public readonly rateLimited: boolean = false,
  ) {
    super(message)
    this.name = 'MarketDataError'
  }
}
