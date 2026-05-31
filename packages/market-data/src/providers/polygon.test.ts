import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PolygonProvider } from './polygon.js'
import { MarketDataError } from '../types.js'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function mockOk(data: unknown) {
  mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => data })
}
function mockError(status: number) {
  mockFetch.mockResolvedValue({ ok: false, status, json: async () => ({ status: 'ERROR' }) })
}

describe('PolygonProvider', () => {
  let provider: PolygonProvider

  beforeEach(() => {
    provider = new PolygonProvider('test-api-key')
    vi.clearAllMocks()
  })

  describe('getQuote', () => {
    it('returns a StockQuote from previous close data', async () => {
      mockOk({
        status: 'OK',
        results: [{ T: 'AAPL', c: 175.50, o: 173.20, h: 176.80, l: 172.50, v: 55000000, t: 1748736000000 }],
      })
      const quote = await provider.getQuote('AAPL')
      expect(quote.ticker).toBe('AAPL')
      expect(quote.price).toBe(175.50)
      expect(quote.provider).toBe('polygon')
    })

    it('throws MarketDataError on 403', async () => {
      mockError(403)
      await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)
    })

    it('throws MarketDataError when results array is empty', async () => {
      mockOk({ status: 'OK', results: [] })
      await expect(provider.getQuote('AAPL')).rejects.toThrow(MarketDataError)
    })

    it('calculates change from open and close', async () => {
      mockOk({
        status: 'OK',
        results: [{ T: 'AAPL', c: 175.50, o: 173.20, h: 176.80, l: 172.50, v: 55000000, t: 1748736000000 }],
      })
      const quote = await provider.getQuote('AAPL')
      expect(quote.change).toBeCloseTo(175.50 - 173.20, 2)
    })
  })

  describe('getNews', () => {
    it('returns news items for a ticker', async () => {
      mockOk({
        status: 'OK',
        results: [{
          title: 'Apple Beats Q2 Estimates',
          article_url: 'https://example.com/apple',
          publisher: { name: 'Benzinga' },
          published_utc: '2026-05-31T12:00:00Z',
          tickers: ['AAPL'],
          description: 'Apple reported strong Q2.',
        }],
      })
      const news = await provider.getNews('AAPL')
      expect(news).toHaveLength(1)
      expect(news[0].title).toBe('Apple Beats Q2 Estimates')
      expect(news[0].source).toBe('Benzinga')
      expect(news[0].provider).toBe('polygon')
    })

    it('returns empty array when no results', async () => {
      mockOk({ status: 'OK', results: [] })
      const news = await provider.getNews('AAPL')
      expect(news).toEqual([])
    })
  })

  describe('getHistory', () => {
    it('returns historical prices in chronological order', async () => {
      mockOk({
        status: 'OK',
        results: [
          { t: 1746057600000, o: 170, h: 176, l: 169, c: 174, v: 50000000 },
          { t: 1746144000000, o: 174, h: 178, l: 173, c: 177, v: 48000000 },
        ],
      })
      const history = await provider.getHistory('AAPL', new Date('2026-05-01'), new Date('2026-05-31'))
      expect(history).toHaveLength(2)
      expect(history[0].close).toBe(174)
      expect(history[1].close).toBe(177)
    })
  })

  describe('getEarningsCalendar', () => {
    it('returns empty array (paid tier feature)', async () => {
      const events = await provider.getEarningsCalendar(['AAPL'])
      expect(events).toEqual([])
    })
  })
})
