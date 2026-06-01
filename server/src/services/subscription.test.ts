import { describe, it, expect, vi } from 'vitest'
import { createSubscriptionService } from './subscription.js'

const COMPANY = '11111111-1111-1111-1111-111111111111'

function dbReturning(row: unknown) {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }) }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [row] }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [row] }) }) }),
  } as any
}

describe('subscription service', () => {
  it('returns selfhost tier in self-host mode regardless of row', () => {
    vi.stubEnv('STOCKPILOT_MODE', 'selfhost')
    const svc = createSubscriptionService(dbReturning(null), { isCloudMode: false })
    expect(svc.tierFromStatus(null)).toBe('selfhost')
    vi.unstubAllEnvs()
  })

  it('maps an active cloud subscription to the subscription tier', () => {
    vi.stubEnv('STOCKPILOT_MODE', 'cloud')
    const svc = createSubscriptionService(dbReturning(null), { isCloudMode: true })
    expect(svc.tierFromStatus('active')).toBe('subscription')
    expect(svc.tierFromStatus('keys')).toBe('keys')
    expect(svc.tierFromStatus('past_due')).toBe('free')
    expect(svc.tierFromStatus(null)).toBe('free')
    vi.unstubAllEnvs()
  })

  it('reads the subscription row for a company', async () => {
    const row = { companyId: COMPANY, status: 'active', stripeCustomerId: 'cus_1' }
    const svc = createSubscriptionService(dbReturning(row), { isCloudMode: true })
    const sub = await svc.getForCompany(COMPANY)
    expect(sub?.status).toBe('active')
  })
})
