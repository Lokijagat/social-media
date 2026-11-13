// Keep in sync with server/src/lib/permissions.ts
export const ROLES = [
  { value: 'owner', label: 'Owner', hint: 'Sab kuch, owners bhi manage kar sakta hai' },
  { value: 'admin', label: 'Admin', hint: 'Settings, keys, brand kit, team, posts, approve' },
  { value: 'editor', label: 'Editor', hint: 'Posts banana / edit karna' },
  { value: 'approver', label: 'Approver', hint: 'Posts approve / reject karna' },
  { value: 'viewer', label: 'Viewer', hint: 'Sirf dekhna' },
] as const
export type Role = (typeof ROLES)[number]['value']

export type Permission = 'store.view' | 'post.create' | 'post.approve' | 'store.manage' | 'members.manage'

const ALL: Permission[] = ['store.view', 'post.create', 'post.approve', 'store.manage', 'members.manage']

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ALL,
  admin: ALL,
  editor: ['store.view', 'post.create'],
  approver: ['store.view', 'post.approve'],
  viewer: ['store.view'],
}

export type Me = {
  _id: string
  email: string
  name: string
  isSuperAdmin: boolean
  memberships: { store: string; role: Role }[]
}

export function roleIn(me: Me, storeId: string | undefined): Role | undefined {
  return storeId ? me.memberships.find((m) => m.store === storeId)?.role : undefined
}

export function can(me: Me | null | undefined, storeId: string | undefined, permission: Permission): boolean {
  if (!me) return false
  if (me.isSuperAdmin) return true
  const role = roleIn(me, storeId)
  return !!role && ROLE_PERMISSIONS[role].includes(permission)
}
