import type { Role } from '../models/constants.js'

// Keep in sync with client/src/lib/permissions.ts
export const PERMISSIONS = ['store.view', 'post.create', 'post.approve', 'store.manage', 'members.manage'] as const
export type Permission = (typeof PERMISSIONS)[number]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  editor: ['store.view', 'post.create'],
  approver: ['store.view', 'post.approve'],
  viewer: ['store.view'],
}

type Member = { isSuperAdmin?: boolean | null; memberships: { store: unknown; role: Role }[] }

export function roleIn(user: Member, storeId: string): Role | undefined {
  return user.memberships.find((m) => String(m.store) === storeId)?.role
}

export function can(user: Member, storeId: string, permission: Permission): boolean {
  if (user.isSuperAdmin) return true
  const role = roleIn(user, storeId)
  return !!role && ROLE_PERMISSIONS[role].includes(permission)
}
