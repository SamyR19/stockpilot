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
