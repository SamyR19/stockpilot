import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createWatchlistRouter } from './watchlist.js'

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}

const COMPANY_ID = '11111111-1111-1111-1111-111111111111'

function buildApp(companyId: string) {
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.actor = { type: 'board', source: 'local_implicit', companyIds: [companyId], isInstanceAdmin: false }
    next()
  })
  app.use('/api/watchlist', createWatchlistRouter(mockDb as any))
  return app
}

describe('watchlist router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('GET /:companyId returns ticker list', async () => {
    const rows = [{ id: 'abc', ticker: 'AAPL', notes: null, addedAt: new Date().toISOString() }]
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    })
    const res = await request(buildApp(COMPANY_ID))
      .get(`/api/watchlist/${COMPANY_ID}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].ticker).toBe('AAPL')
  })

  it('POST /:companyId adds ticker', async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'new-id', ticker: 'MSFT', notes: null, addedAt: new Date().toISOString() }]),
      }),
    })
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/watchlist/${COMPANY_ID}`)
      .send({ ticker: 'MSFT' })
    expect(res.status).toBe(201)
    expect(res.body.ticker).toBe('MSFT')
  })

  it('DELETE /:companyId/:ticker removes ticker', async () => {
    mockDb.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    })
    const res = await request(buildApp(COMPANY_ID))
      .delete(`/api/watchlist/${COMPANY_ID}/AAPL`)
    expect(res.status).toBe(204)
  })

  it('POST /:companyId rejects invalid ticker', async () => {
    const res = await request(buildApp(COMPANY_ID))
      .post(`/api/watchlist/${COMPANY_ID}`)
      .send({ ticker: 'this is not a ticker!!!' })
    expect(res.status).toBe(400)
  })
})
