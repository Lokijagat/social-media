import { type InferSchemaType, Schema, model } from 'mongoose'

const brandKitSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: 'Store', required: true, unique: true },
    logoUrl: String,
    logoLightUrl: String, // variant for dark backgrounds
    colors: {
      primary: { type: String, default: '#1f6f43' },
      secondary: { type: String, default: '#f4e9d8' },
      accent: { type: String, default: '#c8962e' },
      text: { type: String, default: '#1a1a1a' },
    },
    fonts: {
      heading: { type: String, default: 'Poppins' },
      body: { type: String, default: 'Inter' },
      hindi: { type: String, default: 'Noto Sans Devanagari' },
    },
    tone: { type: String, default: 'Warm, trustworthy, traditional Ayurveda with a modern feel' },
    defaultHashtags: { type: [String], default: [] },
    defaultCta: { type: String, default: 'Shop now' },
    disclaimer: String, // e.g. "Consult your physician before use."
    // Extra store-specific blocked words, on top of the global compliance list.
    bannedWords: { type: [String], default: [] },
    imageStyleNotes: String, // guidance for Image AI: backgrounds, props, mood
  },
  { timestamps: true },
)

export type BrandKitDoc = InferSchemaType<typeof brandKitSchema>
export const BrandKit = model('BrandKit', brandKitSchema)
