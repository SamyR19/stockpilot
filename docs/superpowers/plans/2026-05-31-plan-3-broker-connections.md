# StockPilot AI — Plan 3: Portfolio Broker Connections

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build read-only portfolio connections — Schwab OAuth, CSV import, and a unified portfolio holdings API — so agents can read a user's real holdings when doing research.

**Architecture:** A new `BrokerCryptoService` reuses the existing AES-256-GCM master key (already used by the secrets subsystem) to encrypt/decrypt tokens before they touch the database. A `BrokerConnectionService` wraps the `broker_connections` Drizzle table. Schwab OAuth lives in two server routes (`/auth-url` + `/callback`). Portfolio sync calls the Schwab API and normalises the response into a `Holding[]` shape. CSV import parses a standard brokerage export. All routes live under `/api/broker` and require board authentication. Robinhood is out of scope for now (no maintained Node.js library).

**Tech Stack:** TypeScript, Drizzle ORM, Node.js `crypto` (AES-256-GCM), `papaparse` (CSV parsing), Express 5.x, Zod, Vitest, pnpm workspaces

---

## File Map

### Created
- `server/src/services/broker-crypto.ts` — AES-256-GCM encrypt/decrypt using the existing master key
- `server/src/services/broker-crypto.test.ts` — unit tests
- `server/src/services/broker-connections.ts` — CRUD service for `broker_connections` table
- `server/src/services/broker-connections.test.ts` — unit tests (in-memory mock DB)
- `server/src/services/schwab-client.ts` — thin Schwab API wrapper (OAuth token exchange + holdings fetch)
- `server/src/services/schwab-client.test.ts` — unit tests (mocked fetch)
- `server/src/services/portfolio-sync.ts` — normalises broker holdings into `Holding[]`
- `server/src/services/portfolio-sync.test.ts` — unit tests
- `server/src/routes/broker.ts` — Express router: auth-url, callback, list, disconnect, portfolio, csv-import
- `server/src/routes/broker.test.ts` — route integration tests (supertest + mocked services)

### Modified
- `server/src/config.ts` — add `SCHWAB_CLIENT_ID`, `SCHWAB_CLIENT_SECRET`, `SCHWAB_REDIRECT_URI`
- `server/src/app.ts` — mount broker router at `/api/broker`

---

## Task 1: Broker Token Encryption Utility

**Files:**
- Create: `server/src/services/broker-crypto.ts`
- Create: `server/src/services/broker-crypto.test.ts`

This reuses the same AES-256-GCM approach from `server/src/secrets/local-encrypted-provider.ts` and the same `PAPERCLIP_SECRETS_MASTER_KEY` env var. Do not introduce a new key or key file — one master key manages everything.

- [ ] **Step 1: Write failing tests**

```typescript
// server/src/services/broker-crypto.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && npx vitest run src/services/broker-crypto.test.ts
```

Expected: FAIL with "Cannot find module './broker-crypto.js'"

- [ ] **Step 3: Implement broker-crypto.ts**

```typescript
// server/src/services/broker-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Reuse the same master key used by the secrets subsystem.
// Key must be 32 bytes: set PAPERCLIP_SECRETS_MASTER_KEY as 64-char hex or base64.
function loadMasterKey(): Buffer {
  const raw = process.env.PAPERCLIP_SECRETS_MASTER_KEY
  if (raw && raw.trim().length > 0) {
    const trimmed = raw.trim()
    if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex')
    const decoded = Buffer.from(trimmed, 'base64')
    if (decoded.length === 32) return decoded
    if (Buffer.byteLength(trimmed, 'utf8') === 32) return Buffer.from(trimmed, 'utf8')
  }
  // In dev/test, derive a stable key from a fixed seed so tests work without env vars
  return Buffer.alloc(32, 0x42)
}

// Serialised format: base64(iv):base64(tag):base64(ciphertext)
export function encryptToken(plaintext: string): string {
  const key = loadMasterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted token format')
  const [ivB64, tagB64, ctB64] = parts
  const key = loadMasterKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ct = Buffer.from(ctB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && npx vitest run src/services/broker-crypto.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/broker-crypto.ts server/src/services/broker-crypto.test.ts
git commit -m "feat: add broker token AES-256-GCM encryption utility"
```

---

## Task 2: Broker Connection Service

**Files:**
- Create: `server/src/services/broker-connections.ts`
- Create: `server/src/services/broker-connections.test.ts`

This service does CRUD on the `broker_connections` Drizzle table. Tokens are always encrypted before writes and decrypted only on explicit token-fetch calls. The service never returns raw tokens in list responses.

- [ ] **Step 1: Write failing tests**

```typescript
// server/src/services/broker-connections.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBrokerConnectionService } from './broker-connections.js'

// Minimal mock DB
function makeDb(rows: any[] = []) {
  const store: any[] = [...rows]
  return {
    _store: store,
    insert: () => ({ values: (v: any) => ({ returning: () => Promise.resolve([{ id: 'new-id', ...v }]) }) }),
    select: () => ({ from: () => ({ where: () => Promise.resolve(store) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve(store.slice(0, 1)) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  } as any
}

describe('BrokerConnectionService', () => {
  it('saveConnection returns an id', async () => {
    const svc = createBrokerConnectionService(makeDb())
    const result = await svc.saveConnection({
      companyId: 'company-1',
      broker: 'schwab',
      accessToken: 'token-abc',
      refreshToken: 'refresh-xyz',
      tokenExpiresAt: new Date('2027-01-01'),
    })
    expect(result.id).toBe('new-id')
  })

  it('listConnections returns connections without tokens', async () => {
    const db = makeDb([
      { id: 'c1', companyId: 'company-1', broker: 'schwab', accessTokenEncrypted: 'enc', active: true, createdAt: new Date() }
    ])
    const svc = createBrokerConnectionService(db)
    const list = await svc.listConnections('company-1')
    expect(list[0]).not.toHaveProperty('accessTokenEncrypted')
    expect(list[0]).not.toHaveProperty('refreshTokenEncrypted')
    expect(list[0].broker).toBe('schwab')
  })

  it('getDecryptedTokens returns access and refresh tokens', async () => {
    const { encryptToken } = await import('./broker-crypto.js')
    const db = makeDb([
      { id: 'c1', companyId: 'company-1', broker: 'schwab', accessTokenEncrypted: encryptToken('my-access'), refreshTokenEncrypted: encryptToken('my-refresh'), active: true }
    ])
    const svc = createBrokerConnectionService(db)
    const tokens = await svc.getDecryptedTokens('company-1', 'c1')
    expect(tokens?.accessToken).toBe('my-access')
    expect(tokens?.refreshToken).toBe('my-refresh')
  })

  it('deactivateConnection marks active false', async () => {
    const svc = createBrokerConnectionService(makeDb())
    await expect(svc.deactivateConnection('company-1', 'c1')).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && npx vitest run src/services/broker-connections.test.ts
```

Expected: FAIL with "Cannot find module './broker-connections.js'"

- [ ] **Step 3: Implement broker-connections.ts**

```typescript
// server/src/services/broker-connections.ts
import { eq, and } from 'drizzle-orm'
import { brokerConnections } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { encryptToken, decryptToken } from './broker-crypto.js'

export interface SaveConnectionInput {
  companyId: string
  broker: string
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: Date
}

export interface ConnectionSummary {
  id: string
  companyId: string
  broker: string
  active: boolean
  lastSyncedAt: Date | null
  tokenExpiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface DecryptedTokens {
  accessToken: string
  refreshToken: string | null
}

export function createBrokerConnectionService(db: Db) {
  async function saveConnection(input: SaveConnectionInput): Promise<{ id: string }> {
    const rows = await db
      .insert(brokerConnections)
      .values({
        companyId: input.companyId,
        broker: input.broker,
        accessTokenEncrypted: encryptToken(input.accessToken),
        refreshTokenEncrypted: input.refreshToken ? encryptToken(input.refreshToken) : null,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        active: true,
      })
      .returning({ id: brokerConnections.id })
    return rows[0]
  }

  async function listConnections(companyId: string): Promise<ConnectionSummary[]> {
    const rows = await db
      .select({
        id: brokerConnections.id,
        companyId: brokerConnections.companyId,
        broker: brokerConnections.broker,
        active: brokerConnections.active,
        lastSyncedAt: brokerConnections.lastSyncedAt,
        tokenExpiresAt: brokerConnections.tokenExpiresAt,
        createdAt: brokerConnections.createdAt,
        updatedAt: brokerConnections.updatedAt,
      })
      .from(brokerConnections)
      .where(and(eq(brokerConnections.companyId, companyId), eq(brokerConnections.active, true)))
    return rows
  }

  async function getDecryptedTokens(companyId: string, connectionId: string): Promise<DecryptedTokens | null> {
    const rows = await db
      .select({
        accessTokenEncrypted: brokerConnections.accessTokenEncrypted,
        refreshTokenEncrypted: brokerConnections.refreshTokenEncrypted,
      })
      .from(brokerConnections)
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId), eq(brokerConnections.active, true)))
    if (rows.length === 0) return null
    const row = rows[0]
    return {
      accessToken: row.accessTokenEncrypted ? decryptToken(row.accessTokenEncrypted) : '',
      refreshToken: row.refreshTokenEncrypted ? decryptToken(row.refreshTokenEncrypted) : null,
    }
  }

  async function updateTokens(connectionId: string, companyId: string, accessToken: string, refreshToken: string | null, tokenExpiresAt: Date | null): Promise<void> {
    await db
      .update(brokerConnections)
      .set({
        accessTokenEncrypted: encryptToken(accessToken),
        refreshTokenEncrypted: refreshToken ? encryptToken(refreshToken) : null,
        tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId)))
  }

  async function markSynced(connectionId: string, companyId: string): Promise<void> {
    await db
      .update(brokerConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId)))
  }

  async function deactivateConnection(companyId: string, connectionId: string): Promise<void> {
    await db
      .update(brokerConnections)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId)))
  }

  return { saveConnection, listConnections, getDecryptedTokens, updateTokens, markSynced, deactivateConnection }
}

export type BrokerConnectionService = ReturnType<typeof createBrokerConnectionService>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd server && npx vitest run src/services/broker-connections.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/broker-connections.ts server/src/services/broker-connections.test.ts
git commit -m "feat: add broker connection service with encrypted token storage"
```

---

## Task 3: Schwab API Client

**Files:**
- Create: `server/src/services/schwab-client.ts`
- Create: `server/src/services/schwab-client.test.ts`

Wraps the Charles Schwab Individual Trader API. Handles: OAuth token exchange (code → access+refresh), token refresh, and fetching account positions.

Reference: Schwab API base URL is `https://api.schwabapi.com/v1`. OAuth token endpoint: `https://api.schwabapi.com/v1/oauth/token`.

- [ ] **Step 1: Add Schwab env vars to config.ts**

Open `server/src/config.ts`. Find the block where `ALPHA_VANTAGE_API_KEY` is exported (around line 48-55). Add below it:

```typescript
export const SCHWAB_CLIENT_ID = process.env.SCHWAB_CLIENT_ID || undefined
export const SCHWAB_CLIENT_SECRET = process.env.SCHWAB_CLIENT_SECRET || undefined
export const SCHWAB_REDIRECT_URI = process.env.SCHWAB_REDIRECT_URI || 'http://localhost:3100/api/broker/schwab/callback'
```

Also add these to the `Config` interface and `loadConfig()` return object in the same file. Follow the exact pattern used for `alphaVantageApiKey` in that file.

- [ ] **Step 2: Write failing tests**

```typescript
// server/src/services/schwab-client.test.ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd server && npx vitest run src/services/schwab-client.test.ts
```

Expected: FAIL with "Cannot find module './schwab-client.js'"

- [ ] **Step 4: Implement schwab-client.ts**

```typescript
// server/src/services/schwab-client.ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd server && npx vitest run src/services/schwab-client.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/config.ts server/src/services/schwab-client.ts server/src/services/schwab-client.test.ts
git commit -m "feat: add Schwab OAuth client for token exchange and holdings fetch"
```

---

## Task 4: CSV Import Parser

**Files:**
- Create: `server/src/services/csv-portfolio-parser.ts`
- Create: `server/src/services/csv-portfolio-parser.test.ts`

Parses a CSV exported from any major brokerage. The minimum expected columns are `Symbol`, `Quantity`, and optionally `Average Cost Basis`, `Market Value`. Column matching is case-insensitive and trims whitespace. Returns `PortfolioHolding[]` (reusing the same shape from `schwab-client.ts` but with `broker: 'csv'`).

Install `papaparse` in the server package:

```bash
cd "/Users/Samster/stockpilot ai" && pnpm add --filter server papaparse
pnpm add --filter server -D @types/papaparse
```

- [ ] **Step 1: Install papaparse**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm add --filter server papaparse && pnpm add --filter server -D @types/papaparse
```

- [ ] **Step 2: Write failing tests**

```typescript
// server/src/services/csv-portfolio-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseCsvPortfolio } from './csv-portfolio-parser.js'

const BASIC_CSV = `Symbol,Quantity,Average Cost Basis,Market Value
AAPL,10,150.00,1750.00
MSFT,5,280.00,1450.00`

const SCHWAB_EXPORT_CSV = `"Symbol","Description","Quantity","Price","Price Change %","Price Change $","Market Value","Day Change %","Day Change $","Cost Basis","Gain/Loss %","Gain/Loss $","Ratings","Reinvest Dividends?","Capital Gains?","% Of Account","Security Type"
"AAPL","Apple Inc","10","175.00","0.5%","$0.88","$1750.00","0.5%","$8.75","$1500.00","16.67%","$250.00","","Yes","Yes","25%","Common Stocks"
"MSFT","Microsoft Corp","5","290.00","","","$1450.00","","","$1400.00","","","","","","","Common Stocks"`

describe('parseCsvPortfolio', () => {
  it('parses minimal CSV with Symbol, Quantity, Average Cost Basis', () => {
    const holdings = parseCsvPortfolio(BASIC_CSV)
    expect(holdings).toHaveLength(2)
    expect(holdings[0].ticker).toBe('AAPL')
    expect(holdings[0].quantity).toBe(10)
    expect(holdings[0].averageCost).toBe(150.00)
    expect(holdings[0].marketValue).toBe(1750.00)
    expect(holdings[0].broker).toBe('csv')
  })

  it('parses Schwab export format with quoted fields', () => {
    const holdings = parseCsvPortfolio(SCHWAB_EXPORT_CSV)
    expect(holdings.find(h => h.ticker === 'AAPL')).toBeDefined()
    expect(holdings.find(h => h.ticker === 'MSFT')).toBeDefined()
  })

  it('skips rows with no ticker or zero quantity', () => {
    const csv = `Symbol,Quantity\n,10\nAAPL,0\nMSFT,5`
    const holdings = parseCsvPortfolio(csv)
    expect(holdings).toHaveLength(1)
    expect(holdings[0].ticker).toBe('MSFT')
  })

  it('strips dollar signs and commas from numeric fields', () => {
    const csv = `Symbol,Quantity,Market Value\nAAPL,10,"$1,750.00"`
    const holdings = parseCsvPortfolio(csv)
    expect(holdings[0].marketValue).toBe(1750.00)
  })

  it('throws on empty CSV', () => {
    expect(() => parseCsvPortfolio('')).toThrow('CSV is empty or has no data rows')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd server && npx vitest run src/services/csv-portfolio-parser.test.ts
```

Expected: FAIL with "Cannot find module './csv-portfolio-parser.js'"

- [ ] **Step 4: Implement csv-portfolio-parser.ts**

```typescript
// server/src/services/csv-portfolio-parser.ts
import Papa from 'papaparse'
import type { PortfolioHolding } from './schwab-client.js'

type CsvHolding = Omit<PortfolioHolding, 'broker'> & { broker: 'csv' }

function parseNum(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 0
  const cleaned = String(value).replace(/[$,%]/g, '').replace(/,/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function findColumn(headers: string[], ...candidates: string[]): string | undefined {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase())
    if (idx !== -1) return headers[idx]
  }
  return undefined
}

export function parseCsvPortfolio(csv: string): CsvHolding[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const rows = result.data
  if (rows.length === 0) throw new Error('CSV is empty or has no data rows')

  const headers = Object.keys(rows[0])
  const symbolCol = findColumn(headers, 'symbol', 'ticker', 'stock')
  const qtyCol = findColumn(headers, 'quantity', 'qty', 'shares')
  const costCol = findColumn(headers, 'average cost basis', 'average cost', 'cost basis', 'avg cost', 'cost')
  const mvCol = findColumn(headers, 'market value', 'current value', 'value')

  if (!symbolCol || !qtyCol) {
    throw new Error('CSV must have at least Symbol and Quantity columns')
  }

  const holdings: CsvHolding[] = []
  for (const row of rows) {
    const ticker = (row[symbolCol] ?? '').replace(/"/g, '').trim()
    const quantity = parseNum(qtyCol ? row[qtyCol] : 0)
    if (!ticker || quantity === 0) continue
    holdings.push({
      ticker: ticker.toUpperCase(),
      assetType: 'EQUITY',
      quantity,
      averageCost: costCol ? parseNum(row[costCol]) : 0,
      marketValue: mvCol ? parseNum(row[mvCol]) : 0,
      broker: 'csv',
    })
  }
  return holdings
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd server && npx vitest run src/services/csv-portfolio-parser.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/services/csv-portfolio-parser.ts server/src/services/csv-portfolio-parser.test.ts
git commit -m "feat: add CSV portfolio import parser supporting multiple brokerage formats"
```

---

## Task 5: Broker API Routes

**Files:**
- Create: `server/src/routes/broker.ts`
- Create: `server/src/routes/broker.test.ts`

Mounts under `/api/broker`. All routes require board auth (`assertBoard`). OAuth state is stored in a simple in-memory map (keyed by `companyId:state`) — this is sufficient for self-hosted; cloud can extend later. CSV upload uses `multer` (already in the project) with a 5MB limit.

- [ ] **Step 1: Write failing tests**

```typescript
// server/src/routes/broker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Stub the services so we don't need a real DB or Schwab
vi.mock('../services/broker-connections.js', () => ({
  createBrokerConnectionService: () => ({
    listConnections: vi.fn().mockResolvedValue([
      { id: 'conn-1', broker: 'schwab', active: true, lastSyncedAt: null, tokenExpiresAt: null, createdAt: new Date(), updatedAt: new Date() }
    ]),
    saveConnection: vi.fn().mockResolvedValue({ id: 'new-conn' }),
    deactivateConnection: vi.fn().mockResolvedValue(undefined),
    getDecryptedTokens: vi.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref' }),
    markSynced: vi.fn().mockResolvedValue(undefined),
    updateTokens: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../services/schwab-client.js', () => ({
  createSchwabClient: () => ({
    buildAuthUrl: vi.fn().mockReturnValue('https://schwab.auth.url'),
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: 'acc', refreshToken: 'ref', expiresAt: new Date() }),
    getHoldings: vi.fn().mockResolvedValue([{ ticker: 'AAPL', quantity: 10, averageCost: 150, marketValue: 1750, broker: 'schwab', assetType: 'EQUITY' }]),
  }),
}))

vi.mock('../services/csv-portfolio-parser.js', () => ({
  parseCsvPortfolio: vi.fn().mockReturnValue([{ ticker: 'TSLA', quantity: 5, averageCost: 200, marketValue: 1100, broker: 'csv', assetType: 'EQUITY' }]),
}))

import express from 'express'
import request from 'supertest'
import { createBrokerRouter } from './broker.js'

function makeMockDb() { return {} as any }

function makeApp(db = makeMockDb()) {
  const app = express()
  app.use(express.json())
  // Inject a board actor so assertBoard passes
  app.use((req: any, _res, next) => {
    req.actor = { type: 'board', companyIds: ['company-1'], source: 'local_implicit', isInstanceAdmin: false }
    next()
  })
  app.use('/api/broker', createBrokerRouter(db, {
    schwabClientId: 'test-id',
    schwabClientSecret: 'test-secret',
    schwabRedirectUri: 'http://localhost/callback',
  }))
  return app
}

describe('GET /api/broker/connections/:companyId', () => {
  it('returns list of connections', async () => {
    const res = await request(makeApp()).get('/api/broker/connections/company-1')
    expect(res.status).toBe(200)
    expect(res.body[0].broker).toBe('schwab')
  })
})

describe('GET /api/broker/schwab/auth-url', () => {
  it('returns an auth URL', async () => {
    const res = await request(makeApp()).get('/api/broker/schwab/auth-url?companyId=company-1')
    expect(res.status).toBe(200)
    expect(res.body.url).toContain('schwab')
  })
})

describe('DELETE /api/broker/connections/:companyId/:connectionId', () => {
  it('returns 204 on disconnect', async () => {
    const res = await request(makeApp()).delete('/api/broker/connections/company-1/conn-1')
    expect(res.status).toBe(204)
  })
})

describe('GET /api/broker/portfolio/:companyId', () => {
  it('returns merged holdings from all active connections', async () => {
    const res = await request(makeApp()).get('/api/broker/portfolio/company-1')
    expect(res.status).toBe(200)
    expect(res.body).toBeInstanceOf(Array)
  })
})
```

- [ ] **Step 2: Install supertest dev dep if not already present**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm add --filter server -D supertest @types/supertest 2>/dev/null || true
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd server && npx vitest run src/routes/broker.test.ts
```

Expected: FAIL with "Cannot find module './broker.js'"

- [ ] **Step 4: Implement broker.ts**

```typescript
// server/src/routes/broker.ts
import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import multer from 'multer'
import type { Db } from '@paperclipai/db'
import { z } from 'zod'
import { assertBoard, assertCompanyAccess } from './authz.js'
import { createBrokerConnectionService } from '../services/broker-connections.js'
import { createSchwabClient } from '../services/schwab-client.js'
import { parseCsvPortfolio } from '../services/csv-portfolio-parser.js'
import { logger } from '../middleware/logger.js'

interface BrokerRouterConfig {
  schwabClientId?: string
  schwabClientSecret?: string
  schwabRedirectUri?: string
}

// In-memory OAuth state store: "companyId:state" -> expiry timestamp
const oauthStateMap = new Map<string, number>()
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function storeOAuthState(companyId: string, state: string): void {
  oauthStateMap.set(`${companyId}:${state}`, Date.now() + OAUTH_STATE_TTL_MS)
}

function validateAndConsumeOAuthState(companyId: string, state: string): boolean {
  const key = `${companyId}:${state}`
  const expiry = oauthStateMap.get(key)
  if (!expiry || Date.now() > expiry) return false
  oauthStateMap.delete(key)
  return true
}

export function createBrokerRouter(db: Db, config: BrokerRouterConfig = {}): Router {
  const router = Router()
  const connSvc = createBrokerConnectionService(db)

  const schwabClient = config.schwabClientId && config.schwabClientSecret
    ? createSchwabClient({
        clientId: config.schwabClientId,
        clientSecret: config.schwabClientSecret,
        redirectUri: config.schwabRedirectUri ?? 'http://localhost:3100/api/broker/schwab/callback',
      })
    : null

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

  // All routes require board access
  router.use((req, res, next) => {
    try {
      assertBoard(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  // List active broker connections for a company (no tokens returned)
  router.get('/connections/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const connections = await connSvc.listConnections(companyId)
    res.json(connections)
  })

  // Disconnect (soft-delete) a broker connection
  router.delete('/connections/:companyId/:connectionId', async (req, res) => {
    const { companyId, connectionId } = req.params
    assertCompanyAccess(req, companyId)
    await connSvc.deactivateConnection(companyId, connectionId)
    res.status(204).end()
  })

  // Start Schwab OAuth: returns a redirect URL for the user to open
  router.get('/schwab/auth-url', (req, res) => {
    const companyId = String(req.query.companyId ?? '')
    if (!companyId) return res.status(400).json({ error: 'companyId query param required' })
    assertCompanyAccess(req, companyId)
    if (!schwabClient) return res.status(503).json({ error: 'Schwab integration not configured (missing SCHWAB_CLIENT_ID / SCHWAB_CLIENT_SECRET)' })
    const state = randomBytes(16).toString('base64url')
    storeOAuthState(companyId, state)
    const url = schwabClient.buildAuthUrl(state)
    return res.json({ url })
  })

  // Schwab OAuth callback — Schwab redirects here with code + state
  router.get('/schwab/callback', async (req, res) => {
    const code = String(req.query.code ?? '')
    const state = String(req.query.state ?? '')
    const companyId = String(req.query.companyId ?? '')

    if (!code || !state || !companyId) {
      return res.status(400).json({ error: 'Missing code, state, or companyId' })
    }
    if (!schwabClient) {
      return res.status(503).json({ error: 'Schwab integration not configured' })
    }
    if (!validateAndConsumeOAuthState(companyId, state)) {
      return res.status(400).json({ error: 'Invalid or expired OAuth state' })
    }

    try {
      const tokens = await schwabClient.exchangeCode(code)
      await connSvc.saveConnection({
        companyId,
        broker: 'schwab',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
      })
      // Redirect to UI — UI will detect the new connection
      return res.redirect(`/portfolio?connected=schwab`)
    } catch (err) {
      logger.error({ err }, 'Schwab OAuth callback failed')
      return res.status(502).json({ error: 'Failed to complete Schwab OAuth' })
    }
  })

  // Get merged portfolio holdings from all active broker connections
  router.get('/portfolio/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const connections = await connSvc.listConnections(companyId)
    const allHoldings: object[] = []

    for (const conn of connections) {
      try {
        if (conn.broker === 'schwab' && schwabClient) {
          const tokens = await connSvc.getDecryptedTokens(companyId, conn.id)
          if (!tokens) continue
          const holdings = await schwabClient.getHoldings(tokens.accessToken)
          allHoldings.push(...holdings)
          await connSvc.markSynced(conn.id, companyId)
        }
      } catch (err) {
        logger.warn({ err, broker: conn.broker, connectionId: conn.id }, 'Failed to fetch holdings for connection')
      }
    }

    res.json(allHoldings)
  })

  // Upload a CSV brokerage export
  router.post('/portfolio/:companyId/csv-import', upload.single('file'), async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    if (!req.file) return res.status(400).json({ error: 'No file uploaded. Send a multipart/form-data request with field "file".' })
    try {
      const csv = req.file.buffer.toString('utf-8')
      const holdings = parseCsvPortfolio(csv)
      res.json({ holdings, count: holdings.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse CSV'
      return res.status(422).json({ error: message })
    }
  })

  return router
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd server && npx vitest run src/routes/broker.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/broker.ts server/src/routes/broker.test.ts
git commit -m "feat: add broker connection routes (Schwab OAuth, CSV import, portfolio)"
```

---

## Task 6: Mount Broker Router in App

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/config.ts` (if Schwab vars aren't already passed through `loadConfig`)

- [ ] **Step 1: Verify Schwab vars are in loadConfig**

Open `server/src/config.ts`. Find the `loadConfig()` function and verify the return object includes `schwabClientId`, `schwabClientSecret`, `schwabRedirectUri`. They should have been added in Task 3 Step 1. If not, add them now following the pattern of `alphaVantageApiKey`.

The `Config` interface should have:
```typescript
schwabClientId?: string
schwabClientSecret?: string
schwabRedirectUri: string
```

And `loadConfig()` should return:
```typescript
schwabClientId: SCHWAB_CLIENT_ID,
schwabClientSecret: SCHWAB_CLIENT_SECRET,
schwabRedirectUri: SCHWAB_REDIRECT_URI,
```

- [ ] **Step 2: Mount the broker router in app.ts**

Open `server/src/app.ts`. Find the line that reads:

```typescript
import { createMarketRouter } from "./routes/market.js";
```

Add directly below it:

```typescript
import { createBrokerRouter } from "./routes/broker.js";
```

Then find the block that mounts the market router (search for `app.use('/market'` or `createMarketRouter`). It should look like:

```typescript
app.use('/market', createMarketRouter({ alphaVantageApiKey: config.alphaVantageApiKey, polygonApiKey: config.polygonApiKey }))
```

Add directly after it:

```typescript
app.use('/broker', createBrokerRouter(db, {
  schwabClientId: config.schwabClientId,
  schwabClientSecret: config.schwabClientSecret,
  schwabRedirectUri: config.schwabRedirectUri,
}))
```

- [ ] **Step 3: Run typecheck**

```bash
cd "/Users/Samster/stockpilot ai" && pnpm typecheck
```

Expected: no errors

- [ ] **Step 4: Run all new tests**

```bash
cd server && npx vitest run src/services/broker-crypto.test.ts src/services/broker-connections.test.ts src/services/schwab-client.test.ts src/services/csv-portfolio-parser.test.ts src/routes/broker.test.ts
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/app.ts server/src/config.ts
git commit -m "feat: mount broker router — Schwab OAuth and portfolio API live at /api/broker"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Read-only broker connections | Task 5 — `GET /api/broker/portfolio/:companyId` |
| Schwab Official OAuth | Task 3 + Task 5 (`/auth-url`, `/callback`) |
| Manual CSV import | Task 4 + Task 5 (`/csv-import`) |
| Credentials encrypted at rest | Task 1 + Task 2 (AES-256-GCM, master key reuse) |
| Holdings: ticker, qty, cost, value | `PortfolioHolding` shape in `schwab-client.ts` + CSV parser |
| No trade execution | No write endpoints to any broker API |
| Robinhood | Deferred — no maintained Node.js library exists |
| Yahoo Finance manual | Deferred to Plan 5 UI — agents use market-data package for prices |

**Placeholder scan:** No TBDs, TODOs, or vague steps found.

**Type consistency:** `PortfolioHolding` defined in `schwab-client.ts`, imported by `csv-portfolio-parser.ts` and used in route responses — consistent throughout.
