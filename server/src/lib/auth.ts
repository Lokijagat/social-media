import type { CookieOptions, RequestHandler, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { HydratedDocument } from 'mongoose'
import { env } from '../config/env.js'
import { User, type UserDoc } from '../models/index.js'
import { HttpError } from './http.js'
import { can, type Permission } from './permissions.js'

export const SESSION_COOKIE = 'sid'
const SESSION_DAYS = 7

export type AuthUser = HydratedDocument<UserDoc>

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

const cookieOptions: CookieOptions = {
  httpOnly: true, // not readable from JS
  sameSite: 'lax', // not sent on cross-site POSTs (basic CSRF protection)
  secure: env.NODE_ENV === 'production',
  path: '/',
}

type SessionClaims = { sub: string; tv: number }

export function startSession(res: Response, user: AuthUser) {
  const claims: SessionClaims = { sub: user.id, tv: user.tokenVersion ?? 0 }
  const token = jwt.sign(claims, env.JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` })
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 })
}

export function endSession(res: Response) {
  res.clearCookie(SESSION_COOKIE, cookieOptions)
}

/** Loads the logged-in user fresh from the DB on every request, so role changes apply immediately. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined
  if (!token) throw new HttpError(401, 'Login required')

  let claims: SessionClaims
  try {
    claims = jwt.verify(token, env.JWT_SECRET) as SessionClaims
  } catch {
    endSession(res)
    throw new HttpError(401, 'Session expired, please login again')
  }

  const user = await User.findById(claims.sub)
  if (!user || (user.tokenVersion ?? 0) !== claims.tv) {
    endSession(res)
    throw new HttpError(401, 'Session expired, please login again')
  }
  req.user = user
  next()
}

/** Checks a permission on the store in `req.params[param]`. Use after requireAuth. */
export const requireStorePermission =
  (permission: Permission, param = 'storeId'): RequestHandler =>
  (req, _res, next) => {
    const storeId = req.params[param] as string | undefined
    if (!req.user) throw new HttpError(401, 'Login required')
    if (!storeId || !can(req.user, storeId, permission)) throw new HttpError(403, "You don't have access to do this")
    next()
  }

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user?.isSuperAdmin) throw new HttpError(403, 'Only the platform admin can do this')
  next()
}

/** Safe user shape for the client. */
export function publicUser(user: AuthUser) {
  return {
    _id: user.id as string,
    email: user.email,
    name: user.name,
    isSuperAdmin: !!user.isSuperAdmin,
    memberships: user.memberships.map((m) => ({ store: String(m.store), role: m.role })),
  }
}
