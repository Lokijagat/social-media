import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { GoogleGenAI } from '@google/genai'
import OpenAI from 'openai'
import { z } from 'zod'
import { HttpError } from '../http.js'
import { COMPLIANCE_PROMPT } from '../compliance.js'

export type ContentProvider = 'claude' | 'gpt' | 'gemini'

// Defaults when the store has no model set. Editable per store (Stores > AI models).
export const DEFAULT_CONTENT_MODELS: Record<ContentProvider, string> = {
  claude: 'claude-opus-5-5',
  gpt: 'gpt-5',
  gemini: 'gemini-2.5-flash',
}

// USD per 1M tokens [input, output]. Unknown models are recorded as $0 (tokens still logged).
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
}

const variationSchema = z.object({
  angle: z.string().describe('One short line: the creative idea behind this option'),
  heading: z.string().describe('Short text printed on the image, max 7 words'),
  caption: z.string().describe('Post caption without hashtags and without URLs'),
  hashtags: z.array(z.string()).describe('5 to 10 hashtags, each starting with #'),
  cta: z.string().describe('Call to action, 2 to 4 words'),
})
const outputSchema = z.object({ variations: z.array(variationSchema) })
export type ContentVariation = z.infer<typeof variationSchema>

// Same shape as JSON Schema for OpenAI / Gemini structured output.
const variationJson = {
  type: 'object',
  additionalProperties: false,
  required: ['angle', 'heading', 'caption', 'hashtags', 'cta'],
  properties: {
    angle: { type: 'string' },
    heading: { type: 'string' },
    caption: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
    cta: { type: 'string' },
  },
}
const outputJson = {
  type: 'object',
  additionalProperties: false,
  required: ['variations'],
  properties: { variations: { type: 'array', items: variationJson } },
}

export type ContentRequest = {
  provider: ContentProvider
  model?: string
  apiKey: string
  postType: string
  language: 'hi' | 'en' | 'hinglish'
  platforms: string[]
  source?: { kind: string; title: string; description?: string; price?: string; tags?: string[] } | null
  festival?: { name?: string; date?: Date | null } | null
  brief?: string
  brand: {
    storeName: string
    tone?: string
    defaultCta?: string
    defaultHashtags?: string[]
    bannedWords?: string[]
  }
}

export type ContentResult = { variations: ContentVariation[]; model: string; costUsd: number }

const LANGUAGE_RULES = {
  hi: 'Write heading, caption and CTA in Hindi using Devanagari script. Simple everyday Hindi, not heavy Sanskrit words. Hashtags may be English or Hinglish.',
  en: 'Write everything in simple Indian English.',
  hinglish:
    'Write in Hinglish: Hindi written in Latin (Roman) script, naturally mixed with English words, the way Indians text on WhatsApp. Do not use Devanagari.',
}

const POST_TYPE_GOALS: Record<string, string> = {
  festival: 'Festival greeting post. Warm wishes first; the brand/product is secondary and subtle.',
  product: 'Product post. Highlight what the product is and its traditional / wellness benefits from the details given.',
  collection: 'Collection post. Introduce the range and invite people to explore it.',
  page: 'Post promoting a page of the website (for example About, Contact or a guide). Explain why it is worth visiting.',
  offer: 'Offer post. Make the deal clear. Only mention discounts or codes that are given in the brief.',
  ayurveda_tip: 'Ayurveda tip post. Share one practical, safe daily-routine tip. Educational, not a sales pitch.',
  blog: 'Blog post promotion. Tease the main idea and invite people to read.',
}

function buildPrompt(req: ContentRequest) {
  const system = `You are the social media copywriter for "${req.brand.storeName}", an Indian Ayurvedic brand.
Brand tone: ${req.brand.tone || 'warm, trustworthy, traditional Ayurveda with a modern feel'}.

${COMPLIANCE_PROMPT}
${req.brand.bannedWords?.length ? `- Also never use these words: ${req.brand.bannedWords.join(', ')}.` : ''}

Output rules:
- Give exactly 3 different options (different angle each: for example emotional, informative, festive/offer).
- heading: max 7 words, it is printed on the image, so it must be short and punchy.
- caption: 40 to 120 words for Facebook/Instagram, short lines, 1 to 3 fitting emojis, no hashtags, no URLs, no prices unless given.
- hashtags: 5 to 10, relevant, mix of brand and topic tags.
- cta: 2 to 4 words.
- Language: ${LANGUAGE_RULES[req.language]}`

  const lines = [
    `Post type: ${req.postType}. ${POST_TYPE_GOALS[req.postType] ?? ''}`,
    `Platforms: ${req.platforms.join(', ')}.`,
  ]
  if (req.festival?.name) {
    const date = req.festival.date ? ` on ${req.festival.date.toDateString()}` : ''
    lines.push(`Festival: ${req.festival.name}${date}.`)
  }
  if (req.source) {
    lines.push(
      `${req.source.kind[0].toUpperCase()}${req.source.kind.slice(1)}: ${req.source.title}`,
      req.source.price ? `Price: ${req.source.price}` : '',
      req.source.tags?.length ? `Tags: ${req.source.tags.join(', ')}` : '',
      req.source.description ? `Details from the website:\n${req.source.description.slice(0, 2500)}` : '',
    )
  }
  if (req.brand.defaultCta) lines.push(`Preferred CTA style: ${req.brand.defaultCta}`)
  if (req.brand.defaultHashtags?.length) lines.push(`Always include these hashtags: ${req.brand.defaultHashtags.join(' ')}`)
  if (req.brief) lines.push(`Extra instructions from the team: ${req.brief}`)

  return { system, user: lines.filter(Boolean).join('\n') }
}

function providerError(provider: string, e: unknown): never {
  if (e instanceof HttpError) throw e
  const status = (e as { status?: number }).status
  if (status === 401 || status === 403) {
    throw new HttpError(400, `${provider} API key galat hai ya uske paas permission nahi. Store settings me key check karo.`)
  }
  if (status === 429) throw new HttpError(429, `${provider} rate limit / quota khatam. Thodi der baad try karo ya billing check karo.`)
  if (status === 404) throw new HttpError(400, `${provider} model nahi mila. Store settings me model ka naam check karo.`)
  const msg = e instanceof Error ? e.message : String(e)
  throw new HttpError(502, `${provider} se content nahi bana: ${msg}`)
}

async function withClaude(req: ContentRequest, model: string, system: string, user: string): Promise<ContentResult> {
  const client = new Anthropic({ apiKey: req.apiKey })
  try {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(outputSchema) },
      // If a safety classifier declines, the API retries on a suitable fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (response.stop_reason === 'refusal') throw new HttpError(422, 'Claude ne ye content likhne se mana kiya. Brief badal kar try karo.')
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new HttpError(502, 'Claude ka jawab adhoora aaya, dobara try karo.')
    const [inP, outP] = PRICES[response.model] ?? [0, 0]
    const u = response.usage
    const inputTokens = u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
    return {
      variations: response.parsed_output.variations,
      model: response.model,
      costUsd: (inputTokens * inP + u.output_tokens * outP) / 1e6,
    }
  } catch (e) {
    if (e instanceof Anthropic.APIError) providerError('Claude', e)
    providerError('Claude', e)
  }
}

async function withGpt(req: ContentRequest, model: string, system: string, user: string): Promise<ContentResult> {
  const client = new OpenAI({ apiKey: req.apiKey })
  try {
    const response = await client.responses.create({
      model,
      instructions: system,
      input: user,
      text: { format: { type: 'json_schema', name: 'post_content', schema: outputJson, strict: true } },
    })
    return { variations: outputSchema.parse(JSON.parse(response.output_text)).variations, model, costUsd: 0 }
  } catch (e) {
    providerError('OpenAI', e)
  }
}

async function withGemini(req: ContentRequest, model: string, system: string, user: string): Promise<ContentResult> {
  const ai = new GoogleGenAI({ apiKey: req.apiKey })
  try {
    const response = await ai.models.generateContent({
      model,
      contents: user,
      config: { systemInstruction: system, responseMimeType: 'application/json', responseJsonSchema: outputJson },
    })
    if (!response.text) throw new Error('khaali jawab aaya')
    return { variations: outputSchema.parse(JSON.parse(response.text)).variations, model, costUsd: 0 }
  } catch (e) {
    providerError('Gemini', e)
  }
}

/** Writes 3 caption/heading/hashtag options for a post with the store's chosen Content AI. */
export async function generateContent(req: ContentRequest): Promise<ContentResult> {
  const model = req.model?.trim() || DEFAULT_CONTENT_MODELS[req.provider]
  const { system, user } = buildPrompt(req)
  const run = { claude: withClaude, gpt: withGpt, gemini: withGemini }[req.provider]
  const result = await run(req, model, system, user)

  // Normalise: hashtags start with #, no duplicates; brand hashtags always present.
  const brandTags = req.brand.defaultHashtags ?? []
  result.variations = result.variations.slice(0, 3).map((v) => ({
    ...v,
    heading: v.heading.trim(),
    caption: v.caption.trim(),
    cta: v.cta.trim(),
    hashtags: [...new Set([...v.hashtags, ...brandTags].map((t) => `#${t.trim().replace(/^#+/, '').replace(/\s+/g, '')}`))].filter(
      (t) => t.length > 1,
    ),
  }))
  if (!result.variations.length) throw new HttpError(502, 'AI ne koi option nahi diya, dobara try karo.')
  return result
}
