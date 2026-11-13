import { Router } from 'express'
import { isDbConnected } from '../config/db.js'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.json({ ok: true, db: isDbConnected() ? 'connected' : 'disconnected', time: new Date().toISOString() })
})
