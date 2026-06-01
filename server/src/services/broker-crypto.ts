import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Reuse the same master key used by the secrets subsystem.
// Key must be 32 bytes: set PAPERCLIP_SECRETS_MASTER_KEY as 64-char hex or base64.
function loadMasterKey(): Buffer {
  const raw = process.env.PAPERCLIP_SECRETS_MASTER_KEY
  if (raw && raw.trim().length > 0) {
    const trimmed = raw.trim()
    if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex')
    try {
      const decoded = Buffer.from(trimmed, 'base64')
      if (decoded.length === 32) return decoded
    } catch {
      // not valid base64, fall through
    }
    if (Buffer.byteLength(trimmed, 'utf8') === 32) return Buffer.from(trimmed, 'utf8')
    // env var was set but didn't decode to 32 bytes — throw rather than silently using dev key
    throw new Error(
      'Invalid PAPERCLIP_SECRETS_MASTER_KEY for broker tokens (expected 32-byte base64, 64-char hex, or raw 32-char string)',
    )
  }
  // No key configured — use stable dev/test key (zero env var = intentional dev mode)
  return Buffer.alloc(32, 0x42)
}

// Serialised format: base64(iv):base64(tag):base64(ciphertext)
export function encryptToken(plaintext: string): string {
  const key = loadMasterKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(':')
  if (parts.length !== 3 || parts[0].length === 0 || parts[1].length === 0) {
    throw new Error('Invalid encrypted token format')
  }
  const [ivB64, tagB64, ctB64] = parts
  const key = loadMasterKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ct = Buffer.from(ctB64, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
