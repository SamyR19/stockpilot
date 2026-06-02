import { describe, it, expect } from 'vitest'
import { selectProvidersForTier } from './market.js'

describe('selectProvidersForTier', () => {
  it('free tier gets yahoo only even if keys are present', () => {
    expect(selectProvidersForTier('free', { alphaVantageApiKey: 'av', polygonApiKey: 'pg' })).toEqual({})
  })
  it('keys/subscription/selfhost get the configured keys', () => {
    for (const tier of ['keys', 'subscription', 'selfhost'] as const) {
      expect(selectProvidersForTier(tier, { alphaVantageApiKey: 'av', polygonApiKey: 'pg' }))
        .toEqual({ alphaVantageApiKey: 'av', polygonApiKey: 'pg' })
    }
  })
  it('omits keys that are not configured', () => {
    expect(selectProvidersForTier('subscription', {})).toEqual({})
    expect(selectProvidersForTier('subscription', { polygonApiKey: 'pg' })).toEqual({ polygonApiKey: 'pg' })
  })
})
