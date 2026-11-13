import { Router } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { requireStorePermission } from '../lib/auth.js'
import { HttpError } from '../lib/http.js'
import { hashPassword } from '../lib/password.js'
import { roleIn } from '../lib/permissions.js'
import { ROLES, type Role, Store, User } from '../models/index.js'
import { passwordSchema } from './auth.js'

// Mounted at /api/stores/:storeId/members (after requireAuth)
export const membersRouter = Router({ mergeParams: true })
membersRouter.use(requireStorePermission('members.manage'))

type Params = { storeId: string; userId?: string }

/** Only an owner (or super admin) may grant, change or remove the owner role. */
function assertCanTouchOwner(actor: { isSuperAdmin?: boolean | null; memberships: { store: unknown; role: Role }[] }, storeId: string) {
  if (!actor.isSuperAdmin && roleIn(actor, storeId) !== 'owner') {
    throw new HttpError(403, 'Owner role sirf owner hi de / badal sakta hai')
  }
}

async function assertNotLastOwner(storeId: string, userId: string) {
  const owners = await User.countDocuments({ memberships: { $elemMatch: { store: storeId, role: 'owner' } } })
  const isOwner = await User.exists({ _id: userId, memberships: { $elemMatch: { store: storeId, role: 'owner' } } })
  if (isOwner && owners <= 1) throw new HttpError(400, 'Store ka kam se kam ek owner hona chahiye')
}

membersRouter.get('/', async (req, res) => {
  const { storeId } = req.params as Params
  const users = await User.find({ 'memberships.store': storeId }).sort({ name: 1 }).lean()
  res.json(
    users.map((u) => ({
      _id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.memberships.find((m) => String(m.store) === storeId)?.role,
      lastLoginAt: u.lastLoginAt,
    })),
  )
})

/** Adds an existing user by email, or creates a new user (name + temporary password required). */
membersRouter.post('/', async (req, res) => {
  const { storeId } = req.params as Params
  const input = z
    .object({
      email: z.email('Sahi email daalo').trim().toLowerCase(),
      role: z.enum(ROLES),
      name: z.string().trim().min(1).optional(),
      password: passwordSchema.optional(),
    })
    .parse(req.body)

  if (!(await Store.exists({ _id: storeId }))) throw new HttpError(404, 'Store not found')
  if (input.role === 'owner') assertCanTouchOwner(req.user!, storeId)

  const membership = { store: new Types.ObjectId(storeId), role: input.role }
  const existing = await User.findOne({ email: input.email })

  if (existing) {
    if (roleIn(existing, storeId)) throw new HttpError(409, 'Ye user pehle se is store me hai')
    existing.memberships.push(membership)
    await existing.save()
    res.status(201).json({ _id: existing.id, created: false })
    return
  }

  if (!input.name || !input.password) {
    throw new HttpError(400, 'Naya user hai: naam aur temporary password dono chahiye')
  }
  const user = await User.create({
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    memberships: [membership],
  })
  res.status(201).json({ _id: user.id, created: true })
})

membersRouter.patch('/:userId', async (req, res) => {
  const { storeId, userId } = req.params as Params
  const { role } = z.object({ role: z.enum(ROLES) }).parse(req.body)

  const user = await User.findById(userId)
  const current = user && roleIn(user, storeId)
  if (!user || !current) throw new HttpError(404, 'Member not found')
  if (current === role) {
    res.json({ ok: true })
    return
  }
  if (current === 'owner' || role === 'owner') assertCanTouchOwner(req.user!, storeId)
  if (current === 'owner') await assertNotLastOwner(storeId, userId!)

  await User.updateOne({ _id: userId, 'memberships.store': storeId }, { $set: { 'memberships.$.role': role } })
  res.json({ ok: true })
})

membersRouter.delete('/:userId', async (req, res) => {
  const { storeId, userId } = req.params as Params
  const user = await User.findById(userId)
  const current = user && roleIn(user, storeId)
  if (!user || !current) throw new HttpError(404, 'Member not found')
  if (current === 'owner') {
    assertCanTouchOwner(req.user!, storeId)
    await assertNotLastOwner(storeId, userId!)
  }

  await User.updateOne({ _id: userId }, { $pull: { memberships: { store: storeId } } })
  res.json({ ok: true })
})
