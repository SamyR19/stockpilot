import Stripe from 'stripe'

let cached: Stripe | null = null

export function getStripe(secretKey: string | undefined): Stripe {
  if (!secretKey) {
    const err = new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)') as Error & { statusCode?: number }
    err.statusCode = 503
    throw err
  }
  if (!cached) {
    cached = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' })
  }
  return cached
}
