import { describe, it, expect } from 'vitest'
import { assertRunAllowed, RunLimitError } from './run-limit.js'

describe('assertRunAllowed', () => {
  it('throws RunLimitError when not allowed', () => {
    expect(() => assertRunAllowed({ allowed: false, reason: 'monthly run limit reached' }))
      .toThrowError(/monthly run limit/)
  })
  it('the thrown error carries statusCode 402', () => {
    try { assertRunAllowed({ allowed: false, reason: 'x' }); throw new Error('should have thrown') }
    catch (e) { expect(e).toBeInstanceOf(RunLimitError); expect((e as RunLimitError).statusCode).toBe(402) }
  })
  it('does nothing when allowed', () => {
    expect(() => assertRunAllowed({ allowed: true })).not.toThrow()
  })
})
