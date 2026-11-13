import { type InferSchemaType, Schema, model } from 'mongoose'
import { FORMATS, SIZES } from './constants.js'

/** One generated creative for a post in one size. Platforms sharing a size reuse the same variant. */
const postVariantSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    size: { type: String, enum: SIZES, required: true },
    mediaType: { type: String, enum: FORMATS, default: 'image' },

    mediaUrl: String, // public URL (Cloudinary/S3), required by Instagram Graph API
    storageKey: String, // Cloudinary public_id or S3 key, for deletion
    backgroundUrl: String, // AI-generated scene before compositing the real product photo

    prompt: String,
    model: String,
    attempt: { type: Number, default: 1 },
    status: { type: String, enum: ['pending', 'generating', 'ready', 'failed'], default: 'pending' },
    error: String,
    verifyReport: { type: Schema.Types.ObjectId, ref: 'VerifyReport' },
    costUsd: { type: Number, default: 0 },
  },
  { timestamps: true },
)

export type PostVariantDoc = InferSchemaType<typeof postVariantSchema>
export const PostVariant = model('PostVariant', postVariantSchema)
