import { YahooFinanceProvider } from './providers/yahoo-finance.js'
import { AlphaVantageProvider } from './providers/alpha-vantage.js'
import { PolygonProvider } from './providers/polygon.js'
import { MarketDataError } from './types.js'
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
  private readonly fallbacks: IMarketDataProvider[]
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
    this.fallbacks = this._providers.slice(0, -1).reverse() // lower-quality providers as fallback
  }

  get availableProviders(): MarketDataProvider[] {
    return this._providers.map((p) => p.name)
  }

  private async withFallback<T>(fn: (provider: IMarketDataProvider) => Promise<T>): Promise<T> {
    try {
      return await fn(this.primary)
    } catch (primaryErr) {
      for (const fallback of this.fallbacks) {
        try {
          return await fn(fallback)
        } catch {
          // try next
        }
      }
      // Re-throw original error if all providers failed
      throw primaryErr instanceof MarketDataError
        ? primaryErr
        : new MarketDataError('All market data providers failed', this.primary.name)
    }
  }

  getQuote(ticker: string): Promise<StockQuote> {
    return this.withFallback((p) => p.getQuote(ticker))
  }

  getNews(ticker: string, limit?: number): Promise<NewsItem[]> {
    return this.withFallback((p) => p.getNews(ticker, limit))
  }

  getHistory(ticker: string, fromDate: Date, toDate: Date): Promise<HistoricalPrice[]> {
    return this.withFallback((p) => p.getHistory(ticker, fromDate, toDate))
  }

  getEarningsCalendar(tickers: string[]): Promise<EarningsEvent[]> {
    return this.withFallback((p) => p.getEarningsCalendar(tickers))
  }
}
