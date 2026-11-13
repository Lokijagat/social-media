import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createContext, type ReactNode, useCallback, useContext, useEffect } from 'react'
import { api, getMe, logout as apiLogout } from './api'
import type { Me } from './permissions'

type AuthValue = {
  me: Me | null
  isLoading: boolean
  /** Call after a successful login/setup with the user the server returned. */
  signedIn: (me: Me) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const { data: me = null, isLoading } = useQuery({ queryKey: ['me'], queryFn: getMe, staleTime: 5 * 60 * 1000 })

  // Any 401 from the API (session expired / logged out elsewhere) sends the user back to login.
  useEffect(() => {
    const id = api.interceptors.response.use(undefined, (err) => {
      if (isAxiosError(err) && err.response?.status === 401 && !err.config?.url?.startsWith('/auth/')) {
        queryClient.setQueryData(['me'], null)
      }
      return Promise.reject(err)
    })
    return () => api.interceptors.response.eject(id)
  }, [queryClient])

  const signedIn = useCallback(
    (user: Me) => {
      queryClient.clear()
      queryClient.setQueryData(['me'], user)
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      queryClient.clear()
      queryClient.setQueryData(['me'], null)
    }
  }, [queryClient])

  return <AuthContext.Provider value={{ me, isLoading, signedIn, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
