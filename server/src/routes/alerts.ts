import { Router } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { alertRules } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'

const ALERT_CONDITION_TYPES = ["price_above", "price_below", "percent_change", "volume_spike", "earnings_date"] as const
import { assertAuthenticated, assertCompanyAccess } from './authz.js'

const TICKER_REGEX = /^[A-Z0-9.\-^=]{1,20}$/i

const NUMERIC_THRESHOLD_CONDITIONS = ['price_above', 'price_below', 'percent_change'] as const

const createAlertSchema = z.object({
  ticker: z.string().regex(TICKER_REGEX, 'Invalid ticker symbol'),
  conditionType: z.enum(ALERT_CONDITION_TYPES),
  threshold: z.string().optional(),
  agentId: z.string().uuid().optional(),
}).refine((data) => {
  if (NUMERIC_THRESHOLD_CONDITIONS.includes(data.conditionType as any)) {
    if (!data.threshold) return false
    return !isNaN(Number(data.threshold))
  }
  return true
}, { message: 'Threshold must be a numeric value for price/percent conditions' })

export function createAlertsRouter(db: Db): Router {
  const router = Router()

  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // GET /api/alerts/:companyId
  router.get('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const rows = await db
      .select({
        id: alertRules.id,
        ticker: alertRules.ticker,
        conditionType: alertRules.conditionType,
        threshold: alertRules.threshold,
        agentId: alertRules.agentId,
        active: alertRules.active,
        createdAt: alertRules.createdAt,
      })
      .from(alertRules)
      .where(eq(alertRules.companyId, companyId))
    return res.json(rows)
  })

  // POST /api/alerts/:companyId
  router.post('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const parse = createAlertSchema.safeParse(req.body)
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.errors[0]?.message ?? 'Invalid input' })
    }
    const { ticker, conditionType, threshold, agentId } = parse.data
    const rows = await db
      .insert(alertRules)
      .values({ companyId, ticker: ticker.toUpperCase(), conditionType, threshold: threshold ?? null, agentId: agentId ?? null })
      .returning({
        id: alertRules.id,
        ticker: alertRules.ticker,
        conditionType: alertRules.conditionType,
        threshold: alertRules.threshold,
        agentId: alertRules.agentId,
        active: alertRules.active,
        createdAt: alertRules.createdAt,
      })
    return res.status(201).json(rows[0])
  })

  // DELETE /api/alerts/:companyId/:alertId
  router.delete('/:companyId/:alertId', async (req, res) => {
    const { companyId, alertId } = req.params
    assertCompanyAccess(req, companyId)
    const deleted = await db
      .delete(alertRules)
      .where(and(eq(alertRules.companyId, companyId), eq(alertRules.id, alertId)))
      .returning({ id: alertRules.id })
    if (deleted.length === 0) return res.status(404).json({ error: 'Alert not found' })
    return res.status(204).send()
  })

  // PATCH /api/alerts/:companyId/:alertId  body: { active: boolean }
  router.patch('/:companyId/:alertId', async (req, res) => {
    const { companyId, alertId } = req.params
    assertCompanyAccess(req, companyId)
    const parse = z.object({ active: z.boolean() }).safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: 'active (boolean) required' })
    const rows = await db
      .update(alertRules)
      .set({ active: parse.data.active })
      .where(and(eq(alertRules.companyId, companyId), eq(alertRules.id, alertId)))
      .returning({ id: alertRules.id, active: alertRules.active })
    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' })
    return res.json(rows[0])
  })

  return router
}
