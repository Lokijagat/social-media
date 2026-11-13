import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { endSession, publicUser, requireAuth, startSession } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password.js'
import { User } from '../models/index.js'

export const authRouter = Router()

export const passwordSchema = z.string().min(8, 'Password kam se kam 8 characters ka ho').max(200)
const email = z.email('Sahi email daalo').trim().toLowerCase()

// Slows down password guessing: 10 failed attempts per 15 min per IP (successful logins don't count).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Bahut zyada login attempts. 15 minute baad try karo.' },
})

/** True until the first user exists; the client then shows "Create first admin". */
authRouter.get('/setup-status', async (_req, res) => {
  res.json({ needsSetup: (await User.estimatedDocumentCount()) === 0 })
})

/** Creates the first (super admin) user. Only works while there are no users at all. */
authRouter.post('/setup', loginLimiter, async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1), email, password: passwordSchema }).parse(req.body)
  if ((await User.countDocuments()) > 0) throw new HttpError(409, 'Setup already done. Please login.')

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    isSuperAdmin: true,
    lastLoginAt: new Date(),
  })
  startSession(res, user)
  res.status(201).json(publicUser(user))
})

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = z.object({ email, password: z.string().min(1).max(200) }).parse(req.body)
  const user = await User.findOne({ email: input.email }).select('+passwordHash')

  // Always run a hash check so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok) throw new HttpError(401, 'Email ya password galat hai')

  user.lastLoginAt = new Date()
  await user.save()
  startSession(res, user)
  res.json(publicUser(user))
})

authRouter.post('/logout', (_req, res) => {
  endSession(res)
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user!))
})

/** Change own password. Logs out every other session (tokenVersion bump), keeps this one. */
authRouter.post('/password', requireAuth, async (req, res) => {
  const input = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }).parse(req.body)
  const user = await User.findById(req.user!.id).select('+passwordHash')
  if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new HttpError(400, 'Current password galat hai')
  }
  user.passwordHash = await hashPassword(input.newPassword)
  user.tokenVersion = (user.tokenVersion ?? 0) + 1
  await user.save()
  startSession(res, user)
  res.json({ ok: true })
})
