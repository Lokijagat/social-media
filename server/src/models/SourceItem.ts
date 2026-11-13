import { type InferSchemaType, Schema, model } from 'mongoose'

/** A product / collection / page from Shopify (or entered manually) that a post is about. */
const sourceItemSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    kind: { type: String, enum: ['product', 'collection', 'page'], required: true },
    origin: { type: String, enum: ['shopify', 'manual'], default: 'shopify' },
    shopifyId: String, // gid://shopify/Product/123
    handle: String,
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    description: String,
    imageUrls: { type: [String], default: [] }, // real product photos; AI must never redraw the product
    price: String,
    // Out-of-stock / non-active products are skipped when auto-drafting posts.
    inStock: { type: Boolean, default: true },
    shopifyStatus: { type: String, enum: ['active', 'draft', 'archived'] },
    tags: { type: [String], default: [] },
    syncedAt: Date,
  },
  { timestamps: true },
)

sourceItemSchema.index(
  { store: 1, kind: 1, shopifyId: 1 },
  { unique: true, partialFilterExpression: { shopifyId: { $type: 'string' } } },
)
sourceItemSchema.index({ store: 1, title: 'text' })

export type SourceItemDoc = InferSchemaType<typeof sourceItemSchema>
export const SourceItem = model('SourceItem', sourceItemSchema)
