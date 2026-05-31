import { describe, it, expect, vi } from 'vitest'
import { MarketDataClient } from './client.js'

vi.mock('./providers/yahoo-finance.js', () => ({
  YahooFinanceProvider: vi.fn().mockImplementation(() => ({
    name: 'yahoo-finance',
    getQuote: vi.fn().mockResolvedValue({ ticker: 'AAPL', price: 175, provider: 'yahoo-finance' }),
    getNews: vi.fn().mockResolvedValue([{ title: 'YF News', provider: 'yahoo-finance' }]),
    getHistory: vi.fn().mockResolvedValue([{ close: 175 }]),
    getEarningsCalendar: vi.fn().mockResolvedValue([{ ticker: 'AAPL', provider: 'yahoo-finance' }]),
  })),
}))

vi.mock('./providers/alpha-vantage.js', () => ({
  AlphaVantageProvider: vi.fn().mockImplementation(() => ({
    name: 'alpha-vantage',
    getQuote: vi.fn().mockResolvedValue({ ticker: 'AAPL', price: 176, provider: 'alpha-vantage' }),
    getNews: vi.fn().mockResolvedValue([{ title: 'AV News', provider: 'alpha-vantage' }]),
    getHistory: vi.fn().mockResolvedValue([{ close: 176 }]),
    getEarningsCalendar: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('./providers/polygon.js', () => ({
  PolygonProvider: vi.fn().mockImplementation(() => ({
    name: 'polygon',
    getQuote: vi.fn().mockResolvedValue({ ticker: 'AAPL', price: 177, provider: 'polygon' }),
    getNews: vi.fn().mockResolvedValue([{ title: 'Polygon News', provider: 'polygon' }]),
    getHistory: vi.fn().mockResolvedValue([{ close: 177 }]),
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

    it('returns yahoo-finance and alpha-vantage with AV key', () => {
      const client = new MarketDataClient({ alphaVantageApiKey: 'ak' })
      expect(client.availableProviders).toContain('yahoo-finance')
      expect(client.availableProviders).toContain('alpha-vantage')
      expect(client.availableProviders).not.toContain('polygon')
    })

    it('returns all three providers when both keys set', () => {
      const client = new MarketDataClient({ alphaVantageApiKey: 'ak', polygonApiKey: 'pk' })
      expect(client.availableProviders).toContain('yahoo-finance')
      expect(client.availableProviders).toContain('alpha-vantage')
      expect(client.availableProviders).toContain('polygon')
    })
  })

  describe('delegating calls to primary provider', () => {
    it('getNews delegates to primary provider', async () => {
      const client = new MarketDataClient({})
      const news = await client.getNews('AAPL', 5)
      expect(news[0].provider).toBe('yahoo-finance')
    })

    it('getHistory delegates to primary provider', async () => {
      const client = new MarketDataClient({})
      const history = await client.getHistory('AAPL', new Date('2026-01-01'), new Date('2026-05-31'))
      expect(history[0].close).toBe(175)
    })

    it('getEarningsCalendar delegates to primary provider', async () => {
      const client = new MarketDataClient({})
      const events = await client.getEarningsCalendar(['AAPL'])
      expect(events[0].ticker).toBe('AAPL')
    })
  })
})
