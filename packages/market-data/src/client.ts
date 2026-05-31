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
  private readonly _providers: IMarketDataProvider[]

  constructor(config: MarketDataProviderConfig) {
    this._providers = [new YahooFinanceProvider()]

    if (config.alphaVantageApiKey) {
      this._providers.push(new AlphaVantageProvider(config.alphaVantageApiKey))
    }
    if (config.polygonApiKey) {
      this._providers.push(new PolygonProvider(config.polygonApiKey))
    }

    // Prefer highest-quality provider: polygon > alpha-vantage > yahoo-finance
    this.primary = this._providers[this._providers.length - 1]
  }

  get availableProviders(): MarketDataProvider[] {
    return this._providers.map((p) => p.name)
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
