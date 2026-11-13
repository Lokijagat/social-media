// Shared enums. Keep in sync with client when a shared package is introduced.

export const PLATFORMS = ['facebook', 'instagram', 'whatsapp', 'pinterest', 'youtube_shorts', 'google_business'] as const
export type Platform = (typeof PLATFORMS)[number]

export const POST_TYPES = ['festival', 'product', 'collection', 'page', 'offer', 'ayurveda_tip', 'blog'] as const
export type PostType = (typeof POST_TYPES)[number]

export const TRIGGERS = ['festival', 'new_product', 'schedule', 'manual'] as const
export const FORMATS = ['image', 'video'] as const
// hinglish = Hindi written in Latin script, mixed with English
export const LANGUAGES = ['hi', 'en', 'hinglish'] as const

export const SIZES = ['1080x1080', '1080x1350', '1080x1920', '1200x630', '1000x1500'] as const
export type SizeKey = (typeof SIZES)[number]

export const POST_STATUSES = [
  'draft',
  'generating',
  'needs_review', // generated + verified, waiting for user approval
  'approved',
  'scheduled',
  'publishing',
  'published',
  'partially_published',
  'failed',
  'rejected',
] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export const ROLES = ['owner', 'admin', 'editor', 'approver', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export const CONTENT_PROVIDERS = ['claude', 'gpt', 'gemini'] as const
export const IMAGE_PROVIDERS = ['gemini_image', 'openai_image', 'flux', 'ideogram'] as const
export const VERIFY_PROVIDERS = ['claude', 'gpt'] as const
export const AI_KEY_PROVIDERS = ['anthropic', 'openai', 'google', 'replicate', 'ideogram'] as const

/** Where a post goes: platform + placement + image size. Phase 1 publishes to Facebook + Instagram only. */
export const TARGETS = {
  ig_feed: { platform: 'instagram', label: 'Instagram Feed', size: '1080x1350' },
  ig_square: { platform: 'instagram', label: 'Instagram Square', size: '1080x1080' },
  ig_story: { platform: 'instagram', label: 'Instagram Story / Reel', size: '1080x1920' },
  fb_feed: { platform: 'facebook', label: 'Facebook Feed', size: '1080x1080' },
  fb_link: { platform: 'facebook', label: 'Facebook Link', size: '1200x630' },
} as const satisfies Record<string, { platform: Platform; label: string; size: SizeKey }>
export type TargetKey = keyof typeof TARGETS
export const TARGET_KEYS = Object.keys(TARGETS) as TargetKey[]
