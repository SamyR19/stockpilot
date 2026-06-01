import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBrokerConnectionService } from './broker-connections.js'

// Minimal mock DB
function makeDb(rows: any[] = []) {
  const store: any[] = [...rows]
  return {
    _store: store,
    insert: () => ({ values: (v: any) => ({ returning: () => Promise.resolve([{ id: 'new-id', ...v }]) }) }),
    select: (fields: any) => ({
      from: () => ({
        where: () => {
          if (!fields) return Promise.resolve(store)
          // If fields were specified (an object), pick only those fields from each row
          if (typeof fields === 'object' && !Array.isArray(fields)) {
            return Promise.resolve(store.map((row: any) => {
              const result: any = {}
              for (const key of Object.keys(fields)) {
                result[key] = row[key]
              }
              return result
            }))
          }
          return Promise.resolve(store)
        }
      })
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve(store.slice(0, 1)) }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
  } as any
}

describe('BrokerConnectionService', () => {
  it('saveConnection returns an id', async () => {
    const svc = createBrokerConnectionService(makeDb())
    const result = await svc.saveConnection({
      companyId: 'company-1',
      broker: 'schwab',
      accessToken: 'token-abc',
      refreshToken: 'refresh-xyz',
      tokenExpiresAt: new Date('2027-01-01'),
    })
    expect(result.id).toBe('new-id')
  })

  it('listConnections returns connections without tokens', async () => {
    const db = makeDb([
      { id: 'c1', companyId: 'company-1', broker: 'schwab', accessTokenEncrypted: 'enc', active: true, createdAt: new Date() }
    ])
    const svc = createBrokerConnectionService(db)
    const list = await svc.listConnections('company-1')
    expect(list[0]).not.toHaveProperty('accessTokenEncrypted')
    expect(list[0]).not.toHaveProperty('refreshTokenEncrypted')
    expect(list[0].broker).toBe('schwab')
  })

  it('getDecryptedTokens returns access and refresh tokens', async () => {
    const { encryptToken } = await import('./broker-crypto.js')
    const db = makeDb([
      { id: 'c1', companyId: 'company-1', broker: 'schwab', accessTokenEncrypted: encryptToken('my-access'), refreshTokenEncrypted: encryptToken('my-refresh'), active: true }
    ])
    const svc = createBrokerConnectionService(db)
    const tokens = await svc.getDecryptedTokens('company-1', 'c1')
    expect(tokens?.accessToken).toBe('my-access')
    expect(tokens?.refreshToken).toBe('my-refresh')
  })

  it('deactivateConnection marks active false', async () => {
    const svc = createBrokerConnectionService(makeDb())
    await expect(svc.deactivateConnection('company-1', 'c1')).resolves.not.toThrow()
  })
})
