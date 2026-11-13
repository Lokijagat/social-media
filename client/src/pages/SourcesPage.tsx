import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ImageOff, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field } from '@/components/form/Field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  addManualSource,
  deleteSource,
  errorMessage,
  listSources,
  type SourceFilter,
  syncSources,
} from '@/lib/api'
import { useCan, useCurrentStore } from '@/lib/current-store'
import { SOURCE_KINDS, type SourceItem, type SourceKind } from '@/lib/types'

const PAGE_SIZE = 25

const FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Sab' },
  { value: 'usable', label: 'Post ke layak (active + in stock)' },
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'draft', label: 'Draft / archived' },
  { value: 'manual', label: 'Manual entries' },
]

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function timeAgo(iso?: string) {
  if (!iso) return 'kabhi nahi'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'abhi'
  if (min < 60) return `${min} min pehle`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ghante pehle`
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function StatusBadges({ item }: { item: SourceItem }) {
  return (
    <div className="flex flex-wrap gap-1">
      {item.origin === 'manual' && <Badge variant="outline">Manual</Badge>}
      {item.shopifyStatus === 'draft' && <Badge variant="secondary">Draft</Badge>}
      {item.shopifyStatus === 'archived' && <Badge variant="secondary">Archived</Badge>}
      {item.kind === 'product' && !item.inStock && <Badge variant="destructive">Out of stock</Badge>}
      {item.shopifyStatus === 'active' && item.inStock && item.origin === 'shopify' && <Badge>Active</Badge>}
    </div>
  )
}

export function SourcesPage() {
  const { currentStore, isLoading: storesLoading } = useCurrentStore()
  const can = useCan()
  const queryClient = useQueryClient()
  const storeId = currentStore?._id

  const [kind, setKind] = useState<SourceKind>('product')
  const [filter, setFilter] = useState<SourceFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounced(search.trim())

  // New search / tab / filter starts again from page 1.
  useEffect(() => setPage(1), [kind, filter, q, storeId])

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['sources', storeId, { kind, filter, q, page }],
    queryFn: () => listSources(storeId!, { kind, filter, q: q || undefined, page, limit: PAGE_SIZE }),
    enabled: !!storeId,
    placeholderData: keepPreviousData,
  })

  const sync = useMutation({
    mutationFn: () => syncSources(storeId!),
    onSuccess: (r) => {
      toast.success(
        `Sync ho gaya: ${r.products} products, ${r.collections} collections, ${r.pages} pages` +
          (r.removed ? ` (${r.removed} hataye gaye)` : ''),
      )
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['sources', storeId] })
      queryClient.invalidateQueries({ queryKey: ['stores'] })
    },
  })

  const remove = useMutation({
    mutationFn: (itemId: string) => deleteSource(storeId!, itemId),
    onSuccess: () => toast.success('Hata diya'),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['sources', storeId] }),
  })

  if (storesLoading) return null
  if (!currentStore) {
    return (
      <p className="text-sm text-muted-foreground">
        Pehle ek store chuno ya <Link to="/stores" className="text-primary underline">store add karo</Link>.
      </p>
    )
  }

  const canEdit = can('post.create')
  const shopifyReady = !!currentStore.shopify?.scopes?.length
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Products & Pages</h1>
          <p className="text-sm text-muted-foreground">
            Shopify se aaye products, collections aur pages. Inhi par posts banenge. Last sync:{' '}
            {timeAgo(currentStore.shopify?.lastSyncedAt)}
          </p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <ManualItemDialog storeId={currentStore._id} defaultKind={kind} />
            <Button onClick={() => sync.mutate()} disabled={!shopifyReady || sync.isPending}>
              <RefreshCw className={sync.isPending ? 'animate-spin' : undefined} />
              {sync.isPending ? 'Sync ho raha hai…' : 'Sync from Shopify'}
            </Button>
          </div>
        )}
      </div>

      {!shopifyReady && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Is store ka Shopify abhi connected nahi hai.{' '}
            <Link to={`/stores/${currentStore._id}`} className="font-medium text-primary underline">
              Store settings
            </Link>{' '}
            me Client ID + Secret daal kar "Test connection" karo. Tab tak manual entry add kar sakte ho.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as SourceKind)}>
          <TabsList>
            {SOURCE_KINDS.map((k) => (
              <TabsTrigger key={k.value} value={k.value}>
                {k.label}
                {data?.counts && <span className="ml-1 text-muted-foreground">{data.counts[k.value]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Naam se search karo…"
            className="pl-8"
            aria-label="Search"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as SourceFilter)}>
          <SelectTrigger className="w-56" aria-label="Filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="py-0">
        <CardContent className="px-0">
          {isLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="p-6 text-sm text-destructive">{errorMessage(error)}</p>
          ) : !data?.items.length ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              {q || filter !== 'all'
                ? 'Is search / filter me kuch nahi mila.'
                : shopifyReady
                  ? 'Abhi kuch nahi hai. "Sync from Shopify" dabao.'
                  : 'Abhi kuch nahi hai.'}
            </p>
          ) : (
            <Table className={isFetching ? 'opacity-70 transition-opacity' : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 pl-6">Photo</TableHead>
                  <TableHead>Naam</TableHead>
                  {kind === 'product' && <TableHead>Price</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 pr-6 text-right">Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item._id}>
                    <TableCell className="pl-6">
                      {item.imageUrls[0] ? (
                        <img
                          src={`${item.imageUrls[0]}${item.imageUrls[0].includes('?') ? '&' : '?'}width=96`}
                          alt=""
                          loading="lazy"
                          className="size-10 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex size-10 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                          <ImageOff className="size-4" />
                        </div>
                      )}
                    </TableCell>
                    {/* w-full + max-w-0 lets the cell shrink so long text truncates instead of overflowing */}
                    <TableCell className="w-full max-w-0">
                      <div className="truncate font-medium" title={item.title}>
                        {item.title}
                      </div>
                      {item.description && (
                        <div className="truncate text-xs text-muted-foreground" title={item.description}>
                          {item.description}
                        </div>
                      )}
                    </TableCell>
                    {kind === 'product' && <TableCell className="whitespace-nowrap">{item.price ?? '—'}</TableCell>}
                    <TableCell>
                      <StatusBadges item={item} />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" aria-label="Website par kholo">
                          <a href={item.url} target="_blank" rel="noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                        {canEdit && item.origin === 'manual' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (confirm(`"${item.title}" hata dein?`)) remove.mutate(item._id)
                            }}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.total > data.limit && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * data.limit + 1}–{Math.min(page * data.limit, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

const optionalUrl = z.union([z.url('Poora URL daalo (https://…)'), z.literal('')])
const manualSchema = z.object({
  kind: z.enum(['product', 'collection', 'page']),
  title: z.string().trim().min(1, 'Naam zaroori hai').max(200),
  url: z.url('Poora URL daalo (https://…)'),
  imageUrl: optionalUrl,
  price: z.string().trim().max(50),
  description: z.string().trim().max(5000),
})
type ManualForm = z.infer<typeof manualSchema>

/** Add a product / collection / page that isn't on Shopify (or before Shopify is connected). */
function ManualItemDialog({ storeId, defaultKind }: { storeId: string; defaultKind: SourceKind }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const form = useForm<ManualForm>({
    resolver: zodResolver(manualSchema),
    defaultValues: { kind: defaultKind, title: '', url: '', imageUrl: '', price: '', description: '' },
  })
  const { errors } = form.formState

  const add = useMutation({
    mutationFn: (v: ManualForm) =>
      addManualSource(storeId, {
        kind: v.kind,
        title: v.title,
        url: v.url,
        description: v.description || undefined,
        price: v.kind === 'product' && v.price ? v.price : undefined,
        imageUrls: v.imageUrl ? [v.imageUrl] : undefined,
      }),
    onSuccess: () => {
      toast.success('Add ho gaya')
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ['sources', storeId] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) form.reset({ kind: defaultKind, title: '', url: '', imageUrl: '', price: '', description: '' })
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus /> Manual add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual entry</DialogTitle>
          <DialogDescription>Jo cheez Shopify me nahi hai, uska naam aur link yahan daalo.</DialogDescription>
        </DialogHeader>
        <form id="manual-source" className="space-y-4" onSubmit={form.handleSubmit((v) => add.mutate(v))}>
          <Field label="Type">
            <Controller
              control={form.control}
              name="kind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label.slice(0, -1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Naam" htmlFor="ms-title" error={errors.title?.message}>
            <Input id="ms-title" {...form.register('title')} />
          </Field>
          <Field label="URL" htmlFor="ms-url" error={errors.url?.message}>
            <Input id="ms-url" placeholder="https://…" {...form.register('url')} />
          </Field>
          <Field label="Photo URL (optional)" htmlFor="ms-img" error={errors.imageUrl?.message} hint="Asli product photo ka link">
            <Input id="ms-img" placeholder="https://…" {...form.register('imageUrl')} />
          </Field>
          {form.watch('kind') === 'product' && (
            <Field label="Price (optional)" htmlFor="ms-price">
              <Input id="ms-price" placeholder="₹499" {...form.register('price')} />
            </Field>
          )}
          <Field label="Description (optional)" htmlFor="ms-desc" error={errors.description?.message}>
            <Textarea id="ms-desc" rows={3} {...form.register('description')} />
          </Field>
        </form>
        <DialogFooter>
          <Button type="submit" form="manual-source" disabled={add.isPending}>
            {add.isPending ? 'Saving…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
