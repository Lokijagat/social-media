import { Router } from 'express'
import { z } from 'zod'
import { requireStorePermission } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { BrandKit, Store } from '../models/index.js'

// Mounted at /api/stores/:storeId/brand-kit
export const brandKitRouter = Router({ mergeParams: true })

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #1f6f43')
const optionalUrl = z.union([z.url(), z.literal('')]).optional()
const tagList = z.array(z.string().trim().min(1)).max(50)

const brandKitInput = z.object({
  logoUrl: optionalUrl,
  logoLightUrl: optionalUrl,
  colors: z.object({ primary: hex, secondary: hex, accent: hex, text: hex }).partial().optional(),
  fonts: z
    .object({ heading: z.string().trim(), body: z.string().trim(), hindi: z.string().trim() })
    .partial()
    .optional(),
  tone: z.string().trim().max(500).optional(),
  defaultHashtags: tagList
    .transform((tags) => tags.map((t) => (t.startsWith('#') ? t : `#${t}`)))
    .optional(),
  defaultCta: z.string().trim().max(60).optional(),
  disclaimer: z.string().trim().max(300).optional(),
  bannedWords: tagList.transform((w) => w.map((x) => x.toLowerCase())).optional(),
  imageStyleNotes: z.string().trim().max(1000).optional(),
})

async function findOrCreate(storeId: string) {
  if (!(await Store.exists({ _id: storeId }))) throw new HttpError(404, 'Store not found')
  return BrandKit.findOneAndUpdate(
    { store: storeId },
    { $setOnInsert: { store: storeId } },
    { upsert: true, returnDocument: 'after' },
  ).lean()
}

brandKitRouter.get('/', requireStorePermission('store.view'), async (req, res) => {
  const { storeId } = req.params as { storeId: string }
  res.json(await findOrCreate(storeId))
})

brandKitRouter.put('/', requireStorePermission('store.manage'), async (req, res) => {
  const { storeId } = req.params as { storeId: string }
  const input = brandKitInput.parse(req.body)
  await findOrCreate(storeId)

  // Flatten nested objects so a partial update doesn't wipe sibling fields.
  const set: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    if (k === 'colors' || k === 'fonts') {
      for (const [sub, val] of Object.entries(v as object)) if (val !== undefined) set[`${k}.${sub}`] = val
    } else set[k] = v
  }

  const kit = await BrandKit.findOneAndUpdate({ store: storeId }, { $set: set }, { returnDocument: 'after', runValidators: true }).lean()
  res.json(kit)
})
