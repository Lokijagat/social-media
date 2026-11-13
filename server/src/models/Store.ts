import { type InferSchemaType, Schema, model } from 'mongoose'
import { AI_KEY_PROVIDERS, CONTENT_PROVIDERS, IMAGE_PROVIDERS, LANGUAGES, VERIFY_PROVIDERS } from './constants.js'
import { secretSchema } from './secretField.js'

const aiChoice = (providers: readonly string[], fallback: string) =>
  new Schema(
    { provider: { type: String, enum: providers, default: fallback }, model: String },
    { _id: false },
  )

const storeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    defaultLanguage: { type: String, enum: LANGUAGES, default: 'hi' },
    active: { type: Boolean, default: true },

    shopify: {
      domain: { type: String, trim: true }, // e.g. jagatpharma.myshopify.com
      storefrontUrl: { type: String, trim: true }, // public site, used for UTM links
      // Dev Dashboard app (required for apps created from 2026): server exchanges these for a short-lived token.
      clientId: { type: String, trim: true },
      clientSecret: secretSchema,
      // Cached token from the client-credentials grant (~24h). Managed by lib/shopify.ts, never set by users.
      cachedToken: secretSchema,
      cachedTokenExpiresAt: Date,
      // Legacy custom app token (shpat_…), only for apps created in Shopify admin before 2026.
      accessToken: secretSchema,
      scopes: { type: [String], default: undefined }, // from last successful connection test
      shopName: String,
      lastSyncedAt: Date,
    },

    meta: {
      facebookPageId: String,
      instagramBusinessId: String,
      accessToken: secretSchema, // long-lived page token
      tokenExpiresAt: Date,
    },

    ai: {
      content: { type: aiChoice(CONTENT_PROVIDERS, 'claude'), default: () => ({}) },
      image: { type: aiChoice(IMAGE_PROVIDERS, 'gemini_image'), default: () => ({}) },
      verify: { type: aiChoice(VERIFY_PROVIDERS, 'claude'), default: () => ({}) },
      // Per-store API keys. Missing key => fall back to platform-level key from .env (if allowed).
      keys: {
        type: Map,
        of: secretSchema,
        default: () => new Map(),
        validate: {
          validator: (m: Map<string, unknown>) => [...m.keys()].every((k) => (AI_KEY_PROVIDERS as readonly string[]).includes(k)),
          message: 'Unknown AI key provider',
        },
      },
    },

    budget: {
      monthlyLimitUsd: { type: Number, default: 50, min: 0 },
      postsPerWeekTarget: { type: Number, default: 7, min: 0 },
    },
  },
  { timestamps: true },
)

export type StoreDoc = InferSchemaType<typeof storeSchema>
export const Store = model('Store', storeSchema)
