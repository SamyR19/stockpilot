import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { YahooFinanceProvider } from './yahoo-finance.js'
import { MarketDataError } from '../types.js'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function textResponse(text: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response
}

function rateLimitedResponse(): Response {
  return {
    ok: false,
    status: 429,
    text: async () => 'Too Many Requests',
    json: async () => {
      throw new Error('not json')
    },
  } as unknown as Response
}

function chartBody(overrides: Record<string, unknown> = {}) {
  return {
    chart: {
      error: null,
      result: [
        {
          meta: {
            symbol: 'AAPL',
            currency: 'USD',
            regularMarketPrice: 175.5,
            chartPreviousClose: 173.2,
            regularMarketVolume: 55000000,
            regularMarketTime: 1748736000,
            fiftyTwoWeekHigh: 199.62,
            fiftyTwoWeekLow: 124.17,
            marketState: 'REGULAR',
            ...overrides,
          },
          timestamp: [1746057600, 1746144000],
          indicators: {
            quote: [
              {
                open: [170, 174],
                high: [176, 178],
                low: [169, 173],
                close: [174, 175.5],
                volume: [50000000, 55000000],
              },
            ],
            adjclose: [{ adjclose: [174, 175.5] }],
          },
        },
      ],
    },
  }
}

describe('YahooFinanceProvider', () => {
  let provider: YahooFinanceProvider
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    provider = new YahooFinanceProvider()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('getQuote', () => {
    it('returns a StockQuote derived from the chart endpoint', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(chartBody()))

      const quote = await provider.getQuote('AAPL')
      expect(quote.ticker).toBe('AAPL')
      expect(quote.price).toBe(175.5)
      // change = 175.5 - 173.2 = 2.30
      expect(quote.change).toBeCloseTo(2.3, 5)
      expect(quote.changePercent).toBeCloseTo((2.3 / 173.2) * 100, 5)
      expect(quote.fiftyTwoWeekHigh).toBe(199.62)
      expect(quote.marketState).toBe('REGULAR')
      expect(quote.provider).toBe('yahoo-finance')
      // Hits the v8 chart endpoint, never the crumb-protected v7 quote endpoint.
      expect(fetchMock.mock.calls[0][0]).toContain('/v8/finance/chart/AAPL')
    })

    it('flags a MarketDataError as rateLimited after exhausting retries on 429', async () => {
      fetchMock.mockResolvedValue(rateLimitedResponse())
      await expect(provider.getQuote('AAPL')).rejects.toMatchObject({
        name: 'MarketDataError',
        rateLimited: true,
      })
    })

    it('throws MarketDataError for empty ticker', async () => {
      await expect(provider.getQuote('')).rejects.toThrow(MarketDataError)
    })

    it('throws MarketDataError for ticker that is too long', async () => {
      await expect(provider.getQuote('TOOLONGTICKER123456789')).rejects.toThrow(MarketDataError)
    })
  })

  describe('getNews', () => {
    it('parses RSS news items', async () => {
      const rss = `<?xml version="1.0"?><rss><channel>
        <item><title>Apple Reports Record Revenue</title><link>https://example.com/apple</link><pubDate>Sat, 31 May 2026 20:00:00 GMT</pubDate></item>
      </channel></rss>`
      fetchMock.mockResolvedValueOnce(textResponse(rss))

      const news = await provider.getNews('AAPL', 5)
      expect(news).toHaveLength(1)
      expect(news[0].title).toBe('Apple Reports Record Revenue')
      expect(news[0].url).toBe('https://example.com/apple')
      expect(news[0].provider).toBe('yahoo-finance')
    })

    it('returns empty array when the feed fails (non-critical)', async () => {
      fetchMock.mockResolvedValueOnce(textResponse('Too Many Requests', 429))
      const news = await provider.getNews('AAPL')
      expect(news).toEqual([])
    })

    it('returns empty array when fetch throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'))
      const news = await provider.getNews('AAPL')
      expect(news).toEqual([])
    })
  })

  describe('getHistory', () => {
    it('returns historical prices from the chart endpoint', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(chartBody()))

      const history = await provider.getHistory('AAPL', new Date('2026-05-01'), new Date('2026-05-31'))
      expect(history).toHaveLength(2)
      expect(history[1].close).toBe(175.5)
      expect(history[0].open).toBe(170)
    })

    it('skips gaps where close is null', async () => {
      const body = chartBody()
      body.chart.result[0].indicators.quote[0].close = [174, null as unknown as number]
      fetchMock.mockResolvedValueOnce(jsonResponse(body))

      const history = await provider.getHistory('AAPL', new Date('2026-05-01'), new Date('2026-05-31'))
      expect(history).toHaveLength(1)
      expect(history[0].close).toBe(174)
    })
  })

  describe('getEarningsCalendar', () => {
    it('returns an empty array (handled by keyed providers)', async () => {
      const events = await provider.getEarningsCalendar(['AAPL'])
      expect(events).toEqual([])
    })
  })
})
