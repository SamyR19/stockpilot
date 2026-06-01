import { eq, and } from 'drizzle-orm'
import { brokerConnections } from '@paperclipai/db'
import type { Db } from '@paperclipai/db'
import { encryptToken, decryptToken } from './broker-crypto.js'

export interface SaveConnectionInput {
  companyId: string
  broker: string
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: Date
}

export interface ConnectionSummary {
  id: string
  companyId: string
  broker: string
  active: boolean
  lastSyncedAt: Date | null
  tokenExpiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface DecryptedTokens {
  accessToken: string
  refreshToken: string | null
}

export function createBrokerConnectionService(db: Db) {
  async function saveConnection(input: SaveConnectionInput): Promise<{ id: string }> {
    const rows = await db
      .insert(brokerConnections)
      .values({
        companyId: input.companyId,
        broker: input.broker,
        accessTokenEncrypted: encryptToken(input.accessToken),
        refreshTokenEncrypted: input.refreshToken ? encryptToken(input.refreshToken) : null,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        active: true,
      })
      .returning({ id: brokerConnections.id })
    return rows[0]
  }

  async function listConnections(companyId: string): Promise<ConnectionSummary[]> {
    const rows = await db
      .select({
        id: brokerConnections.id,
        companyId: brokerConnections.companyId,
        broker: brokerConnections.broker,
        active: brokerConnections.active,
        lastSyncedAt: brokerConnections.lastSyncedAt,
        tokenExpiresAt: brokerConnections.tokenExpiresAt,
        createdAt: brokerConnections.createdAt,
        updatedAt: brokerConnections.updatedAt,
      })
      .from(brokerConnections)
      .where(and(eq(brokerConnections.companyId, companyId), eq(brokerConnections.active, true)))
    return rows
  }

  async function getDecryptedTokens(companyId: string, connectionId: string): Promise<DecryptedTokens | null> {
    const rows = await db
      .select({
        accessTokenEncrypted: brokerConnections.accessTokenEncrypted,
        refreshTokenEncrypted: brokerConnections.refreshTokenEncrypted,
      })
      .from(brokerConnections)
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId), eq(brokerConnections.active, true)))
    if (rows.length === 0) return null
    const row = rows[0]
    return {
      accessToken: row.accessTokenEncrypted ? decryptToken(row.accessTokenEncrypted) : '',
      refreshToken: row.refreshTokenEncrypted ? decryptToken(row.refreshTokenEncrypted) : null,
    }
  }

  async function updateTokens(connectionId: string, companyId: string, accessToken: string, refreshToken: string | null, tokenExpiresAt: Date | null): Promise<void> {
    await db
      .update(brokerConnections)
      .set({
        accessTokenEncrypted: encryptToken(accessToken),
        refreshTokenEncrypted: refreshToken ? encryptToken(refreshToken) : null,
        tokenExpiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId)))
  }

  async function markSynced(connectionId: string, companyId: string): Promise<void> {
    await db
      .update(brokerConnections)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId)))
  }

  async function deactivateConnection(companyId: string, connectionId: string): Promise<void> {
    await db
      .update(brokerConnections)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(brokerConnections.id, connectionId), eq(brokerConnections.companyId, companyId)))
  }

  return { saveConnection, listConnections, getDecryptedTokens, updateTokens, markSynced, deactivateConnection }
}

export type BrokerConnectionService = ReturnType<typeof createBrokerConnectionService>
