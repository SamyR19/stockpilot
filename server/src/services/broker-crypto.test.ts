import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken } from './broker-crypto.js'

describe('broker-crypto', () => {
  it('round-trips a token string', () => {
    const token = 'test-access-token-abc123'
    const encrypted = encryptToken(token)
    expect(encrypted).not.toBe(token)
    expect(decryptToken(encrypted)).toBe(token)
  })

  it('produces different ciphertext each call (random IV)', () => {
    const token = 'same-token'
    expect(encryptToken(token)).not.toBe(encryptToken(token))
  })

  it('decryptToken throws on tampered ciphertext', () => {
    const encrypted = encryptToken('hello')
    const tampered = encrypted.slice(0, -4) + 'XXXX'
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('handles empty string', () => {
    expect(decryptToken(encryptToken(''))).toBe('')
  })
})
