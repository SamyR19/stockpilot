import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createResearchRouter } from './research.js'
import { HttpError } from '../errors.js'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}

const COMPANY_ID = '55555555-5555-5555-5555-555555555555'

function errorHandler(err: any, _req: any, res: any, _next: any) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  return res.status(500).json({ error: 'Internal server error' })
}

function buildApp(companyId: string) {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.actor = { type: 'board', source: 'local_implicit', companyIds: [companyId], isInstanceAdmin: false }
    next()
  })
  app.use('/api/research', createResearchRouter(mockDb as any))
  app.use(errorHandler)
  return app
}

describe('research router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET /:companyId returns report list', async () => {
    const rows = [{ id: 'r1', ticker: 'AAPL', reportType: 'general', content: 'hello', recommendation: null, targetPriceCents: null, issueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
    const limit = vi.fn().mockResolvedValue(rows)
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) })
    const res = await request(buildApp(COMPANY_ID)).get(`/api/research/${COMPANY_ID}`)
    expect(res.status).toBe(200)
    expect(res.body[0].ticker).toBe('AAPL')
  })

  it('GET /:companyId filters by ticker', async () => {
    const rows = [{ id: 'r1', ticker: 'AAPL', reportType: 'general', content: 'hello', recommendation: null, targetPriceCents: null, issueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
    const limit = vi.fn().mockResolvedValue(rows)
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) })
    const res = await request(buildApp(COMPANY_ID)).get(`/api/research/${COMPANY_ID}?ticker=aapl`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('GET /:companyId/:reportId returns one report', async () => {
    const row = { id: 'r1', ticker: 'AAPL', reportType: 'general', content: 'hello', recommendation: null, targetPriceCents: null, issueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const limit = vi.fn().mockResolvedValue([row])
    const where = vi.fn().mockReturnValue({ limit })
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) })
    const res = await request(buildApp(COMPANY_ID)).get(`/api/research/${COMPANY_ID}/r1`)
    expect(res.status).toBe(200)
    expect(res.body.id).toBe('r1')
  })

  it('GET /:companyId/:reportId returns 404 when missing', async () => {
    const limit = vi.fn().mockResolvedValue([])
    const where = vi.fn().mockReturnValue({ limit })
    mockDb.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where }) })
    const res = await request(buildApp(COMPANY_ID)).get(`/api/research/${COMPANY_ID}/missing`)
    expect(res.status).toBe(404)
  })

  it('POST /:companyId creates report', async () => {
    const row = { id: 'new', ticker: 'TSLA', reportType: 'general', content: 'analysis', recommendation: 'buy', targetPriceCents: 30000, issueId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }) })
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/research/${COMPANY_ID}`)
      .send({ ticker: 'tsla', content: 'analysis', recommendation: 'buy', targetPriceCents: 30000 })
    expect(res.status).toBe(201)
    expect(res.body.ticker).toBe('TSLA')
  })

  it('POST /:companyId rejects invalid ticker', async () => {
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/research/${COMPANY_ID}`)
      .send({ ticker: 'not a ticker!!!', content: 'analysis' })
    expect(res.status).toBe(400)
  })

  it('POST /:companyId rejects empty content', async () => {
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/research/${COMPANY_ID}`)
      .send({ ticker: 'AAPL', content: '' })
    expect(res.status).toBe(400)
  })

  it('DELETE /:companyId/:reportId deletes report', async () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 'some-id' }]) }),
    })
    const res = await request(buildApp(COMPANY_ID)).delete(`/api/research/${COMPANY_ID}/some-id`)
    expect(res.status).toBe(204)
  })

  it('DELETE /:companyId/:reportId returns 404 when missing', async () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    })
    const res = await request(buildApp(COMPANY_ID)).delete(`/api/research/${COMPANY_ID}/missing-id`)
    expect(res.status).toBe(404)
  })

  it('GET /:companyId returns 403 for wrong company', async () => {
    const OTHER_ID = '66666666-6666-6666-6666-666666666666'
    const app = express()
    app.use(express.json())
    app.use((req: any, _res, next) => {
      req.actor = { type: 'board', source: 'jwt', companyIds: [OTHER_ID], isInstanceAdmin: false }
      next()
    })
    app.use('/api/research', createResearchRouter(mockDb as any))
    app.use(errorHandler)
    const res = await request(app).get(`/api/research/${COMPANY_ID}`)
    expect(res.status).toBe(403)
  })

  it('GET /:companyId returns 401 when unauthenticated', async () => {
    const app = express()
    app.use(express.json())
    app.use((req: any, _res, next) => {
      req.actor = { type: 'none' }
      next()
    })
    app.use('/api/research', createResearchRouter(mockDb as any))
    app.use(errorHandler)
    const res = await request(app).get(`/api/research/${COMPANY_ID}`)
    expect(res.status).toBe(401)
  })
})
