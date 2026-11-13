import { Schema } from 'mongoose'

/**
 * An encrypted secret (API key / access token). `enc` must never reach the client (see stripSecrets);
 * `mask` is safe to display. Use encrypt()/maskSecret() from lib/crypto when setting it.
 */
export const secretSchema = new Schema(
  {
    enc: String, // never returned by the API: routes pass docs through stripSecrets()
    mask: String,
    updatedAt: Date,
  },
  { _id: false },
)
