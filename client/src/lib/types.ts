// Mirrors server/src/models. Keep in sync until a shared package exists.

export const LANGUAGES = [
  { value: 'hi', label: 'Hindi' },
  { value: 'en', label: 'English' },
  { value: 'hinglish', label: 'Hinglish' },
] as const
export type Language = (typeof LANGUAGES)[number]['value']

export const CONTENT_PROVIDERS = [
  { value: 'claude', label: 'Claude' },
  { value: 'gpt', label: 'GPT' },
  { value: 'gemini', label: 'Gemini' },
] as const
export const IMAGE_PROVIDERS = [
  { value: 'gemini_image', label: 'Gemini Image' },
  { value: 'openai_image', label: 'OpenAI Image' },
  { value: 'flux', label: 'Flux' },
  { value: 'ideogram', label: 'Ideogram' },
] as const
export const VERIFY_PROVIDERS = [
  { value: 'claude', label: 'Claude Vision' },
  { value: 'gpt', label: 'GPT Vision' },
] as const
export const AI_KEY_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT / Image)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'replicate', label: 'Replicate (Flux)' },
  { value: 'ideogram', label: 'Ideogram' },
] as const
export type AiKeyProvider = (typeof AI_KEY_PROVIDERS)[number]['value']

/** Secrets come back masked only; the real value never leaves the server. */
export type Secret = { mask?: string; updatedAt?: string }

type AiChoice = { provider: string; model?: string }

export type Store = {
  _id: string
  name: string
  slug: string
  timezone: string
  defaultLanguage: Language
  active: boolean
  shopify?: {
    domain?: string
    storefrontUrl?: string
    clientId?: string
    clientSecret?: Secret
    accessToken?: Secret // legacy shpat_ token
    cachedTokenExpiresAt?: string
    scopes?: string[]
    shopName?: string
    lastSyncedAt?: string
  }
  meta?: { facebookPageId?: string; instagramBusinessId?: string; accessToken?: Secret; tokenExpiresAt?: string }
  ai: { content: AiChoice; image: AiChoice; verify: AiChoice; keys?: Partial<Record<AiKeyProvider, Secret>> }
  budget: { monthlyLimitUsd: number; postsPerWeekTarget: number }
  createdAt: string
  updatedAt: string
}

export type BrandKit = {
  _id: string
  store: string
  logoUrl?: string
  logoLightUrl?: string
  colors: { primary: string; secondary: string; accent: string; text: string }
  fonts: { heading: string; body: string; hindi: string }
  tone: string
  defaultHashtags: string[]
  defaultCta: string
  disclaimer?: string
  bannedWords: string[]
  imageStyleNotes?: string
}

export const SOURCE_KINDS = [
  { value: 'product', label: 'Products' },
  { value: 'collection', label: 'Collections' },
  { value: 'page', label: 'Pages' },
] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]['value']

/** A Shopify product / collection / page (or a manual entry) that a post can be about. */
export type SourceItem = {
  _id: string
  store: string
  kind: SourceKind
  origin: 'shopify' | 'manual'
  shopifyId?: string
  handle?: string
  title: string
  url: string
  description?: string
  imageUrls: string[]
  price?: string
  inStock: boolean
  shopifyStatus?: 'active' | 'draft' | 'archived'
  tags: string[]
  syncedAt?: string
}

export const POST_TYPES = [
  { value: 'festival', label: 'Festival' },
  { value: 'product', label: 'Product' },
  { value: 'collection', label: 'Collection' },
  { value: 'page', label: 'Page' },
  { value: 'offer', label: 'Offer' },
  { value: 'ayurveda_tip', label: 'Ayurveda Tip' },
] as const
export type PostType = (typeof POST_TYPES)[number]['value'] | 'blog'

/** Post types that must be about one Shopify item of this kind. */
export const SOURCE_KIND_FOR_TYPE: Partial<Record<PostType, SourceKind>> = {
  product: 'product',
  collection: 'collection',
  page: 'page',
}

// Mirrors server TARGETS. Phase 1 publishes to Facebook + Instagram.
export const TARGETS = [
  { value: 'ig_feed', platform: 'instagram', label: 'Instagram Feed', size: '1080x1350', ratio: '4 / 5' },
  { value: 'ig_square', platform: 'instagram', label: 'Instagram Square', size: '1080x1080', ratio: '1 / 1' },
  { value: 'ig_story', platform: 'instagram', label: 'Instagram Story / Reel', size: '1080x1920', ratio: '9 / 16' },
  { value: 'fb_feed', platform: 'facebook', label: 'Facebook Feed', size: '1080x1080', ratio: '1 / 1' },
  { value: 'fb_link', platform: 'facebook', label: 'Facebook Link', size: '1200x630', ratio: '1200 / 630' },
] as const
export type TargetKey = (typeof TARGETS)[number]['value']

export const POST_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  generating: 'Generating',
  needs_review: 'Needs approval',
  approved: 'Approved',
  scheduled: 'Scheduled',
  publishing: 'Publishing',
  published: 'Published',
  partially_published: 'Partly published',
  failed: 'Failed',
  rejected: 'Rejected',
}

export type ComplianceFlag = {
  term: string
  reason: string
  severity: 'block' | 'warn'
  field: 'heading' | 'caption' | 'hashtags' | 'cta'
}
export type ContentVariation = {
  angle?: string
  heading: string
  caption: string
  hashtags: string[]
  cta: string
  flags: ComplianceFlag[]
}
export type ContentProvider = (typeof CONTENT_PROVIDERS)[number]['value']

export type Post = {
  _id: string
  store: string
  type: PostType
  title?: string
  sourceItem?: Pick<SourceItem, '_id' | 'kind' | 'title' | 'url' | 'imageUrls' | 'price' | 'inStock' | 'shopifyStatus'> | null
  festival?: { name?: string; date?: string } | null
  brief?: string
  format: 'image' | 'video'
  language: Language
  targets: TargetKey[]
  platforms: string[]
  sizes: string[]
  contentProvider?: ContentProvider
  contentVariations: ContentVariation[]
  selectedVariation?: number
  content?: { heading?: string; caption?: string; hashtags: string[]; cta?: string; utmUrl?: string; model?: string }
  compliance?: { checkedAt?: string; passed?: boolean; flags: ComplianceFlag[] }
  status: string
  scheduledAt?: string
  aiCostUsd: number
  createdAt: string
  updatedAt: string
}
export type PostListItem = Pick<
  Post,
  '_id' | 'title' | 'type' | 'targets' | 'platforms' | 'status' | 'scheduledAt' | 'language' | 'createdAt' | 'updatedAt'
> & { compliance?: { passed?: boolean } }
