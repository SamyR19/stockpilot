import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createBillingRouter, mapStripeStatusToSubscription } from './billing.js'
import { HttpError } from '../errors.js'

const COMPANY_ID = '11111111-1111-1111-1111-111111111111'

function errorHandler(err: any, _req: any, res: any, _next: any) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }
  return res.status(500).json({ error: 'Internal server error' })
}

function buildApp(config: any) {
  const subscription = {
    setStatus: async () => {},
    tierForCompany: async () => 'free',
    getForCompany: async () => null,
  }
  const runLimit = { monthlyRunCount: async () => 0 }
  const app = express()
  app.use(express.json())
  app.use((req: any, _res, next) => {
    req.actor = {
      type: 'board',
      source: 'local_implicit',
      companyIds: [COMPANY_ID],
      isInstanceAdmin: false,
    }
    next()
  })
  app.use(
    '/api/billing',
    createBillingRouter({ subscription, runLimit, config } as any),
  )
  app.use(errorHandler)
  return app
}

describe('mapStripeStatusToSubscription', () => {
  it('maps stripe statuses to internal subscription status', () => {
    expect(mapStripeStatusToSubscription('active')).toBe('active')
    expect(mapStripeStatusToSubscription('trialing')).toBe('active')
    expect(mapStripeStatusToSubscription('past_due')).toBe('past_due')
    expect(mapStripeStatusToSubscription('unpaid')).toBe('past_due')
    expect(mapStripeStatusToSubscription('canceled')).toBe('canceled')
    expect(mapStripeStatusToSubscription('incomplete_expired')).toBe('canceled')
    expect(mapStripeStatusToSubscription('something_else')).toBe(null)
  })
})

describe('billing router', () => {
  it('POST /:companyId/checkout returns 400 when not in cloud mode', async () => {
    const app = buildApp({ isCloudMode: false, appBaseUrl: 'http://localhost' })
    const res = await request(app).post(`/api/billing/${COMPANY_ID}/checkout`)
    expect(res.status).toBe(400)
  })

  it('POST /webhook returns 503 when webhook secret is undefined', async () => {
    const app = buildApp({ isCloudMode: true, appBaseUrl: 'http://localhost' })
    const res = await request(app).post('/api/billing/webhook')
    expect(res.status).toBe(503)
  })
})
