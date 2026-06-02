import { describe, it, expect } from 'vitest'
import { assertRoleAllowedForTier } from './agents.js'

describe('assertRoleAllowedForTier', () => {
  it('allows news-sentinel on free tier', () => {
    expect(() => assertRoleAllowedForTier('news-sentinel', 'free')).not.toThrow()
  })
  it('blocks equity-analyst on free tier', () => {
    expect(() => assertRoleAllowedForTier('equity-analyst', 'free')).toThrowError(/upgrade/i)
  })
  it('allows any role on subscription tier', () => {
    expect(() => assertRoleAllowedForTier('equity-analyst', 'subscription')).not.toThrow()
  })
})
