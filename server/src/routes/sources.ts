import { Router } from 'express'
import { Types, isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { requireStorePermission } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { syncShopify } from '../lib/shopifySync.js'
import { SourceItem } from '../models/index.js'

// Mounted at /api/stores/:storeId/sources
export const sourcesRouter = Router({ mergeParams: true })

const KINDS = ['product', 'collection', 'page'] as const

const listQuery = z.object({
  kind: z.enum(KINDS).optional(),
  q: z.string().trim().max(100).optional(),
  // "usable" = active and in stock (what auto-drafting will pick from)
  filter: z.enum(['all', 'usable', 'out_of_stock', 'draft', 'manual']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

sourcesRouter.get('/', requireStorePermission('store.view'), async (req, res) => {
  const { kind, q, filter, page, limit } = listQuery.parse(req.query)
  if (!isValidObjectId(req.params.storeId)) throw new HttpError(400, 'Invalid store id')
  const storeObjectId = new Types.ObjectId(req.params.storeId as string)
  const where: Record<string, unknown> = { store: req.params.storeId }
  if (kind) where.kind = kind
  if (q) where.title = { $regex: escapeRegex(q), $options: 'i' }
  if (filter === 'usable') Object.assign(where, { inStock: true, shopifyStatus: { $in: ['active', null] } })
  if (filter === 'out_of_stock') where.inStock = false
  if (filter === 'draft') where.shopifyStatus = { $in: ['draft', 'archived'] }
  if (filter === 'manual') where.origin = 'manual'

  const [items, total, counts] = await Promise.all([
    SourceItem.find(where)
      .sort({ title: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    SourceItem.countDocuments(where),
    SourceItem.aggregate<{ _id: string; n: number }>([
      { $match: { store: storeObjectId } },
      { $group: { _id: '$kind', n: { $sum: 1 } } },
    ]),
  ])
  res.json({
    items,
    total,
    page,
    limit,
    counts: Object.fromEntries(KINDS.map((k) => [k, counts.find((c) => c._id === k)?.n ?? 0])),
  })
})

// Editors need fresh data to create posts, so sync is allowed with post.create (not only store.manage).
sourcesRouter.post('/sync', requireStorePermission('post.create'), async (req, res) => {
  res.json(await syncShopify(req.params.storeId as string))
})

const manualInput = z.object({
  kind: z.enum(KINDS),
  title: z.string().trim().min(1).max(200),
  url: z.url(),
  description: z.string().trim().max(5000).optional(),
  imageUrls: z.array(z.url()).max(10).optional(),
  price: z.string().trim().max(50).optional(),
})

/** For items not on Shopify (or when a store has no Shopify connection). */
sourcesRouter.post('/', requireStorePermission('post.create'), async (req, res) => {
  const input = manualInput.parse(req.body)
  const item = await SourceItem.create({ ...input, store: req.params.storeId as string, origin: 'manual', shopifyStatus: 'active' })
  res.status(201).json(item.toObject())
})

// Only manual items can be deleted; Shopify items would come back on the next sync.
sourcesRouter.delete('/:itemId', requireStorePermission('post.create'), async (req, res) => {
  const item = await SourceItem.findOne({ _id: req.params.itemId as string, store: req.params.storeId as string })
  if (!item) throw new HttpError(404, 'Item not found')
  if (item.origin !== 'manual') throw new HttpError(400, 'Shopify items Shopify me hi delete karo; agle sync me hat jayenge.')
  await item.deleteOne()
  res.status(204).end()
})
