import { Router } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { watchlistTickers } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i
const tickerSchema = z.string().regex(TICKER_REGEX, 'Invalid ticker symbol')

export function createWatchlistRouter(db: Db): Router {
  const router = Router()

  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // GET /api/watchlist/:companyId
  router.get('/:companyId', async (req, res) => {
    const { companyId } = req.params
    try {
      assertCompanyAccess(req, companyId)
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const rows = await db
      .select({
        id: watchlistTickers.id,
        ticker: watchlistTickers.ticker,
        notes: watchlistTickers.notes,
        addedAt: watchlistTickers.addedAt,
      })
      .from(watchlistTickers)
      .where(eq(watchlistTickers.companyId, companyId))
    return res.json(rows)
  })

  // POST /api/watchlist/:companyId  body: { ticker, notes? }
  router.post('/:companyId', async (req, res) => {
    const { companyId } = req.params
    try {
      assertCompanyAccess(req, companyId)
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const parse = tickerSchema.safeParse(req.body?.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    const ticker = parse.data.toUpperCase()
    const notes: string | null = typeof req.body?.notes === 'string' ? req.body.notes : null
    try {
      const rows = await db
        .insert(watchlistTickers)
        .values({ companyId, ticker, notes })
        .returning({
          id: watchlistTickers.id,
          ticker: watchlistTickers.ticker,
          notes: watchlistTickers.notes,
          addedAt: watchlistTickers.addedAt,
        })
      return res.status(201).json(rows[0])
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: `${ticker} is already on your watchlist` })
      }
      throw err
    }
  })

  // DELETE /api/watchlist/:companyId/:ticker
  router.delete('/:companyId/:ticker', async (req, res) => {
    const { companyId, ticker } = req.params
    try {
      assertCompanyAccess(req, companyId)
    } catch (err) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    await db
      .delete(watchlistTickers)
      .where(and(eq(watchlistTickers.companyId, companyId), eq(watchlistTickers.ticker, ticker.toUpperCase())))
    return res.status(204).send()
  })

  return router
}
