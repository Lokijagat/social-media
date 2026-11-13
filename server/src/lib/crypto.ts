import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../config/env.js'

const key = Buffer.from(env.ENCRYPTION_KEY, 'base64')

/** AES-256-GCM. Output format: base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'))
  if (!iv || !tag || !data) throw new Error('Malformed encrypted payload')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

/** For showing a secret in the UI without revealing it, e.g. "shpat_••••a1b2". */
export function maskSecret(plain: string): string {
  return plain.length <= 8 ? '••••' : `${plain.slice(0, 6)}••••${plain.slice(-4)}`
}

/** Deep-copies a plain object and drops every `enc` field, so encrypted secrets never leave the server. */
export function stripSecrets<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (k, v) => (k === 'enc' ? undefined : v)))
}
