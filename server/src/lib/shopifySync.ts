import { Post, SourceItem, Store } from '../models/index.js'
import { ShopifyError, shopifyGraphql } from './shopify.js'

// Small pages keep each query well under Shopify's 1000-point cost limit (products ask for 5 media each).
const PAGE_SIZE = 50
const MAX_PAGES = 200 // safety stop: 10k items per kind

type PageInfo = { hasNextPage: boolean; endCursor: string | null }
type Connection<T> = { pageInfo: PageInfo; nodes: T[] }

type ShopifyProduct = {
  id: string
  handle: string
  title: string
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' | 'UNLISTED'
  description: string
  tags: string[]
  totalInventory: number | null
  tracksInventory: boolean
  priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } }
  media: { nodes: { image?: { url: string } | null }[] }
}
type ShopifyCollection = { id: string; handle: string; title: string; description: string; image: { url: string } | null }
type ShopifyPage = { id: string; handle: string; title: string; bodySummary: string; isPublished: boolean }

const QUERIES = {
  products: `query($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title status tags totalInventory tracksInventory
        description(truncateAt: 2000)
        priceRangeV2 { minVariantPrice { amount currencyCode } }
        media(first: 5) { nodes { ... on MediaImage { image { url } } } }
      }
    }
  }`,
  collections: `query($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title description(truncateAt: 2000) image { url } }
    }
  }`,
  pages: `query($first: Int!, $after: String) {
    pages(first: $first, after: $after, sortKey: TITLE) {
      pageInfo { hasNextPage endCursor }
      nodes { id handle title bodySummary isPublished }
    }
  }`,
} as const

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** shopifyGraphql with a few retries when Shopify throttles us (cost bucket empty). */
async function query<T>(storeId: string, q: string, variables: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await shopifyGraphql<T>(storeId, q, variables)
    } catch (e) {
      const throttled = e instanceof ShopifyError && /throttl/i.test(e.message)
      if (!throttled || attempt >= 4) throw e
      await sleep(2000 * (attempt + 1))
    }
  }
}

async function fetchAll<T>(storeId: string, key: keyof typeof QUERIES): Promise<T[]> {
  const out: T[] = []
  let after: string | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: Record<string, Connection<T>> = await query(storeId, QUERIES[key], { first: PAGE_SIZE, after })
    const conn = data[key]
    out.push(...conn.nodes)
    if (!conn.pageInfo.hasNextPage) break
    after = conn.pageInfo.endCursor
  }
  return out
}

function formatPrice({ amount, currencyCode }: { amount: string; currencyCode: string }) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return `${amount} ${currencyCode}`
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: currencyCode, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${amount} ${currencyCode}`
  }
}

const running = new Set<string>()

export type SyncResult = {
  products: number
  collections: number
  pages: number
  removed: number
  syncedAt: string
}

/**
 * Pulls products, collections and pages from Shopify into SourceItem (upsert by Shopify ID).
 * Items that disappeared from Shopify are deleted, unless a post already uses them (then marked archived).
 * Manual items are never touched.
 */
export async function syncShopify(storeId: string): Promise<SyncResult> {
  if (running.has(storeId)) throw new ShopifyError('Sync pehle se chal raha hai, thoda ruko.', 409)
  running.add(storeId)
  try {
    const store = await Store.findById(storeId).select('shopify.domain shopify.storefrontUrl').lean()
    if (!store) throw new ShopifyError('Store not found', 404)

    const { shop } = await query<{ shop: { primaryDomain: { url: string } } }>(storeId, '{ shop { primaryDomain { url } } }', {})
    const base = (store.shopify?.storefrontUrl || shop.primaryDomain.url).replace(/\/+$/, '')
    const startedAt = new Date()

    const [products, collections, pages] = await Promise.all([
      fetchAll<ShopifyProduct>(storeId, 'products'),
      fetchAll<ShopifyCollection>(storeId, 'collections'),
      fetchAll<ShopifyPage>(storeId, 'pages'),
    ])

    const upsert = (kind: 'product' | 'collection' | 'page', shopifyId: string, fields: Record<string, unknown>) => ({
      updateOne: {
        filter: { store: storeId, kind, shopifyId },
        update: {
          $set: { ...fields, origin: 'shopify', syncedAt: startedAt },
          $setOnInsert: { store: storeId, kind, shopifyId },
        },
        upsert: true,
      },
    })

    const ops = [
      ...products.map((p) =>
        upsert('product', p.id, {
          handle: p.handle,
          title: p.title,
          url: `${base}/products/${p.handle}`,
          description: p.description,
          imageUrls: p.media.nodes.map((m) => m.image?.url).filter(Boolean),
          price: formatPrice(p.priceRangeV2.minVariantPrice),
          // Not tracked = sold without stock count, treat as available.
          inStock: !p.tracksInventory || (p.totalInventory ?? 0) > 0,
          shopifyStatus: p.status === 'ACTIVE' ? 'active' : p.status === 'ARCHIVED' ? 'archived' : 'draft',
          tags: p.tags,
        }),
      ),
      ...collections.map((c) =>
        upsert('collection', c.id, {
          handle: c.handle,
          title: c.title,
          url: `${base}/collections/${c.handle}`,
          description: c.description,
          imageUrls: c.image ? [c.image.url] : [],
          shopifyStatus: 'active',
        }),
      ),
      ...pages.map((p) =>
        upsert('page', p.id, {
          handle: p.handle,
          title: p.title,
          url: `${base}/pages/${p.handle}`,
          description: p.bodySummary,
          shopifyStatus: p.isPublished ? 'active' : 'draft',
        }),
      ),
    ]
    if (ops.length) await SourceItem.bulkWrite(ops, { ordered: false })

    // Anything from Shopify not seen in this run was deleted there.
    const stale = await SourceItem.find({ store: storeId, origin: 'shopify', syncedAt: { $lt: startedAt } })
      .select('_id')
      .lean()
    let removed = 0
    if (stale.length) {
      const staleIds = stale.map((s) => s._id)
      const used = new Set((await Post.distinct('sourceItem', { sourceItem: { $in: staleIds } })).map(String))
      const unused = staleIds.filter((id) => !used.has(String(id)))
      removed = (await SourceItem.deleteMany({ _id: { $in: unused } })).deletedCount
      if (used.size) {
        await SourceItem.updateMany({ _id: { $in: [...used] } }, { $set: { shopifyStatus: 'archived', inStock: false } })
      }
    }

    await Store.updateOne({ _id: storeId }, { $set: { 'shopify.lastSyncedAt': startedAt } })
    return {
      products: products.length,
      collections: collections.length,
      pages: pages.length,
      removed,
      syncedAt: startedAt.toISOString(),
    }
  } finally {
    running.delete(storeId)
  }
}
