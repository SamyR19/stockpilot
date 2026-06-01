import { Router } from 'express'
import { z } from 'zod'
import { MarketDataClient } from '@stockpilotai/market-data'
import { loadConfig } from '../config.js'
import { logger } from '../middleware/logger.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i
const tickerSchema = z.string().regex(TICKER_REGEX, 'Invalid ticker symbol')

function getMarketClient(): MarketDataClient {
  const config = loadConfig()
  return new MarketDataClient({
    alphaVantageApiKey: config.alphaVantageApiKey,
    polygonApiKey: config.polygonApiKey,
  })
}

export function createMarketRouter(): Router {
  const router = Router()

  // GET /api/market/quote/:ticker
  router.get('/quote/:ticker', async (req, res) => {
    const parse = tickerSchema.safeParse(req.params.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    try {
      const client = getMarketClient()
      const quote = await client.getQuote(parse.data.toUpperCase())
      return res.json(quote)
    } catch (err) {
      logger.error({ err, ticker: req.params.ticker }, 'Failed to fetch quote')
      return res.status(502).json({ error: 'Failed to fetch market data' })
    }
  })

  // GET /api/market/news/:ticker?limit=10
  router.get('/news/:ticker', async (req, res) => {
    const parse = tickerSchema.safeParse(req.params.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 50)
    try {
      const client = getMarketClient()
      const news = await client.getNews(parse.data.toUpperCase(), limit)
      return res.json(news)
    } catch (err) {
      logger.error({ err, ticker: req.params.ticker }, 'Failed to fetch news')
      return res.status(502).json({ error: 'Failed to fetch news' })
    }
  })

  // GET /api/market/history/:ticker?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get('/history/:ticker', async (req, res) => {
    const parse = tickerSchema.safeParse(req.params.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    const fromStr = String(req.query.from ?? '')
    const toStr = String(req.query.to ?? '')
    const fromDate = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const toDate = toStr ? new Date(toStr) : new Date()
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' })
    }
    try {
      const client = getMarketClient()
      const history = await client.getHistory(parse.data.toUpperCase(), fromDate, toDate)
      return res.json(history)
    } catch (err) {
      logger.error({ err, ticker: req.params.ticker }, 'Failed to fetch history')
      return res.status(502).json({ error: 'Failed to fetch price history' })
    }
  })

  // GET /api/market/earnings-calendar?tickers=AAPL,MSFT,GOOGL
  router.get('/earnings-calendar', async (req, res) => {
    const raw = String(req.query.tickers ?? '')
    if (!raw) {
      return res.status(400).json({ error: 'tickers query param required (comma-separated)' })
    }
    const tickers = raw
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter((t) => TICKER_REGEX.test(t))
      .slice(0, 20)
    if (tickers.length === 0) {
      return res.status(400).json({ error: 'No valid tickers provided' })
    }
    try {
      const client = getMarketClient()
      const calendar = await client.getEarningsCalendar(tickers)
      return res.json(calendar)
    } catch (err) {
      logger.error({ err }, 'Failed to fetch earnings calendar')
      return res.status(502).json({ error: 'Failed to fetch earnings calendar' })
    }
  })

  // GET /api/market/providers
  router.get('/providers', (_req, res) => {
    const client = getMarketClient()
    return res.json({ providers: client.availableProviders })
  })

  return router
}
