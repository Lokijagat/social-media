import { type InferSchemaType, Schema, model } from 'mongoose'

export const VERIFY_CHECKS = [
  'product_correct', // product + label match the real Shopify product
  'logo_present',
  'brand_colors',
  'spelling',
  'safe_zone', // text/logo inside platform safe area
  'size_correct',
  'caption_image_match',
  'compliance_text', // no health claims in image text
] as const

const checkSchema = new Schema(
  {
    key: { type: String, enum: VERIFY_CHECKS, required: true },
    passed: { type: Boolean, required: true },
    note: String,
  },
  { _id: false },
)

const verifyReportSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    variant: { type: Schema.Types.ObjectId, ref: 'PostVariant', required: true },
    model: String,
    score: { type: Number, min: 0, max: 100, required: true },
    checks: { type: [checkSchema], default: [] },
    summary: String,
    costUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export type VerifyReportDoc = InferSchemaType<typeof verifyReportSchema>
export const VerifyReport = model('VerifyReport', verifyReportSchema)
