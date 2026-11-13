import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, PlugZap, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { errorMessage, testShopify } from '@/lib/api'
import type { Store } from '@/lib/types'

/** "Test connection" for a saved store: gets a token from Shopify and checks shop name + scopes. */
export function ShopifyConnectionTest({ store, hasUnsavedChanges }: { store: Store; hasUnsavedChanges: boolean }) {
  const queryClient = useQueryClient()
  const s = store.shopify
  const hasCredentials = !!((s?.clientId && s?.clientSecret?.mask) || s?.accessToken?.mask)

  const test = useMutation({
    mutationFn: () => testShopify(store._id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['store', store._id] })
      queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })

  const result = test.data
  const lastOk = !test.isError && !result && s?.shopName && s.scopes

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={!s?.domain || !hasCredentials || hasUnsavedChanges || test.isPending}
          onClick={() => test.mutate()}
        >
          <PlugZap /> {test.isPending ? 'Testing…' : 'Test connection'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {!s?.domain || !hasCredentials
            ? 'Pehle domain + Client ID + Client Secret daal kar save karo.'
            : hasUnsavedChanges
              ? 'Pehle changes save karo, phir test karo.'
              : lastOk
                ? `Last test: connected to ${s.shopName}`
                : 'Shopify se token lekar check karega.'}
        </span>
      </div>

      {test.isError && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-line">{errorMessage(test.error)}</span>
        </p>
      )}

      {result && (
        <div className="space-y-1 text-sm">
          <p className={`flex items-center gap-2 font-medium ${result.ok ? 'text-primary' : 'text-destructive'}`}>
            {result.ok ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
            {result.ok ? `Connected: ${result.shopName}` : `Connected to ${result.shopName}, lekin permissions kam hain`}
          </p>
          <p className="text-muted-foreground">
            {result.myshopifyDomain} · {result.primaryDomain}
          </p>
          <p className="text-muted-foreground">Scopes: {result.scopes.join(', ') || '—'}</p>
          {result.missingScopes.length > 0 && (
            <p className="text-destructive">
              Missing: {result.missingScopes.join(', ')}. Dev Dashboard me app ke scopes me ye jodo, naya version release karo
              aur store par app dobara approve / update karo.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
