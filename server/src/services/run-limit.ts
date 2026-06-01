import { and, eq, gte, count } from 'drizzle-orm'
import { heartbeatRuns } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { FREE_TIER_MONTHLY_RUNS, type UserTier } from '@stockpilotai/feature-flags'

export interface RunLimitDecision {
  allowed: boolean
  reason?: string
  used?: number
  limit?: number
}

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export interface RunLimitService {
  monthlyRunCount(companyId: string): Promise<number>
  canStartRun(companyId: string, tier: UserTier): Promise<RunLimitDecision>
}

export function createRunLimitService(db: Db): RunLimitService {
  return {
    async monthlyRunCount(companyId) {
      const rows = await db
        .select({ count: count() })
        .from(heartbeatRuns)
        .where(and(eq(heartbeatRuns.companyId, companyId), gte(heartbeatRuns.createdAt, startOfMonthUtc())))
      return Number(rows[0]?.count ?? 0)
    },

    async canStartRun(companyId, tier) {
      if (tier !== 'free') return { allowed: true }
      const used = await this.monthlyRunCount(companyId)
      if (used >= FREE_TIER_MONTHLY_RUNS) {
        return {
          allowed: false,
          reason: `Free tier monthly run limit reached (${FREE_TIER_MONTHLY_RUNS}). Upgrade or add your own API keys for unlimited runs.`,
          used,
          limit: FREE_TIER_MONTHLY_RUNS,
        }
      }
      return { allowed: true, used, limit: FREE_TIER_MONTHLY_RUNS }
    },
  }
}
