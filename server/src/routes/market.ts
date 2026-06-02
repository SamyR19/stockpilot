import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { MarketDataClient, MarketDataError } from '@stockpilotai/market-data'
import { canUseDataProvider, type UserTier } from '@stockpilotai/feature-flags'
import { logger } from '../middleware/logger.js'
import { assertAuthenticated } from './authz.js'

/**
 * Pure, tier-aware filter of which data-provider API keys may be used.
 * The free tier is restricted to Yahoo Finance, so its configured keys are
 * dropped here regardless of what's supplied. Higher tiers keep whatever keys
 * are actually configured. Keys that are absent are simply omitted.
 */
export function selectProvidersForTier(
  tier: UserTier,
  keys: { alphaVantageApiKey?: string; polygonApiKey?: string },
): { alphaVantageApiKey?: string; polygonApiKey?: string } {
  const out: { alphaVantageApiKey?: string; polygonApiKey?: string } = {}
  if (keys.alphaVantageApiKey && canUseDataProvider('alpha-vantage', tier)) {
    out.alphaVantageApiKey = keys.alphaVantageApiKey
  }
  if (keys.polygonApiKey && canUseDataProvider('polygon', tier)) {
    out.polygonApiKey = keys.polygonApiKey
  }
  return out
}

export interface MarketRouterDeps {
  resolveTier: (req: Request) => Promise<UserTier>
  resolveKeys: (req: Request) => Promise<{ alphaVantageApiKey?: string; polygonApiKey?: string }>
}

/**
 * Translate a market-data failure into an HTTP response. Upstream rate limits
 * (HTTP 429 from the data provider) become a 429 with an actionable message so
 * the UI can tell the user to retry or add an API key, instead of a generic 502.
 */
function sendMarketError(res: Response, err: unknown, fallbackMessage: string): Response {
  if (err instanceof MarketDataError && err.rateLimited) {
    return res.status(429).json({
      error: 'Market data is temporarily rate-limited. Try again in a moment, or add an Alpha Vantage / Polygon API key for reliable data.',
    })
  }
  return res.status(502).json({ error: fallbackMessage })
}

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i
const tickerSchema = z.string().regex(TICKER_REGEX, 'Invalid ticker symbol')

const marketRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
})

export function createMarketRouter(deps: MarketRouterDeps): Router {
  const router = Router()

  // Cache MarketDataClient instances by the resolved-provider signature so we
  // don't rebuild on every request. The client is lightweight, but tier-aware
  // resolution means there are only a few distinct provider combinations.
  const clientCache = new Map<string, MarketDataClient>()

  async function getClient(req: Request): Promise<MarketDataClient> {
    const [tier, keys] = await Promise.all([deps.resolveTier(req), deps.resolveKeys(req)])
    const providers = selectProvidersForTier(tier, keys)
    const cacheKey = `${providers.alphaVantageApiKey ?? ''}|${providers.polygonApiKey ?? ''}`
    let client = clientCache.get(cacheKey)
    if (!client) {
      client = new MarketDataClient(providers)
      clientCache.set(cacheKey, client)
    }
    return client
  }

  // Auth guard — reject unauthenticated requests
  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // Rate limiting
  router.use(marketRateLimit)

  // GET /api/market/quote/:ticker
  router.get('/quote/:ticker', async (req, res) => {
    const parse = tickerSchema.safeParse(req.params.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    try {
      const client = await getClient(req)
      const quote = await client.getQuote(parse.data.toUpperCase())
      return res.json(quote)
    } catch (err) {
      logger.error({ err, ticker: parse.data }, 'Failed to fetch quote')
      return sendMarketError(res, err, 'Failed to fetch market data')
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
      const client = await getClient(req)
      const news = await client.getNews(parse.data.toUpperCase(), limit)
      return res.json(news)
    } catch (err) {
      logger.error({ err, ticker: parse.data }, 'Failed to fetch news')
      return sendMarketError(res, err, 'Failed to fetch news')
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
    const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000
    if (toDate.getTime() - fromDate.getTime() > TWO_YEARS_MS) {
      return res.status(400).json({ error: 'Date range cannot exceed 2 years' })
    }
    try {
      const client = await getClient(req)
      const history = await client.getHistory(parse.data.toUpperCase(), fromDate, toDate)
      return res.json(history)
    } catch (err) {
      logger.error({ err, ticker: parse.data }, 'Failed to fetch history')
      return sendMarketError(res, err, 'Failed to fetch price history')
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
      const client = await getClient(req)
      const calendar = await client.getEarningsCalendar(tickers)
      return res.json(calendar)
    } catch (err) {
      logger.error({ err }, 'Failed to fetch earnings calendar')
      return res.status(502).json({ error: 'Failed to fetch earnings calendar' })
    }
  })

  return router
}
