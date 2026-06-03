import { Router } from 'express'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { researchReports } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i

const reportColumns = {
  id: researchReports.id,
  ticker: researchReports.ticker,
  reportType: researchReports.reportType,
  content: researchReports.content,
  recommendation: researchReports.recommendation,
  targetPriceCents: researchReports.targetPriceCents,
  issueId: researchReports.issueId,
  createdAt: researchReports.createdAt,
  updatedAt: researchReports.updatedAt,
}

const createReportSchema = z.object({
  ticker: z.string().regex(TICKER_REGEX, 'Invalid ticker symbol'),
  content: z.string().min(1).max(100000),
  reportType: z.string().max(50).optional(),
  recommendation: z.string().max(50).nullable().optional(),
  targetPriceCents: z.number().int().positive().nullable().optional(),
  issueId: z.string().uuid().nullable().optional(),
})

export function createResearchRouter(db: Db): Router {
  const router = Router()

  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // GET /api/research/:companyId?ticker=AAPL&limit=50
  router.get('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)

    const tickerParam = typeof req.query.ticker === 'string' ? req.query.ticker.toUpperCase() : null
    const limitRaw = Number(req.query.limit)
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50

    const where = tickerParam
      ? and(eq(researchReports.companyId, companyId), eq(researchReports.ticker, tickerParam))
      : eq(researchReports.companyId, companyId)

    const rows = await db
      .select(reportColumns)
      .from(researchReports)
      .where(where)
      .orderBy(desc(researchReports.createdAt))
      .limit(limit)
    return res.json(rows)
  })

  // GET /api/research/:companyId/:reportId
  router.get('/:companyId/:reportId', async (req, res) => {
    const { companyId, reportId } = req.params
    assertCompanyAccess(req, companyId)
    const rows = await db
      .select(reportColumns)
      .from(researchReports)
      .where(and(eq(researchReports.companyId, companyId), eq(researchReports.id, reportId)))
      .limit(1)
    if (rows.length === 0) return res.status(404).json({ error: 'Report not found' })
    return res.json(rows[0])
  })

  // POST /api/research/:companyId
  router.post('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const parse = createReportSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.errors[0]?.message ?? 'Invalid input' })
    }
    const { ticker, content, reportType, recommendation, targetPriceCents, issueId } = parse.data
    const rows = await db
      .insert(researchReports)
      .values({
        companyId,
        ticker: ticker.toUpperCase(),
        content,
        reportType: reportType ?? 'general',
        recommendation: recommendation ?? null,
        targetPriceCents: targetPriceCents ?? null,
        issueId: issueId ?? null,
      })
      .returning(reportColumns)
    return res.status(201).json(rows[0])
  })

  // DELETE /api/research/:companyId/:reportId
  router.delete('/:companyId/:reportId', async (req, res) => {
    const { companyId, reportId } = req.params
    assertCompanyAccess(req, companyId)
    const deleted = await db
      .delete(researchReports)
      .where(and(eq(researchReports.companyId, companyId), eq(researchReports.id, reportId)))
      .returning({ id: researchReports.id })
    if (deleted.length === 0) return res.status(404).json({ error: 'Report not found' })
    return res.status(204).send()
  })

  return router
}
