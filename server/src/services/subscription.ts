import { eq } from 'drizzle-orm'
import { subscriptions } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { getUserTier, type SubscriptionStatus, type UserTier } from '@stockpilotai/feature-flags'

export interface SubscriptionRow {
  companyId: string
  status: string
  plan: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: Date | null
}

export type SubscriptionPatch = Pick<
  SubscriptionRow,
  'plan' | 'stripeCustomerId' | 'stripeSubscriptionId' | 'currentPeriodEnd'
>

export interface SubscriptionService {
  getForCompany(companyId: string): Promise<SubscriptionRow | null>
  tierFromStatus(status: SubscriptionStatus): UserTier
  tierForCompany(companyId: string): Promise<UserTier>
  setStatus(companyId: string, status: SubscriptionStatus, patch?: Partial<SubscriptionPatch>): Promise<void>
  linkStripeCustomer(companyId: string, stripeCustomerId: string): Promise<void>
}

function normalizeStatus(raw: string | null | undefined): SubscriptionStatus {
  if (raw === 'active' || raw === 'keys' || raw === 'past_due' || raw === 'canceled') return raw
  return null
}

export function createSubscriptionService(db: Db, opts: { isCloudMode: boolean }): SubscriptionService {
  return {
    async getForCompany(companyId) {
      const rows = await db
        .select({
          companyId: subscriptions.companyId,
          status: subscriptions.status,
          plan: subscriptions.plan,
          stripeCustomerId: subscriptions.stripeCustomerId,
          stripeSubscriptionId: subscriptions.stripeSubscriptionId,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(eq(subscriptions.companyId, companyId))
        .limit(1)
      return rows[0] ?? null
    },

    tierFromStatus(status) {
      if (!opts.isCloudMode) return 'selfhost'
      return getUserTier(status)
    },

    async tierForCompany(companyId) {
      if (!opts.isCloudMode) return 'selfhost'
      const row = await this.getForCompany(companyId)
      return getUserTier(normalizeStatus(row?.status))
    },

    async setStatus(companyId: string, status: SubscriptionStatus, patch: Partial<SubscriptionPatch> = {}) {
      const value = status ?? 'free'
      await db
        .insert(subscriptions)
        .values({ companyId, status: value, ...patch })
        .onConflictDoUpdate({
          target: subscriptions.companyId,
          set: { status: value, updatedAt: new Date(), ...patch },
        })
    },

    async linkStripeCustomer(companyId, stripeCustomerId) {
      await db
        .insert(subscriptions)
        .values({ companyId, status: 'free', stripeCustomerId })
        .onConflictDoUpdate({
          target: subscriptions.companyId,
          set: { stripeCustomerId, updatedAt: new Date() },
        })
    },
  }
}
