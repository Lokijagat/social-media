import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env.js'
import { requireAuth } from './lib/auth.js'
import { errorHandler } from './lib/http.js'
import { authRouter } from './routes/auth.js'
import { brandKitRouter } from './routes/brandKit.js'
import { healthRouter } from './routes/health.js'
import { membersRouter } from './routes/members.js'
import { postsRouter } from './routes/posts.js'
import { sourcesRouter } from './routes/sources.js'
import { storesRouter } from './routes/stores.js'

export function createApp() {
  const app = express()
  // Behind a reverse proxy in production: needed for correct client IPs (rate limiting).
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  // Public
  app.use('/api/health', healthRouter)
  app.use('/api/auth', authRouter)

  // Everything below needs a logged-in user
  app.use('/api/stores', requireAuth)
  app.use('/api/stores/:storeId/brand-kit', brandKitRouter)
  app.use('/api/stores/:storeId/members', membersRouter)
  app.use('/api/stores/:storeId/sources', sourcesRouter)
  app.use('/api/stores/:storeId/posts', postsRouter)
  app.use('/api/stores', storesRouter)

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })
  app.use(errorHandler)
  return app
}
