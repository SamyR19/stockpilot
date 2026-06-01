const SCHWAB_AUTH_BASE = 'https://api.schwabapi.com/v1/oauth'
const SCHWAB_API_BASE = 'https://api.schwabapi.com/trader/v1'

export interface SchwabClientConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface SchwabTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

export interface PortfolioHolding {
  ticker: string
  assetType: string
  quantity: number
  averageCost: number
  marketValue: number
  broker: 'schwab'
}

export function createSchwabClient(config: SchwabClientConfig) {
  function basicAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  }

  function buildAuthUrl(state: string): string {
    const url = new URL(`${SCHWAB_AUTH_BASE}/authorize`)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', config.clientId)
    url.searchParams.set('redirect_uri', config.redirectUri)
    url.searchParams.set('state', state)
    return url.toString()
  }

  async function exchangeCode(code: string): Promise<SchwabTokens> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    })
    const res = await fetch(`${SCHWAB_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Schwab token exchange failed: ${res.status} ${text}`)
    }
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    }
  }

  async function refreshAccessToken(refreshToken: string): Promise<SchwabTokens> {
    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })
    const res = await fetch(`${SCHWAB_AUTH_BASE}/token`, {
      method: 'POST',
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Schwab token refresh failed: ${res.status} ${text}`)
    }
    const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    }
  }

  async function getHoldings(accessToken: string): Promise<PortfolioHolding[]> {
    const res = await fetch(`${SCHWAB_API_BASE}/accounts?fields=positions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Schwab accounts fetch failed: ${res.status} ${text}`)
    }
    const accounts = await res.json() as any[]
    const holdings: PortfolioHolding[] = []
    for (const account of accounts) {
      for (const pos of account.securitiesAccount?.positions ?? []) {
        const instrument = pos.instrument ?? {}
        if (!instrument.symbol) continue
        holdings.push({
          ticker: instrument.symbol,
          assetType: instrument.assetType ?? 'EQUITY',
          quantity: pos.longQuantity ?? 0,
          averageCost: pos.averagePrice ?? 0,
          marketValue: pos.marketValue ?? 0,
          broker: 'schwab',
        })
      }
    }
    return holdings
  }

  return { buildAuthUrl, exchangeCode, refreshAccessToken, getHoldings }
}

export type SchwabClient = ReturnType<typeof createSchwabClient>
