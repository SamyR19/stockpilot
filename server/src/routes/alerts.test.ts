import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createAlertsRouter } from './alerts.js'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
}
const COMPANY_ID = '22222222-2222-2222-2222-222222222222'

function buildApp(companyId: string) {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.actor = { type: 'board', source: 'local_implicit', companyIds: [companyId], isInstanceAdmin: false }
    next()
  })
  app.use('/api/alerts', createAlertsRouter(mockDb as any))
  return app
}

describe('alerts router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET /:companyId returns alert rules', async () => {
    const rows = [{ id: 'r1', ticker: 'AAPL', conditionType: 'price_above', threshold: '200', active: true, createdAt: new Date().toISOString() }]
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(rows) }) })
    const res = await request(buildApp(COMPANY_ID)).get(`/api/alerts/${COMPANY_ID}`)
    expect(res.status).toBe(200)
    expect(res.body[0].conditionType).toBe('price_above')
  })

  it('POST /:companyId creates alert rule', async () => {
    const row = { id: 'new', ticker: 'TSLA', conditionType: 'price_below', threshold: '100', active: true, createdAt: new Date().toISOString() }
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }) })
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/alerts/${COMPANY_ID}`)
      .send({ ticker: 'TSLA', conditionType: 'price_below', threshold: '100' })
    expect(res.status).toBe(201)
    expect(res.body.ticker).toBe('TSLA')
  })

  it('POST /:companyId rejects invalid conditionType', async () => {
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/alerts/${COMPANY_ID}`)
      .send({ ticker: 'AAPL', conditionType: 'invalid_type' })
    expect(res.status).toBe(400)
  })

  it('DELETE /:companyId/:alertId deletes rule', async () => {
    mockDb.delete.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) })
    const res = await request(buildApp(COMPANY_ID)).delete(`/api/alerts/${COMPANY_ID}/some-id`)
    expect(res.status).toBe(204)
  })
})
