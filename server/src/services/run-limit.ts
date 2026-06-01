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
  async function monthlyRunCount(companyId: string): Promise<number> {
    // Count every run row created this month (status-agnostic). A run row is
    // inserted when a run is queued, so createdAt is the correct "attempted this
    // month" signal for the free-tier cap — we intentionally count attempts, not
    // only runs that reached startedAt.
    const rows = await db
      .select({ count: count() })
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.companyId, companyId), gte(heartbeatRuns.createdAt, startOfMonthUtc())))
    return Number(rows[0]?.count ?? 0)
  }

  async function canStartRun(companyId: string, tier: UserTier): Promise<RunLimitDecision> {
    if (tier !== 'free') return { allowed: true }
    const used = await monthlyRunCount(companyId)
    if (used >= FREE_TIER_MONTHLY_RUNS) {
      return {
        allowed: false,
        reason: `Free tier monthly run limit reached (${FREE_TIER_MONTHLY_RUNS}). Upgrade or add your own API keys for unlimited runs.`,
        used,
        limit: FREE_TIER_MONTHLY_RUNS,
      }
    }
    return { allowed: true, used, limit: FREE_TIER_MONTHLY_RUNS }
  }

  return { monthlyRunCount, canStartRun }
}

export class RunLimitError extends Error {
  readonly statusCode = 402 // Payment Required
  constructor(message: string) {
    super(message)
    this.name = 'RunLimitError'
  }
}

export function assertRunAllowed(decision: RunLimitDecision): void {
  if (!decision.allowed) {
    throw new RunLimitError(decision.reason ?? 'Run not allowed for the current plan tier')
  }
}
