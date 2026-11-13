import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { errorMessage, listStores } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { LANGUAGES } from '@/lib/types'

function Connected({ ok }: { ok: boolean }) {
  return ok ? <Badge>Connected</Badge> : <Badge variant="secondary">Not connected</Badge>
}

export function StoresPage() {
  const navigate = useNavigate()
  const { me } = useAuth()
  const { data: stores, isLoading, error } = useQuery({ queryKey: ['stores'], queryFn: listStores })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stores</h1>
          <p className="text-sm text-muted-foreground">Har store ka apna Shopify, Meta, AI keys aur budget.</p>
        </div>
        {me?.isSuperAdmin && (
          <Button asChild>
            <Link to="/stores/new">
              <Plus /> Add store
            </Link>
          </Button>
        )}
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{errorMessage(error)}</p>
          ) : !stores?.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              {me?.isSuperAdmin ? (
                <>
                  Abhi koi store nahi hai. <Link to="/stores/new" className="font-medium text-primary underline">Pehla store add karo</Link>
                </>
              ) : (
                'Aapko abhi kisi store me add nahi kiya gaya hai. Admin se kaho.'
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Store</TableHead>
                  <TableHead>Shopify</TableHead>
                  <TableHead>Meta</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Budget / month</TableHead>
                  <TableHead className="pr-6">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow key={s._id} className="cursor-pointer" onClick={() => navigate(`/stores/${s._id}`)}>
                    <TableCell className="pl-6">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.shopify?.domain || s.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Connected ok={!!s.shopify?.scopes?.length} />
                    </TableCell>
                    <TableCell>
                      <Connected ok={!!s.meta?.accessToken?.mask} />
                    </TableCell>
                    <TableCell>{LANGUAGES.find((l) => l.value === s.defaultLanguage)?.label}</TableCell>
                    <TableCell>${s.budget.monthlyLimitUsd}</TableCell>
                    <TableCell className="pr-6">
                      {s.active ? <Badge variant="outline">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
