import { Router } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { watchlistTickers } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import type express from 'express'
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
    assertCompanyAccess(req, companyId)
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
  router.post('/:companyId', async (req, res, next: express.NextFunction) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const parse = tickerSchema.safeParse(req.body?.ticker)
    if (!parse.success) {
      return res.status(400).json({ error: 'Invalid ticker symbol' })
    }
    const ticker = parse.data.toUpperCase()
    const notesRaw = req.body?.notes
    const notesSchema = z.string().max(2000).nullable().optional()
    const notesParse = notesSchema.safeParse(typeof notesRaw === 'string' ? notesRaw : null)
    if (!notesParse.success) {
      return res.status(400).json({ error: 'Notes must be 2000 characters or less' })
    }
    const notes = notesParse.data ?? null
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
      return next(err)
    }
  })

  // DELETE /api/watchlist/:companyId/:ticker
  router.delete('/:companyId/:ticker', async (req, res) => {
    const { companyId, ticker } = req.params
    assertCompanyAccess(req, companyId)
    const deleted = await db
      .delete(watchlistTickers)
      .where(and(eq(watchlistTickers.companyId, companyId), eq(watchlistTickers.ticker, ticker.toUpperCase())))
      .returning({ id: watchlistTickers.id })
    if (deleted.length === 0) return res.status(404).json({ error: 'Ticker not found' })
    return res.status(204).send()
  })

  return router
}
