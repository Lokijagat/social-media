import { Router } from 'express'
import { z } from 'zod'
import { encrypt, maskSecret, stripSecrets } from '../lib/crypto.js'
import { requireStorePermission, requireSuperAdmin } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { testShopifyConnection } from '../lib/shopify.js'
import { AI_KEY_PROVIDERS, BrandKit, CONTENT_PROVIDERS, IMAGE_PROVIDERS, LANGUAGES, Store, VERIFY_PROVIDERS } from '../models/index.js'

// Mounted after requireAuth, so req.user is always set.
export const storesRouter = Router()

const toSecret = (plain: string) => ({ enc: encrypt(plain), mask: maskSecret(plain), updatedAt: new Date() })

const storeInput = z.object({
  name: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Only lowercase letters, numbers and dashes'),
  timezone: z.string().optional(),
  defaultLanguage: z.enum(LANGUAGES).optional(),
  active: z.boolean().optional(),
  shopify: z
    .object({
      domain: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9-]+\.myshopify\.com$/, 'Format: yourstore.myshopify.com')
        .optional(),
      storefrontUrl: z.url().optional(),
      clientId: z.string().trim().min(1).optional(),
      clientSecret: z.string().trim().min(1).optional(), // plain text in, encrypted at rest
      accessToken: z.string().trim().min(1).optional(), // legacy shpat_ token
    })
    .optional(),
  meta: z
    .object({
      facebookPageId: z.string().optional(),
      instagramBusinessId: z.string().optional(),
      accessToken: z.string().min(1).optional(),
      tokenExpiresAt: z.coerce.date().optional(),
    })
    .optional(),
  ai: z
    .object({
      content: z.object({ provider: z.enum(CONTENT_PROVIDERS), model: z.string().optional() }).optional(),
      image: z.object({ provider: z.enum(IMAGE_PROVIDERS), model: z.string().optional() }).optional(),
      verify: z.object({ provider: z.enum(VERIFY_PROVIDERS), model: z.string().optional() }).optional(),
      keys: z.partialRecord(z.enum(AI_KEY_PROVIDERS), z.string().min(1)).optional(),
    })
    .optional(),
  budget: z
    .object({
      monthlyLimitUsd: z.number().min(0).optional(),
      postsPerWeekTarget: z.number().int().min(0).optional(),
    })
    .optional(),
})

type StoreInput = z.infer<typeof storeInput>

/** Converts validated input into a Mongo `$set` with dotted paths, encrypting any secrets. */
function toUpdate(input: Partial<StoreInput>): Record<string, unknown> {
  const set: Record<string, unknown> = {}
  const { shopify, meta, ai, budget, ...top } = input
  Object.assign(set, top)

  for (const [k, v] of Object.entries(shopify ?? {})) {
    if (v !== undefined) set[`shopify.${k}`] = k === 'accessToken' || k === 'clientSecret' ? toSecret(v as string) : v
  }
  for (const [k, v] of Object.entries(meta ?? {})) {
    if (v !== undefined) set[`meta.${k}`] = k === 'accessToken' ? toSecret(v as string) : v
  }
  if (ai) {
    const { keys, ...choices } = ai
    for (const [k, v] of Object.entries(choices)) if (v) set[`ai.${k}`] = v
    for (const [provider, key] of Object.entries(keys ?? {})) if (key) set[`ai.keys.${provider}`] = toSecret(key)
  }
  for (const [k, v] of Object.entries(budget ?? {})) if (v !== undefined) set[`budget.${k}`] = v
  return set
}

/** Super admin sees every store; everyone else only the stores they are a member of. */
storesRouter.get('/', async (req, res) => {
  const user = req.user!
  const filter = user.isSuperAdmin ? {} : { _id: { $in: user.memberships.map((m) => m.store) } }
  const stores = await Store.find(filter).sort({ name: 1 }).lean()
  res.json(stripSecrets(stores))
})

// New client stores are created by the platform operator only.
storesRouter.post('/', requireSuperAdmin, async (req, res) => {
  const input = storeInput.parse(req.body)
  if (await Store.exists({ slug: input.slug })) throw new HttpError(409, 'Slug already in use')

  const store = new Store({ name: input.name, slug: input.slug })
  store.set(toUpdate(input))
  await store.save()
  await BrandKit.create({ store: store._id })

  res.status(201).json(stripSecrets(await Store.findById(store._id).lean()))
})

storesRouter.get('/:storeId', requireStorePermission('store.view'), async (req, res) => {
  const store = await Store.findById(req.params.storeId).lean()
  if (!store) throw new HttpError(404, 'Store not found')
  res.json(stripSecrets(store))
})

storesRouter.patch('/:storeId', requireStorePermission('store.manage'), async (req, res) => {
  const input = storeInput.partial().parse(req.body)
  const s = input.shopify
  const existing = await Store.findById(req.params.storeId).select('shopify.domain shopify.clientId').lean()
  if (!existing) throw new HttpError(404, 'Store not found')
  // New domain or credentials invalidate the cached Shopify token and the last test result.
  // Secrets are only sent when the user typed a new one, so their presence means "changed".
  const credentialsChanged =
    (s?.domain !== undefined && s.domain !== existing.shopify?.domain) ||
    (s?.clientId !== undefined && s.clientId !== existing.shopify?.clientId) ||
    !!s?.clientSecret ||
    !!s?.accessToken
  const update = {
    $set: toUpdate(input),
    ...(credentialsChanged && {
      $unset: { 'shopify.cachedToken': 1, 'shopify.cachedTokenExpiresAt': 1, 'shopify.scopes': 1, 'shopify.shopName': 1 },
    }),
  }
  const store = await Store.findByIdAndUpdate(req.params.storeId, update, { returnDocument: 'after', runValidators: true }).lean()
  if (!store) throw new HttpError(404, 'Store not found')
  res.json(stripSecrets(store))
})

/** Gets a token and checks shop name + scopes. Saves the result on the store. */
storesRouter.post('/:storeId/shopify/test', requireStorePermission('store.manage'), async (req, res) => {
  res.json(await testShopifyConnection(req.params.storeId as string))
})
