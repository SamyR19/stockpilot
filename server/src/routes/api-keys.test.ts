import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createApiKeysRouter } from './api-keys.js'

const COMPANY = '11111111-1111-1111-1111-111111111111'
const secrets = {
  setSecret: vi.fn(async () => ({ id: 's1' })),
  deleteSecretByName: vi.fn(async () => true),
  listKeyNames: vi.fn(async () => ['ai.anthropic']),
}
const subscription = { setStatus: vi.fn(async () => {}) }

function app() {
  const a = express()
  a.use(express.json())
  a.use((req, _res, next) => {
    ;(req as any).actor = { type: 'board', source: 'local_implicit' }
    next()
  })
  a.use('/api/api-keys', createApiKeysRouter({ secrets: secrets as any, subscription: subscription as any, isCloudMode: true }))
  return a
}

describe('api-keys router', () => {
  beforeEach(() => vi.clearAllMocks())
  it('rejects unknown key kind', async () => {
    const res = await request(app()).post(`/api/api-keys/${COMPANY}`).send({ kind: 'bogus', provider: 'x', value: 'k' })
    expect(res.status).toBe(400)
  })
  it('stores an AI key', async () => {
    const res = await request(app()).post(`/api/api-keys/${COMPANY}`).send({ kind: 'ai', provider: 'anthropic', value: 'sk-test' })
    expect(res.status).toBe(201)
    expect(secrets.setSecret).toHaveBeenCalled()
  })
  it('storing a data key flips the company to keys tier in cloud mode', async () => {
    const res = await request(app()).post(`/api/api-keys/${COMPANY}`).send({ kind: 'data', provider: 'alpha_vantage', value: 'av-test' })
    expect(res.status).toBe(201)
    expect(subscription.setStatus).toHaveBeenCalledWith(COMPANY, 'keys')
  })
  it('lists only ai./data. key names', async () => {
    const res = await request(app()).get(`/api/api-keys/${COMPANY}`)
    expect(res.status).toBe(200)
    expect(res.body.keys).toContain('ai.anthropic')
  })
})
