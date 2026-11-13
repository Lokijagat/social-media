import { Store } from '../models/index.js'
import { decrypt, encrypt, maskSecret } from './crypto.js'
import { HttpError } from './http.js'

// Shopify releases API versions quarterly; bump this deliberately and re-test.
export const SHOPIFY_API_VERSION = '2026-10'
export const REQUIRED_SCOPES = ['read_products', 'read_content'] as const

const REFRESH_MARGIN_MS = 5 * 60 * 1000 // get a new token 5 min before expiry
const DEFAULT_TTL_S = 23 * 60 * 60 // used if Shopify doesn't return expires_in

type StoreWithSecrets = {
  _id: unknown
  shopify?: {
    domain?: string | null
    clientId?: string | null
    clientSecret?: { enc?: string | null } | null
    cachedToken?: { enc?: string | null } | null
    cachedTokenExpiresAt?: Date | null
    accessToken?: { enc?: string | null } | null
  } | null
}

export class ShopifyError extends HttpError {
  constructor(message: string, status = 502) {
    super(status, message)
  }
}

function shopDomain(store: StoreWithSecrets): string {
  const domain = store.shopify?.domain
  if (!domain) throw new ShopifyError('Shopify domain set nahi hai (jaise yourstore.myshopify.com)', 400)
  return domain
}

/** Client-credentials grant: Dev Dashboard app credentials -> short-lived Admin API token. */
async function requestToken(domain: string, clientId: string, clientSecret: string) {
  let res: Response
  try {
    res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ShopifyError(`Shopify (${domain}) se connect nahi ho paya. Domain sahi hai?`)
  }

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  if (!res.ok || !body.access_token) {
    const reason = body.error_description || body.error || `HTTP ${res.status}`
    const hint =
      res.status === 400 || res.status === 401
        ? ' Client ID / Secret check karo, aur app is store par installed hai ya nahi.'
        : ''
    throw new ShopifyError(`Shopify ne token nahi diya: ${reason}.${hint}`)
  }
  return { token: body.access_token, expiresIn: body.expires_in ?? DEFAULT_TTL_S }
}

/**
 * Returns a working Admin API token for the store.
 * Prefers Dev Dashboard credentials (cached token, refreshed near expiry); falls back to a legacy shpat_ token.
 */
export async function getShopifyToken(storeId: string, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const store = (await Store.findById(storeId).lean()) as StoreWithSecrets | null
  if (!store) throw new ShopifyError('Store not found', 404)
  const s = store.shopify ?? {}
  const domain = shopDomain(store)

  if (s.clientId && s.clientSecret?.enc) {
    const fresh = s.cachedTokenExpiresAt && s.cachedTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS
    if (!opts.forceRefresh && fresh && s.cachedToken?.enc) return decrypt(s.cachedToken.enc)

    const { token, expiresIn } = await requestToken(domain, s.clientId, decrypt(s.clientSecret.enc))
    await Store.updateOne(
      { _id: store._id },
      {
        $set: {
          'shopify.cachedToken': { enc: encrypt(token), mask: maskSecret(token), updatedAt: new Date() },
          'shopify.cachedTokenExpiresAt': new Date(Date.now() + expiresIn * 1000),
        },
      },
    )
    return token
  }

  if (s.accessToken?.enc) return decrypt(s.accessToken.enc)
  throw new ShopifyError('Shopify credentials set nahi hain. Client ID + Client Secret daalo.', 400)
}

/** Runs an Admin GraphQL query. Retries once with a fresh token if Shopify says the token is invalid. */
export async function shopifyGraphql<T>(storeId: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const store = await Store.findById(storeId).select('shopify.domain').lean()
  if (!store) throw new ShopifyError('Store not found', 404)
  const domain = shopDomain(store as StoreWithSecrets)

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getShopifyToken(storeId, { forceRefresh: attempt > 0 })
    let res: Response
    try {
      res = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      throw new ShopifyError(`Shopify (${domain}) se connect nahi ho paya`)
    }

    if (res.status === 401 && attempt === 0) continue // token expired/revoked early: refresh and retry once
    const body = (await res.json().catch(() => ({}))) as { data?: T; errors?: unknown }
    if (!res.ok) throw new ShopifyError(`Shopify API error: HTTP ${res.status}`)
    if (body.errors) {
      const msg = Array.isArray(body.errors)
        ? body.errors.map((e: { message?: string }) => e.message).join('; ')
        : JSON.stringify(body.errors)
      throw new ShopifyError(`Shopify API error: ${msg}`)
    }
    return body.data as T
  }
  throw new ShopifyError('Shopify ne token reject kar diya. Credentials check karo.')
}

/** Verifies credentials and scopes; stores shop name + granted scopes on the store. */
export async function testShopifyConnection(storeId: string) {
  const data = await shopifyGraphql<{
    shop: { name: string; myshopifyDomain: string; primaryDomain: { url: string } }
    currentAppInstallation: { accessScopes: { handle: string }[] }
  }>(
    storeId,
    `{ shop { name myshopifyDomain primaryDomain { url } }
       currentAppInstallation { accessScopes { handle } } }`,
  )
  const scopes = data.currentAppInstallation.accessScopes.map((s) => s.handle)
  const missingScopes = REQUIRED_SCOPES.filter((s) => !scopes.includes(s))
  await Store.updateOne({ _id: storeId }, { $set: { 'shopify.scopes': scopes, 'shopify.shopName': data.shop.name } })
  return {
    ok: missingScopes.length === 0,
    shopName: data.shop.name,
    myshopifyDomain: data.shop.myshopifyDomain,
    primaryDomain: data.shop.primaryDomain.url,
    scopes,
    missingScopes,
  }
}
