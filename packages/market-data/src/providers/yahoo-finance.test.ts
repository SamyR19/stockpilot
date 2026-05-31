import { describe, it, expect, vi, beforeEach } from 'vitest'
import { YahooFinanceProvider } from './yahoo-finance.js'
import { MarketDataError } from '../types.js'

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
      await expect(provider.getQuote('INVALID')).rejects.toThrow(MarketDataError)
    })

    it('throws MarketDataError for empty ticker', async () => {
      await expect(provider.getQuote('')).rejects.toThrow(MarketDataError)
    })

    it('throws MarketDataError for ticker that is too long', async () => {
      await expect(provider.getQuote('TOOLONGTICKER123456789')).rejects.toThrow(MarketDataError)
    })
  })

  describe('getNews', () => {
    it('returns news items for a ticker', async () => {
      vi.mocked(yahooFinance.search).mockResolvedValue({
        news: [{
          title: 'Apple Reports Record Revenue',
          link: 'https://example.com/apple-revenue',
          publisher: 'Reuters',
          providerPublishTime: 1748736000,
          relatedTickers: ['AAPL'],
        }],
      } as any)

      const news = await provider.getNews('AAPL', 5)
      expect(news).toHaveLength(1)
      expect(news[0].title).toBe('Apple Reports Record Revenue')
      expect(news[0].provider).toBe('yahoo-finance')
    })

    it('returns empty array when no news', async () => {
      vi.mocked(yahooFinance.search).mockResolvedValue({ news: [] } as any)
      const news = await provider.getNews('AAPL')
      expect(news).toEqual([])
    })
  })

  describe('getHistory', () => {
    it('returns historical prices', async () => {
      vi.mocked(yahooFinance.historical).mockResolvedValue([
        { date: new Date('2026-05-01'), open: 170, high: 176, low: 169, close: 174, adjClose: 174, volume: 50000000 },
      ] as any)

      const history = await provider.getHistory('AAPL', new Date('2026-05-01'), new Date('2026-05-31'))
      expect(history).toHaveLength(1)
      expect(history[0].close).toBe(174)
    })
  })

  describe('getEarningsCalendar', () => {
    it('returns earnings events when data available', async () => {
      vi.mocked(yahooFinance.quoteSummary).mockResolvedValue({
        calendarEvents: {
          earnings: {
            earningsDate: [new Date('2026-07-30')],
            earningsAverage: { raw: 1.45 },
          },
        },
      } as any)

      const events = await provider.getEarningsCalendar(['AAPL'])
      expect(events).toHaveLength(1)
      expect(events[0].ticker).toBe('AAPL')
      expect(events[0].provider).toBe('yahoo-finance')
    })

    it('returns empty array when no earnings data', async () => {
      vi.mocked(yahooFinance.quoteSummary).mockResolvedValue({ calendarEvents: {} } as any)
      const events = await provider.getEarningsCalendar(['AAPL'])
      expect(events).toEqual([])
    })

    it('skips failed tickers without throwing', async () => {
      vi.mocked(yahooFinance.quoteSummary).mockRejectedValue(new Error('Not found'))
      const events = await provider.getEarningsCalendar(['INVALID'])
      expect(events).toEqual([])
    })
  })
})
