import { useQuery } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { listStores } from './api'
import { useAuth } from './auth'
import { can, type Permission } from './permissions'
import type { Store } from './types'

const STORAGE_KEY = 'currentStoreId'

type CurrentStoreValue = {
  stores: Store[]
  isLoading: boolean
  currentStore: Store | undefined
  setCurrentStoreId: (id: string) => void
}

const CurrentStoreContext = createContext<CurrentStoreValue | null>(null)

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** The store the user is working on. Remembered per browser; falls back to the first store. */
export function CurrentStoreProvider({ children }: { children: ReactNode }) {
  const { data: stores = [], isLoading } = useQuery({ queryKey: ['stores'], queryFn: listStores })
  const [selectedId, setSelectedId] = useState<string | null>(readSaved)

  const currentStore = stores.find((s) => s._id === selectedId) ?? stores[0]

  useEffect(() => {
    if (!currentStore) return
    try {
      localStorage.setItem(STORAGE_KEY, currentStore._id)
    } catch {
      // storage unavailable (private mode); selection just won't persist
    }
  }, [currentStore])

  return (
    <CurrentStoreContext.Provider value={{ stores, isLoading, currentStore, setCurrentStoreId: setSelectedId }}>
      {children}
    </CurrentStoreContext.Provider>
  )
}

export function useCurrentStore() {
  const ctx = useContext(CurrentStoreContext)
  if (!ctx) throw new Error('useCurrentStore must be used inside CurrentStoreProvider')
  return ctx
}

/** Permission check for a store (defaults to the current store). UI hint only; the server enforces it. */
export function useCan() {
  const { me } = useAuth()
  const { currentStore } = useCurrentStore()
  return (permission: Permission, storeId: string | undefined = currentStore?._id) => can(me, storeId, permission)
}
