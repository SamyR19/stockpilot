import yahooFinance from 'yahoo-finance2'
import type { IMarketDataProvider, StockQuote, NewsItem, HistoricalPrice, EarningsEvent } from '../types.js'
import { MarketDataError } from '../types.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i

function validateTicker(ticker: string): void {
  if (!ticker || ticker.trim().length === 0) {
    throw new MarketDataError('Ticker cannot be empty', 'yahoo-finance')
  }
  if (!TICKER_REGEX.test(ticker)) {
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
