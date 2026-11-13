import { z } from 'zod'

// Env is loaded by Node's --env-file flag (see package.json scripts).
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  // 32-byte key, base64 encoded. Used to encrypt per-store secrets (Shopify/Meta/AI keys) at rest.
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64'),
  // Signs login session cookies.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:')
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`)
  console.error('Copy .env.example to .env and fill in the values.')
  process.exit(1)
}

export const env = parsed.data
