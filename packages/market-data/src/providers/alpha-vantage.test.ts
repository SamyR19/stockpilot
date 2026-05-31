import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AlphaVantageProvider } from './alpha-vantage.js'
import { MarketDataError } from '../types.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(data: unknown) {
  mockFetch.mockResolvedValue({ ok: true, json: async () => data })
}

describe('AlphaVantageProvider', () => {
  let provider: AlphaVantageProvider

  beforeEach(() => {
    provider = new AlphaVantageProvider('test-api-key')
    vi.clearAllMocks()
  })

  describe('getQuote', () => {
    it('returns a StockQuote for a valid ticker', async () => {
      mockOk({
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
      expect(quote.changePercent).toBeCloseTo(1.33)
      expect(quote.provider).toBe('alpha-vantage')
    })

    it('throws MarketDataError when response has empty Global Quote', async () => {
      mockOk({ 'Global Quote': {} })
      await expect(provider.getQuote('INVALID')).rejects.toThrow(MarketDataError)
    })

    it('throws MarketDataError when rate limited (Note field)', async () => {
      mockOk({ Note: 'Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute' })
      await expect(provider.getQuote('AAPL')).rejects.toThrow('rate limit')
    })

    it('throws MarketDataError on HTTP error', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({}) })
      await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)
    })
  })

  describe('getNews', () => {
    it('returns news items with sentiment', async () => {
      mockOk({
        feed: [{
          title: 'Apple Q2 Earnings Beat',
          url: 'https://example.com/apple',
          source: 'Reuters',
          time_published: '20260531T120000',
          ticker_sentiment: [{ ticker: 'AAPL', ticker_sentiment_label: 'Bullish' }],
          summary: 'Apple Q2 earnings above expectations.',
        }],
      })
      const news = await provider.getNews('AAPL', 5)
      expect(news).toHaveLength(1)
      expect(news[0].title).toBe('Apple Q2 Earnings Beat')
      expect(news[0].sentiment).toBe('positive')
      expect(news[0].provider).toBe('alpha-vantage')
    })

    it('maps Bearish sentiment to negative', async () => {
      mockOk({
        feed: [{
          title: 'Apple Misses Revenue',
          url: 'https://example.com',
          source: 'Bloomberg',
          time_published: '20260531T120000',
          ticker_sentiment: [{ ticker: 'AAPL', ticker_sentiment_label: 'Bearish' }],
          summary: '',
        }],
      })
      const news = await provider.getNews('AAPL')
      expect(news[0].sentiment).toBe('negative')
    })

    it('returns empty array when no feed', async () => {
      mockOk({})
      const news = await provider.getNews('AAPL')
      expect(news).toEqual([])
    })
  })

  describe('getHistory', () => {
    it('returns filtered historical prices within date range', async () => {
      mockOk({
        'Time Series (Daily)': {
          '2026-05-15': { '1. open': '170', '2. high': '176', '3. low': '169', '4. close': '174', '5. adjusted close': '174', '6. volume': '50000000' },
          '2026-04-01': { '1. open': '160', '2. high': '165', '3. low': '158', '4. close': '163', '5. adjusted close': '163', '6. volume': '45000000' },
        },
      })
      const history = await provider.getHistory('AAPL', new Date('2026-05-01'), new Date('2026-05-31'))
      expect(history).toHaveLength(1)
      expect(history[0].close).toBe(174)
    })
  })
})
