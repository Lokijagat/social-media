import { Link } from 'react-router-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuth } from '@/lib/auth'
import { useCurrentStore } from '@/lib/current-store'

export function StoreSwitcher() {
  const { stores, currentStore, setCurrentStoreId, isLoading } = useCurrentStore()
  const { me } = useAuth()

  if (isLoading) return <div className="h-9 rounded-lg bg-sidebar-accent/60" />
  if (!stores.length)
    return !me?.isSuperAdmin ? (
      <div className="px-3 py-2 text-xs text-sidebar-foreground/60">Koi store assigned nahi</div>
    ) : (
      <Link to="/stores/new" className="block rounded-lg border border-dashed border-sidebar-border px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
        + Pehla store add karo
      </Link>
    )

  return (
    <Select value={currentStore?._id} onValueChange={setCurrentStoreId}>
      <SelectTrigger aria-label="Current store" className="h-9 w-full border-sidebar-border bg-sidebar-accent text-sidebar-foreground">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stores.map((s) => (
          <SelectItem key={s._id} value={s._id}>
            {s.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
