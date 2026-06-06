import { Router } from 'express'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { portfolioHoldings } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i

function parseFiniteNumber(val: unknown): number | null {
  const n = Number(val)
  if (!isFinite(n)) return null
  return n
}

const createHoldingSchema = z.object({
  ticker: z.string().regex(TICKER_REGEX, 'Invalid ticker symbol'),
  shares: z.union([z.string(), z.number()]).refine((v) => {
    const n = parseFiniteNumber(v)
    return n !== null && n > 0
  }, 'shares must be a finite number > 0'),
  avgCost: z.union([z.string(), z.number()]).optional().refine((v) => {
    if (v == null) return true
    const n = parseFiniteNumber(v)
    return n !== null && n >= 0
  }, 'avgCost must be a finite number >= 0'),
  notes: z.string().optional(),
})

const patchHoldingSchema = z.object({
  shares: z.union([z.string(), z.number()]).optional().refine((v) => {
    if (v == null) return true
    const n = parseFiniteNumber(v)
    return n !== null && n > 0
  }, 'shares must be a finite number > 0'),
  avgCost: z.union([z.string(), z.number()]).optional().refine((v) => {
    if (v == null) return true
    const n = parseFiniteNumber(v)
    return n !== null && n >= 0
  }, 'avgCost must be a finite number >= 0'),
  notes: z.string().optional(),
})

export function createPortfolioRouter(db: Db): Router {
  const router = Router()

  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // GET /api/portfolio/:companyId/holdings
  router.get('/:companyId/holdings', async (req, res, next) => {
    try {
      const { companyId } = req.params
      assertCompanyAccess(req, companyId)
      const rows = await db
        .select()
        .from(portfolioHoldings)
        .where(eq(portfolioHoldings.companyId, companyId))
        .orderBy(desc(portfolioHoldings.createdAt))
      res.json(rows)
    } catch (err) {
      next(err)
    }
  })

  // POST /api/portfolio/:companyId/holdings
  router.post('/:companyId/holdings', async (req, res, next) => {
    try {
      const { companyId } = req.params
      assertCompanyAccess(req, companyId)
      const parse = createHoldingSchema.safeParse(req.body)
      if (!parse.success) {
        return res.status(400).json({ error: parse.error.errors[0]?.message ?? 'Invalid input' })
      }
      const { ticker, shares, avgCost, notes } = parse.data
      const rows = await db
        .insert(portfolioHoldings)
        .values({
          companyId,
          ticker: ticker.toUpperCase(),
          shares: String(shares),
          avgCost: avgCost != null ? String(avgCost) : null,
          notes: notes ?? null,
        })
        .returning()
      return res.json(rows[0])
    } catch (err) {
      next(err)
    }
  })

  // PATCH /api/portfolio/:companyId/holdings/:id
  router.patch('/:companyId/holdings/:id', async (req, res, next) => {
    try {
      const { companyId, id } = req.params
      assertCompanyAccess(req, companyId)
      const parse = patchHoldingSchema.safeParse(req.body)
      if (!parse.success) {
        return res.status(400).json({ error: parse.error.errors[0]?.message ?? 'Invalid input' })
      }
      const { shares, avgCost, notes } = parse.data
      const setValues: Record<string, unknown> = { updatedAt: new Date() }
      if (shares !== undefined) setValues.shares = String(shares)
      if (avgCost !== undefined) setValues.avgCost = avgCost != null ? String(avgCost) : null
      if (notes !== undefined) setValues.notes = notes
      const rows = await db
        .update(portfolioHoldings)
        .set(setValues)
        .where(and(eq(portfolioHoldings.id, id), eq(portfolioHoldings.companyId, companyId)))
        .returning()
      if (rows.length === 0) return res.status(404).json({ error: 'Holding not found' })
      return res.json(rows[0])
    } catch (err) {
      next(err)
    }
  })

  // DELETE /api/portfolio/:companyId/holdings/:id
  router.delete('/:companyId/holdings/:id', async (req, res, next) => {
    try {
      const { companyId, id } = req.params
      assertCompanyAccess(req, companyId)
      await db
        .delete(portfolioHoldings)
        .where(and(eq(portfolioHoldings.id, id), eq(portfolioHoldings.companyId, companyId)))
      return res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  })

  return router
}
