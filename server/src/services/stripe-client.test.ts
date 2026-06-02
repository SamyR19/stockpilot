import { describe, it, expect } from 'vitest'
import { getStripe } from './stripe-client.js'

describe('getStripe', () => {
  it('throws a 503-tagged error when no secret key is configured', () => {
    try {
      getStripe(undefined)
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as Error & { statusCode?: number }).statusCode).toBe(503)
      expect((e as Error).message).toMatch(/not configured/i)
    }
  })
  it('returns a Stripe instance when a key is provided (and caches it)', () => {
    const a = getStripe('sk_test_dummy')
    const b = getStripe('sk_test_dummy')
    expect(a).toBe(b) // cached singleton
  })
})
