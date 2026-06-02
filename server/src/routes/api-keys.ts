import { Router } from 'express'
import { z } from 'zod'
import { assertAuthenticated, assertCompanyAccess } from './authz.js'
import { logger } from '../middleware/logger.js'

const AI_PROVIDERS = ['anthropic', 'openai', 'gemini'] as const
const DATA_PROVIDERS = ['alpha_vantage', 'polygon'] as const

function isValidProvider(kind: 'ai' | 'data', provider: string): boolean {
  return kind === 'ai'
    ? (AI_PROVIDERS as readonly string[]).includes(provider)
    : (DATA_PROVIDERS as readonly string[]).includes(provider)
}

const setKeySchema = z.object({
  kind: z.enum(['ai', 'data']),
  provider: z.string().min(1),
  value: z.string().min(1).max(4096),
})

export interface ApiKeysDeps {
  secrets: {
    setSecret: (companyId: string, name: string, value: string) => Promise<unknown>
    deleteSecretByName: (companyId: string, name: string) => Promise<boolean>
    listKeyNames: (companyId: string) => Promise<string[]>
  }
  subscription: { setStatus: (companyId: string, status: 'keys') => Promise<void> }
  isCloudMode: boolean
}

function keyName(kind: 'ai' | 'data', provider: string): string {
  return `${kind}.${provider}`
}

export function createApiKeysRouter(deps: ApiKeysDeps): Router {
  const router = Router()
  router.use((req, res, next) => {
    try {
      assertAuthenticated(req)
      next()
    } catch (err) {
      next(err)
    }
  })

  router.get('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const names = await deps.secrets.listKeyNames(companyId)
    return res.json({ keys: names.filter((n) => n.startsWith('ai.') || n.startsWith('data.')) })
  })

  router.post('/:companyId', async (req, res) => {
    const { companyId } = req.params
    assertCompanyAccess(req, companyId)
    const parse = setKeySchema.safeParse(req.body)
    if (!parse.success) return res.status(400).json({ error: 'Invalid key payload' })
    const { kind, provider, value } = parse.data
    if (!isValidProvider(kind, provider)) {
      return res.status(400).json({ error: `Unknown ${kind} provider: ${provider}` })
    }
    await deps.secrets.setSecret(companyId, keyName(kind, provider), value)
    if (kind === 'data' && deps.isCloudMode) {
      try {
        await deps.subscription.setStatus(companyId, 'keys')
      } catch (err) {
        // The key was saved successfully; a failure to flip the tier should not
        // turn a successful save into a 5xx. The tier can be reconciled later.
        logger.warn({ companyId, err }, 'failed to set keys tier after saving data key')
      }
    }
    return res.status(201).json({ ok: true })
  })

  router.delete('/:companyId/:kind/:provider', async (req, res) => {
    const { companyId, kind, provider } = req.params
    assertCompanyAccess(req, companyId)
    if (kind !== 'ai' && kind !== 'data') return res.status(400).json({ error: 'Invalid kind' })
    if (!isValidProvider(kind, provider)) {
      return res.status(400).json({ error: `Unknown ${kind} provider: ${provider}` })
    }
    const removed = await deps.secrets.deleteSecretByName(companyId, keyName(kind, provider))
    if (!removed) return res.status(404).json({ error: 'Key not found' })
    return res.status(204).send()
  })

  return router
}
