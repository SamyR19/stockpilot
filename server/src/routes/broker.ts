import { Router } from 'express'
import { randomBytes } from 'node:crypto'
import multer from 'multer'
import type { Db } from '@paperclipai/db'
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
