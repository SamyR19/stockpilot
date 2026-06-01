import { describe, it, expect } from 'vitest'
import { createRunLimitService } from './run-limit.js'

const COMPANY = '11111111-1111-1111-1111-111111111111'

function dbWithCount(n: number) {
  return {
    select: () => ({ from: () => ({ where: async () => [{ count: n }] }) }),
  } as any
}

describe('run-limit service', () => {
  it('never limits non-free tiers', async () => {
    const svc = createRunLimitService(dbWithCount(999))
    expect(await svc.canStartRun(COMPANY, 'subscription')).toEqual({ allowed: true })
    expect(await svc.canStartRun(COMPANY, 'selfhost')).toEqual({ allowed: true })
    expect(await svc.canStartRun(COMPANY, 'keys')).toEqual({ allowed: true })
  })

  it('allows free tier under the monthly cap', async () => {
    const svc = createRunLimitService(dbWithCount(19))
    expect(await svc.canStartRun(COMPANY, 'free')).toEqual({ allowed: true, used: 19, limit: 20 })
  })

  it('blocks free tier at or over the monthly cap', async () => {
    const svc = createRunLimitService(dbWithCount(20))
    const result = await svc.canStartRun(COMPANY, 'free')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('monthly run limit')
  })

  it('works when canStartRun is destructured (no this-binding)', async () => {
    const { canStartRun } = createRunLimitService(dbWithCount(0))
    expect(await canStartRun(COMPANY, 'free')).toEqual({ allowed: true, used: 0, limit: 20 })
  })
})
