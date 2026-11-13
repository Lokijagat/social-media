import { Router } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { generateContent, type ContentProvider } from '../lib/ai/content.js'
import { requireStorePermission } from '../lib/auth.js'
import { checkCompliance } from '../lib/compliance.js'
import { decrypt } from '../lib/crypto.js'
import { HttpError } from '../lib/http.js'
import {
  BrandKit,
  CONTENT_PROVIDERS,
  FORMATS,
  LANGUAGES,
  POST_TYPES,
  Post,
  SourceItem,
  Store,
  TARGETS,
  TARGET_KEYS,
  type TargetKey,
} from '../models/index.js'

// Mounted at /api/stores/:storeId/posts
export const postsRouter = Router({ mergeParams: true })

const KEY_FOR_PROVIDER: Record<ContentProvider, 'anthropic' | 'openai' | 'google'> = {
  claude: 'anthropic',
  gpt: 'openai',
  gemini: 'google',
}
// Post types that are about one Shopify item, and which kind of item.
const SOURCE_KIND_FOR_TYPE: Partial<Record<string, string>> = { product: 'product', collection: 'collection', page: 'page' }
const EDITABLE_STATUSES = ['draft', 'needs_review', 'rejected']

const setupInput = z.object({
  type: z.enum(POST_TYPES),
  sourceItemId: z.string().refine(isValidObjectId, 'Invalid item').nullish(),
  festival: z.object({ name: z.string().trim().max(100), date: z.coerce.date().nullish() }).nullish(),
  brief: z.string().trim().max(2000).optional(),
  language: z.enum(LANGUAGES),
  format: z.enum(FORMATS).default('image'),
  targets: z.array(z.enum(TARGET_KEYS as [TargetKey, ...TargetKey[]])).min(1, 'Kam se kam ek platform chuno'),
  contentProvider: z.enum(CONTENT_PROVIDERS).optional(),
})

const contentInput = z.object({
  heading: z.string().trim().max(120),
  caption: z.string().trim().max(2200), // Instagram caption limit
  hashtags: z.array(z.string().trim().min(2)).max(30),
  cta: z.string().trim().max(60),
})

const patchInput = setupInput.partial().extend({
  selectedVariation: z.number().int().min(0).max(2).optional(),
  content: contentInput.optional(),
})

function derived(targets: TargetKey[]) {
  const t = targets.map((k) => TARGETS[k])
  return { platforms: [...new Set(t.map((x) => x.platform))], sizes: [...new Set(t.map((x) => x.size))] }
}

/** Checks the source item fits the post type and belongs to this store. Returns its title for the post title. */
async function resolveSource(storeId: string, type: string, sourceItemId?: string | null) {
  const needKind = SOURCE_KIND_FOR_TYPE[type]
  if (!sourceItemId) {
    if (needKind) throw new HttpError(400, `${needKind} chuno`)
    return null
  }
  const item = await SourceItem.findOne({ _id: sourceItemId, store: storeId }).lean()
  if (!item) throw new HttpError(400, 'Chuna hua item is store me nahi mila')
  if (needKind && item.kind !== needKind) throw new HttpError(400, `Is post type ke liye ${needKind} chuno`)
  return item
}

function utmUrl(url: string, post: { _id: unknown; type: string }, handle?: string | null) {
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', 'social')
    u.searchParams.set('utm_medium', 'organic')
    u.searchParams.set('utm_campaign', `${post.type}${handle ? `-${handle}` : ''}`.slice(0, 80))
    u.searchParams.set('utm_content', String(post._id))
    return u.toString()
  } catch {
    return url
  }
}

postsRouter.get('/', requireStorePermission('store.view'), async (req, res) => {
  const filter: Record<string, unknown> = { store: req.params.storeId }
  if (typeof req.query.status === 'string') filter.status = { $in: req.query.status.split(',') }
  const posts = await Post.find(filter)
    .select('title type targets platforms status scheduledAt compliance.passed language createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean()
  res.json(posts)
})

postsRouter.get('/:postId', requireStorePermission('store.view'), async (req, res) => {
  const post = await Post.findOne({ _id: req.params.postId as string, store: req.params.storeId as string })
    .populate('sourceItem', 'kind title url imageUrls price inStock shopifyStatus')
    .lean()
  if (!post) throw new HttpError(404, 'Post not found')
  res.json(post)
})

postsRouter.post('/', requireStorePermission('post.create'), async (req, res) => {
  const storeId = req.params.storeId as string
  const input = setupInput.parse(req.body)
  if (input.type === 'festival' && !input.festival?.name) throw new HttpError(400, 'Festival ka naam daalo')
  const source = await resolveSource(storeId, input.type, input.sourceItemId)
  const { sourceItemId: _, ...rest } = input
  const post = await Post.create({
    ...rest,
    ...derived(input.targets),
    store: storeId,
    sourceItem: source?._id,
    title: (input.type === 'festival' ? input.festival?.name : source?.title) || input.type,
    trigger: 'manual',
    status: 'draft',
    createdBy: req.user!.id,
  })
  res.status(201).json(post.toObject())
})

postsRouter.patch('/:postId', requireStorePermission('post.create'), async (req, res) => {
  const storeId = req.params.storeId as string
  const input = patchInput.parse(req.body)
  const post = await Post.findOne({ _id: req.params.postId as string, store: storeId })
  if (!post) throw new HttpError(404, 'Post not found')
  if (!EDITABLE_STATUSES.includes(post.status)) throw new HttpError(409, 'Approve / schedule ho chuki post edit nahi ho sakti')

  const { sourceItemId, selectedVariation, content, targets, ...setup } = input
  post.set(setup)
  if (targets) post.set({ targets, ...derived(targets) })
  if (sourceItemId !== undefined || input.type) {
    const source = await resolveSource(storeId, post.type, sourceItemId === undefined ? post.sourceItem?.toString() : sourceItemId)
    post.set({ sourceItem: source?._id ?? undefined })
    post.title = (post.type === 'festival' ? post.festival?.name : source?.title) || post.type
  }
  if (selectedVariation !== undefined) {
    const v = post.contentVariations[selectedVariation]
    if (!v) throw new HttpError(400, 'Ye option maujood nahi')
    post.selectedVariation = selectedVariation
    if (!content) post.set({ 'content.heading': v.heading, 'content.caption': v.caption, 'content.hashtags': v.hashtags, 'content.cta': v.cta })
  }
  if (content) post.set({ 'content.heading': content.heading, 'content.caption': content.caption, 'content.hashtags': content.hashtags, 'content.cta': content.cta })

  if (selectedVariation !== undefined || content) {
    const kit = await BrandKit.findOne({ store: storeId }).select('bannedWords').lean()
    const flags = checkCompliance(post.content ?? {}, kit?.bannedWords ?? [])
    post.compliance = { checkedAt: new Date(), passed: !flags.some((f) => f.severity === 'block'), flags } as typeof post.compliance
  }
  await post.save()
  res.json(post.toObject())
})

/** Content AI: writes 3 options, runs the compliance check on each, and pre-selects the safest one. */
postsRouter.post('/:postId/generate', requireStorePermission('post.create'), async (req, res) => {
  const storeId = req.params.storeId as string
  const post = await Post.findOne({ _id: req.params.postId as string, store: storeId })
  if (!post) throw new HttpError(404, 'Post not found')
  if (!EDITABLE_STATUSES.includes(post.status)) throw new HttpError(409, 'Is post ka content ab nahi badal sakta')

  const [store, kit, source] = await Promise.all([
    Store.findById(storeId).lean(),
    BrandKit.findOne({ store: storeId }).lean(),
    post.sourceItem ? SourceItem.findById(post.sourceItem).lean() : null,
  ])
  if (!store) throw new HttpError(404, 'Store not found')

  const provider = (post.contentProvider ?? store.ai?.content?.provider ?? 'claude') as ContentProvider
  const keyName = KEY_FOR_PROVIDER[provider]
  const keyEnc = (store.ai?.keys as Record<string, { enc?: string }> | undefined)?.[keyName]?.enc
  if (!keyEnc) {
    throw new HttpError(400, `${provider === 'claude' ? 'Anthropic' : provider === 'gpt' ? 'OpenAI' : 'Google'} API key is store me nahi hai. Stores > ${store.name} > AI API keys me daalo.`)
  }
  // Use the store's model name only when it was set for this same provider.
  const model = store.ai?.content?.provider === provider ? store.ai.content.model ?? undefined : undefined

  const result = await generateContent({
    provider,
    model,
    apiKey: decrypt(keyEnc),
    postType: post.type,
    language: post.language as 'hi' | 'en' | 'hinglish',
    platforms: post.platforms,
    source: source && {
      kind: source.kind,
      title: source.title,
      description: source.description ?? undefined,
      price: source.price ?? undefined,
      tags: source.tags,
    },
    festival: post.festival?.name ? { name: post.festival.name, date: post.festival.date } : null,
    brief: post.brief ?? undefined,
    brand: {
      storeName: store.shopify?.shopName || store.name,
      tone: kit?.tone,
      defaultCta: kit?.defaultCta,
      defaultHashtags: kit?.defaultHashtags,
      bannedWords: kit?.bannedWords,
    },
  })

  const disclaimer = kit?.disclaimer?.trim()
  const variations = result.variations.map((v) => {
    const caption = disclaimer && !v.caption.includes(disclaimer) ? `${v.caption}\n\n${disclaimer}` : v.caption
    return { ...v, caption, flags: checkCompliance({ ...v, caption }, kit?.bannedWords ?? []) }
  })
  // Pre-select the option with the fewest blocking issues (then fewest warnings).
  const score = (v: (typeof variations)[number]) =>
    v.flags.filter((f) => f.severity === 'block').length * 100 + v.flags.length
  const best = variations.reduce((bi, v, i) => (score(v) < score(variations[bi]) ? i : bi), 0)
  const chosen = variations[best]

  post.set({
    contentProvider: provider,
    contentVariations: variations,
    selectedVariation: best,
    content: {
      heading: chosen.heading,
      caption: chosen.caption,
      hashtags: chosen.hashtags,
      cta: chosen.cta,
      utmUrl: source ? utmUrl(source.url, post, source.handle) : undefined,
      model: result.model,
    },
    compliance: { checkedAt: new Date(), passed: !chosen.flags.some((f) => f.severity === 'block'), flags: chosen.flags },
    aiCostUsd: (post.aiCostUsd ?? 0) + result.costUsd,
  })
  await post.save()
  res.json(post.toObject())
})

postsRouter.delete('/:postId', requireStorePermission('post.create'), async (req, res) => {
  const post = await Post.findOne({ _id: req.params.postId as string, store: req.params.storeId as string })
  if (!post) throw new HttpError(404, 'Post not found')
  if (!EDITABLE_STATUSES.includes(post.status)) throw new HttpError(409, 'Approve / schedule ho chuki post delete nahi ho sakti')
  await post.deleteOne()
  res.status(204).end()
})
