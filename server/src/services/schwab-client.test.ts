import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSchwabClient } from './schwab-client.js'

const mockFetch = vi.fn()

describe('SchwabClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = mockFetch
  })

  it('buildAuthUrl returns correct Schwab OAuth URL', () => {
    const client = createSchwabClient({ clientId: 'test-id', clientSecret: 'test-secret', redirectUri: 'http://localhost/callback' })
    const url = client.buildAuthUrl('state-abc')
    expect(url).toContain('api.schwabapi.com')
    expect(url).toContain('client_id=test-id')
    expect(url).toContain('state=state-abc')
    expect(url).toContain('response_type=code')
  })

  it('exchangeCode returns access and refresh tokens', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'acc-token',
        refresh_token: 'ref-token',
        expires_in: 1800,
        token_type: 'Bearer',
      }),
    })
    const client = createSchwabClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/cb' })
    const tokens = await client.exchangeCode('auth-code')
    expect(tokens.accessToken).toBe('acc-token')
    expect(tokens.refreshToken).toBe('ref-token')
    expect(tokens.expiresAt).toBeInstanceOf(Date)
  })

  it('exchangeCode throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'Bad request' })
    const client = createSchwabClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/cb' })
    await expect(client.exchangeCode('bad-code')).rejects.toThrow('Schwab token exchange failed')
  })

  it('getHoldings returns normalized positions', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        accountNumber: '12345',
        securitiesAccount: {
          positions: [
            {
              instrument: { symbol: 'AAPL', assetType: 'EQUITY' },
              longQuantity: 10,
              averagePrice: 150.00,
              marketValue: 1750.00,
            }
          ]
        }
      }]),
    })
    const client = createSchwabClient({ clientId: 'id', clientSecret: 'secret', redirectUri: 'http://localhost/cb' })
    const holdings = await client.getHoldings('acc-token')
    expect(holdings[0].ticker).toBe('AAPL')
    expect(holdings[0].quantity).toBe(10)
    expect(holdings[0].averageCost).toBe(150.00)
    expect(holdings[0].marketValue).toBe(1750.00)
  })
})
