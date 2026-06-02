import { describe, it, expect } from 'vitest'
import { mapStripeStatusToSubscription } from './billing.js'

describe('mapStripeStatusToSubscription', () => {
  it('maps stripe statuses to internal subscription status', () => {
    expect(mapStripeStatusToSubscription('active')).toBe('active')
    expect(mapStripeStatusToSubscription('trialing')).toBe('active')
    expect(mapStripeStatusToSubscription('past_due')).toBe('past_due')
    expect(mapStripeStatusToSubscription('unpaid')).toBe('past_due')
    expect(mapStripeStatusToSubscription('canceled')).toBe('canceled')
    expect(mapStripeStatusToSubscription('incomplete_expired')).toBe('canceled')
    expect(mapStripeStatusToSubscription('something_else')).toBe(null)
  })
})
