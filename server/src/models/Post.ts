import { type InferSchemaType, Schema, model } from 'mongoose'
import { CONTENT_PROVIDERS, FORMATS, LANGUAGES, PLATFORMS, POST_STATUSES, POST_TYPES, SIZES, TARGET_KEYS, TRIGGERS } from './constants.js'

const complianceFlagSchema = new Schema(
  {
    term: String,
    reason: String,
    severity: { type: String, enum: ['block', 'warn'], default: 'block' },
    field: { type: String, enum: ['heading', 'caption', 'hashtags', 'cta', 'image_text'] },
  },
  { _id: false },
)

/** One AI-written option. The user picks one (and may edit it) into `content`. */
const contentVariationSchema = new Schema(
  {
    heading: String,
    caption: String,
    hashtags: { type: [String], default: [] },
    cta: String,
    angle: String, // short note on the creative idea behind this option
    flags: { type: [complianceFlagSchema], default: [] },
  },
  { _id: false },
)

const postSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    type: { type: String, enum: POST_TYPES, required: true },
    trigger: { type: String, enum: TRIGGERS, default: 'manual' },
    sourceItem: { type: Schema.Types.ObjectId, ref: 'SourceItem' },
    festival: { name: String, date: Date },
    title: { type: String, trim: true }, // shown in lists: source title or festival name
    brief: String, // optional extra instructions from the user

    format: { type: String, enum: FORMATS, default: 'image' },
    language: { type: String, enum: LANGUAGES, required: true },
    // Chosen placements (see TARGETS); platforms + sizes are derived from them.
    targets: { type: [{ type: String, enum: TARGET_KEYS }], default: [] },
    platforms: { type: [{ type: String, enum: PLATFORMS }], required: true },
    sizes: { type: [{ type: String, enum: SIZES }], required: true },
    contentProvider: { type: String, enum: CONTENT_PROVIDERS },

    contentVariations: { type: [contentVariationSchema], default: [] },
    selectedVariation: Number,

    content: {
      heading: String, // text placed on the image
      caption: String,
      hashtags: { type: [String], default: [] },
      cta: String,
      utmUrl: String,
      model: String, // which AI model wrote it
    },

    compliance: {
      checkedAt: Date,
      passed: Boolean,
      flags: { type: [complianceFlagSchema], default: [] },
    },

    status: { type: String, enum: POST_STATUSES, default: 'draft', index: true },
    approval: {
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: Date,
      decision: { type: String, enum: ['approved', 'rejected'] },
      note: String,
    },
    scheduledAt: Date,

    aiCostUsd: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

postSchema.index({ store: 1, status: 1, createdAt: -1 })

export type PostDoc = InferSchemaType<typeof postSchema>
export const Post = model('Post', postSchema)
