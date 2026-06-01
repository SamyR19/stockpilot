import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getMode,
  isCloud,
  isSelfHost,
  getUserTier,
  canUseRole,
  canUseDataProvider,
} from './index.js'

describe('feature-flags', () => {
  let originalMode: string | undefined

  beforeEach(() => {
    originalMode = process.env.STOCKPILOT_MODE
  })

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.STOCKPILOT_MODE
    } else {
      process.env.STOCKPILOT_MODE = originalMode
    }
  })

  describe('getMode()', () => {
    it('defaults to selfhost when env var not set', () => {
      delete process.env.STOCKPILOT_MODE
      expect(getMode()).toBe('selfhost')
    })

    it('returns cloud when STOCKPILOT_MODE=cloud', () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      expect(getMode()).toBe('cloud')
    })
  })

  describe('isCloud()', () => {
    it('returns false in selfhost mode', () => {
      delete process.env.STOCKPILOT_MODE
      expect(isCloud()).toBe(false)
    })

    it('returns true in cloud mode', () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      expect(isCloud()).toBe(true)
    })
  })

  describe('isSelfHost()', () => {
    it('returns true in selfhost mode', () => {
      delete process.env.STOCKPILOT_MODE
      expect(isSelfHost()).toBe(true)
    })

    it('returns false in cloud mode', () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      expect(isSelfHost()).toBe(false)
    })
  })

  describe('getUserTier()', () => {
    it('returns selfhost for getUserTier(null) in selfhost mode', () => {
      delete process.env.STOCKPILOT_MODE
      expect(getUserTier(null)).toBe('selfhost')
    })

    it('returns free for getUserTier(null) in cloud mode', () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      expect(getUserTier(null)).toBe('free')
    })

    it('returns subscription for getUserTier("active") in cloud mode', () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      expect(getUserTier('active')).toBe('subscription')
    })

    it('returns keys for getUserTier("keys") in cloud mode', () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      expect(getUserTier('keys')).toBe('keys')
    })

    it('returns free when subscription status is past_due in cloud mode', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { getUserTier } = await import('./index.js')
      expect(getUserTier('past_due')).toBe('free')
    })

    it('returns free when subscription status is canceled in cloud mode', async () => {
      process.env.STOCKPILOT_MODE = 'cloud'
      const { getUserTier } = await import('./index.js')
      expect(getUserTier('canceled')).toBe('free')
    })
  })

  describe('canUseRole()', () => {
    it('canUseRole("news-sentinel", "free") returns true', () => {
      expect(canUseRole('news-sentinel', 'free')).toBe(true)
    })

    it('canUseRole("equity-analyst", "free") returns false', () => {
      expect(canUseRole('equity-analyst', 'free')).toBe(false)
    })

    it('canUseRole("equity-analyst", "subscription") returns true', () => {
      expect(canUseRole('equity-analyst', 'subscription')).toBe(true)
    })

    it('allows all roles in selfhost tier', () => {
      expect(canUseRole('equity-analyst', 'selfhost')).toBe(true)
      expect(canUseRole('risk-manager', 'selfhost')).toBe(true)
      expect(canUseRole('news-sentinel', 'selfhost')).toBe(true)
    })
  })
})

describe('canUseDataProvider', () => {
  it('allows yahoo-finance on every tier', () => {
    for (const tier of ['selfhost', 'free', 'keys', 'subscription'] as const) {
      expect(canUseDataProvider('yahoo-finance', tier)).toBe(true)
    }
  })
  it('denies unknown providers on every tier (deny-by-default)', () => {
    for (const tier of ['selfhost', 'free', 'keys', 'subscription'] as const) {
      expect(canUseDataProvider('unknown-provider' as never, tier)).toBe(false)
    }
  })
  it('restricts alpha-vantage and polygon to non-free tiers', () => {
    expect(canUseDataProvider('alpha-vantage', 'free')).toBe(false)
    expect(canUseDataProvider('polygon', 'free')).toBe(false)
    for (const tier of ['selfhost', 'keys', 'subscription'] as const) {
      expect(canUseDataProvider('alpha-vantage', tier)).toBe(true)
      expect(canUseDataProvider('polygon', tier)).toBe(true)
    }
  })
})
