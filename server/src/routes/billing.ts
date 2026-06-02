import { Router } from 'express'
import type { SubscriptionStatus } from '@stockpilotai/feature-flags'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'
import { getStripe } from '../services/stripe-client.js'
import { logger } from '../middleware/logger.js'
import type { SubscriptionService } from '../services/subscription.js'
import type { RunLimitService } from '../services/run-limit.js'

export function mapStripeStatusToSubscription(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return null
  }
}

interface BillingDeps {
  subscription: SubscriptionService
  runLimit: RunLimitService
  config: {
    stripeSecretKey?: string
    stripeWebhookSecret?: string
    stripePriceId?: string
    appBaseUrl: string
    isCloudMode: boolean
  }
}

export function createBillingRouter(deps: BillingDeps): Router {
  const router = Router()

  // Stripe webhook FIRST — needs the raw request body (not JSON-parsed) so the
  // signature can be verified, and no auth (Stripe calls it unauthenticated).
  // Raw body is preserved by an express.raw() registration for this path in app.ts, BEFORE the global express.json(); required for Stripe signature verification.
  router.post('/webhook', async (req, res) => {
    if (!deps.config.stripeWebhookSecret) {
      return res.status(503).json({ error: 'Stripe webhook not configured' })
    }
    const sig = req.headers['stripe-signature']
    if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' })
    const stripe = getStripe(deps.config.stripeSecretKey)
    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig as string,
        deps.config.stripeWebhookSecret,
      )
    } catch (err) {
      logger.warn({ err }, 'Stripe webhook signature verification failed')
      return res.status(400).json({ error: 'Invalid signature' })
    }
    if (
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as {
        id: string
        status: string
        customer: string | { id: string }
        current_period_end?: number
        metadata?: { companyId?: string }
      }
      const companyId = sub.metadata?.companyId
      const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : undefined
      const currentPeriodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null
      const mapped = mapStripeStatusToSubscription(sub.status)
      if (companyId) {
        if (mapped === null) {
          logger.warn(
            { subscriptionId: sub.id, stripeStatus: sub.status, companyId },
            'Unmapped Stripe subscription status; skipping status write',
          )
        } else {
          await deps.subscription.setStatus(companyId, mapped, {
            stripeSubscriptionId: sub.id,
            stripeCustomerId,
            currentPeriodEnd,
          })
          logger.info(
            { companyId, subscriptionId: sub.id, status: mapped, eventType: event.type },
            'Updated subscription from Stripe webhook',
          )
        }
      } else {
        logger.warn(
          { subscriptionId: sub.id },
          'Stripe subscription event missing companyId metadata',
        )
      }
    }
    return res.json({ received: true })
  })

  // Authenticated endpoints below.
  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  router.get('/:companyId/status', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const tier = await deps.subscription.tierForCompany(companyId)
    const used = await deps.runLimit.monthlyRunCount(companyId)
    const row = await deps.subscription.getForCompany(companyId)
    return res.json({
      tier,
      isCloudMode: deps.config.isCloudMode,
      monthlyRunsUsed: used,
      status: row?.status ?? 'free',
      currentPeriodEnd: row?.currentPeriodEnd ?? null,
    })
  })

  router.post('/:companyId/checkout', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    if (!deps.config.isCloudMode) {
      return res.status(400).json({ error: 'Billing is only available in cloud mode' })
    }
    if (!deps.config.stripePriceId) {
      return res.status(503).json({ error: 'Stripe price not configured' })
    }
    const existing = await deps.subscription.getForCompany(companyId)
    if (existing?.status === 'active') {
      return res.status(409).json({
        error:
          'This workspace already has an active subscription. Use the billing portal to manage it.',
      })
    }
    const stripe = getStripe(deps.config.stripeSecretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: deps.config.stripePriceId, quantity: 1 }],
      success_url: `${deps.config.appBaseUrl}/billing?status=success`,
      cancel_url: `${deps.config.appBaseUrl}/billing?status=cancel`,
      subscription_data: { metadata: { companyId } },
      metadata: { companyId },
    })
    return res.json({ url: session.url })
  })

  router.post('/:companyId/portal', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    if (!deps.config.isCloudMode) {
      return res.status(400).json({ error: 'Billing is only available in cloud mode' })
    }
    const row = await deps.subscription.getForCompany(companyId)
    if (!row?.stripeCustomerId) {
      return res.status(404).json({ error: 'No Stripe customer for this workspace' })
    }
    const stripe = getStripe(deps.config.stripeSecretKey)
    let session
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: row.stripeCustomerId,
        return_url: `${deps.config.appBaseUrl}/billing`,
      })
    } catch (err) {
      if (err && typeof err === 'object' && (err as any).type === 'StripeInvalidRequestError') {
        return res.status(404).json({ error: 'Stripe customer not found. Please contact support.' })
      }
      throw err
    }
    return res.json({ url: session.url })
  })

  return router
}
