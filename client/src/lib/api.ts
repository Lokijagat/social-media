import axios, { isAxiosError } from 'axios'
import type { Me, Role } from './permissions'
import type { BrandKit, ContentProvider, Language, Post, PostListItem, PostType, SourceItem, SourceKind, Store, TargetKey } from './types'

// All requests go to /api; Vite proxies them to the Express server in dev.
export const api = axios.create({ baseURL: '/api' })

/** Turns an API error into a readable message (uses the server's `error` / Zod issues). */
export function errorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string; issues?: { path: (string | number)[]; message: string }[] } | undefined
    if (data?.issues?.length) return data.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')
    if (data?.error) return data.error
    if (!err.response) return 'Server se connect nahi ho paya. Kya `npm run dev` chal raha hai?'
  }
  return err instanceof Error ? err.message : 'Something went wrong'
}

export type HealthResponse = { ok: boolean; db: 'connected' | 'disconnected'; time: string }
export const getHealth = () => api.get<HealthResponse>('/health').then((r) => r.data)

// Stores. Secret fields are sent as plain strings and only when changed.
export type StorePayload = Record<string, unknown>
export const listStores = () => api.get<Store[]>('/stores').then((r) => r.data)
export const getStore = (id: string) => api.get<Store>(`/stores/${id}`).then((r) => r.data)
export const createStore = (body: StorePayload) => api.post<Store>('/stores', body).then((r) => r.data)
export const updateStore = (id: string, body: StorePayload) => api.patch<Store>(`/stores/${id}`, body).then((r) => r.data)

export type ShopifyTestResult = {
  ok: boolean
  shopName: string
  myshopifyDomain: string
  primaryDomain: string
  scopes: string[]
  missingScopes: string[]
}
export const testShopify = (storeId: string) =>
  api.post<ShopifyTestResult>(`/stores/${storeId}/shopify/test`).then((r) => r.data)

// Brand kit
export const getBrandKit = (storeId: string) => api.get<BrandKit>(`/stores/${storeId}/brand-kit`).then((r) => r.data)
export const saveBrandKit = (storeId: string, body: Partial<Omit<BrandKit, '_id' | 'store'>>) =>
  api.put<BrandKit>(`/stores/${storeId}/brand-kit`, body).then((r) => r.data)

// Auth (session is an httpOnly cookie; JS never sees the token)
export const getSetupStatus = () => api.get<{ needsSetup: boolean }>('/auth/setup-status').then((r) => r.data)
export const setupFirstAdmin = (body: { name: string; email: string; password: string }) =>
  api.post<Me>('/auth/setup', body).then((r) => r.data)
export const login = (body: { email: string; password: string }) => api.post<Me>('/auth/login', body).then((r) => r.data)
export const logout = () => api.post('/auth/logout').then(() => undefined)
export const changePassword = (body: { currentPassword: string; newPassword: string }) =>
  api.post('/auth/password', body).then(() => undefined)

/** Returns null when not logged in (401) instead of throwing. */
export const getMe = () =>
  api.get<Me>('/auth/me').then(
    (r) => r.data,
    (err) => {
      if (isAxiosError(err) && err.response?.status === 401) return null
      throw err
    },
  )

// Team members of a store
export type Member = { _id: string; name: string; email: string; role: Role; lastLoginAt?: string }
export const listMembers = (storeId: string) => api.get<Member[]>(`/stores/${storeId}/members`).then((r) => r.data)
export const addMember = (storeId: string, body: { email: string; role: Role; name?: string; password?: string }) =>
  api.post<{ _id: string; created: boolean }>(`/stores/${storeId}/members`, body).then((r) => r.data)
export const updateMemberRole = (storeId: string, userId: string, role: Role) =>
  api.patch(`/stores/${storeId}/members/${userId}`, { role }).then(() => undefined)
export const removeMember = (storeId: string, userId: string) =>
  api.delete(`/stores/${storeId}/members/${userId}`).then(() => undefined)

// Source data: Shopify products / collections / pages + manual entries
export type SourceFilter = 'all' | 'usable' | 'out_of_stock' | 'draft' | 'manual'
export type SourceListParams = { kind?: SourceKind; q?: string; filter?: SourceFilter; page?: number; limit?: number }
export type SourceList = {
  items: SourceItem[]
  total: number
  page: number
  limit: number
  counts: Record<SourceKind, number>
}
export type SyncResult = { products: number; collections: number; pages: number; removed: number; syncedAt: string }
export type ManualSourceInput = {
  kind: SourceKind
  title: string
  url: string
  description?: string
  imageUrls?: string[]
  price?: string
}
export const listSources = (storeId: string, params: SourceListParams) =>
  api.get<SourceList>(`/stores/${storeId}/sources`, { params }).then((r) => r.data)
export const syncSources = (storeId: string) =>
  api.post<SyncResult>(`/stores/${storeId}/sources/sync`).then((r) => r.data)
export const addManualSource = (storeId: string, body: ManualSourceInput) =>
  api.post<SourceItem>(`/stores/${storeId}/sources`, body).then((r) => r.data)
export const deleteSource = (storeId: string, itemId: string) =>
  api.delete(`/stores/${storeId}/sources/${itemId}`).then(() => undefined)

// Posts
export type PostSetup = {
  type: PostType
  sourceItemId?: string | null
  festival?: { name: string; date?: string | null } | null
  brief?: string
  language: Language
  format: 'image' | 'video'
  targets: TargetKey[]
  contentProvider?: ContentProvider
}
export type PostContentInput = { heading: string; caption: string; hashtags: string[]; cta: string }
export const listPosts = (storeId: string) => api.get<PostListItem[]>(`/stores/${storeId}/posts`).then((r) => r.data)
export const getPost = (storeId: string, postId: string) =>
  api.get<Post>(`/stores/${storeId}/posts/${postId}`).then((r) => r.data)
export const createPost = (storeId: string, body: PostSetup) =>
  api.post<Post>(`/stores/${storeId}/posts`, body).then((r) => r.data)
export const updatePost = (
  storeId: string,
  postId: string,
  body: Partial<PostSetup> & { selectedVariation?: number; content?: PostContentInput },
) => api.patch<Post>(`/stores/${storeId}/posts/${postId}`, body).then((r) => r.data)
export const generatePostContent = (storeId: string, postId: string) =>
  api.post<Post>(`/stores/${storeId}/posts/${postId}/generate`, undefined, { timeout: 180_000 }).then((r) => r.data)
export const deletePost = (storeId: string, postId: string) =>
  api.delete(`/stores/${storeId}/posts/${postId}`).then(() => undefined)
