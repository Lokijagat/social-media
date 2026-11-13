import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ImageOff, Loader2, Search, ShieldAlert, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field } from '@/components/form/Field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  createPost,
  deletePost,
  errorMessage,
  generatePostContent,
  getPost,
  listPosts,
  listSources,
  type PostSetup,
  updatePost,
} from '@/lib/api'
import { useCan, useCurrentStore } from '@/lib/current-store'
import {
  CONTENT_PROVIDERS,
  LANGUAGES,
  POST_STATUS_LABELS,
  POST_TYPES,
  type ComplianceFlag,
  type Post,
  type SourceItem,
  SOURCE_KIND_FOR_TYPE,
  TARGETS,
  type TargetKey,
} from '@/lib/types'
import { cn } from '@/lib/utils'

const EDITABLE = ['draft', 'needs_review', 'rejected']

const setupSchema = z
  .object({
    type: z.enum(['festival', 'product', 'collection', 'page', 'offer', 'ayurveda_tip', 'blog']),
    festivalName: z.string().trim().max(100),
    festivalDate: z.string(),
    source: z.custom<Pick<SourceItem, '_id' | 'kind' | 'title' | 'imageUrls' | 'price'> | null>(),
    targets: z.array(z.string()).min(1, 'Kam se kam ek platform chuno'),
    contentProvider: z.enum(['claude', 'gpt', 'gemini']),
    language: z.enum(['hi', 'en', 'hinglish']),
    brief: z.string().trim().max(2000),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'festival' && !v.festivalName) ctx.addIssue({ code: 'custom', path: ['festivalName'], message: 'Festival ka naam daalo' })
    const kind = SOURCE_KIND_FOR_TYPE[v.type]
    if (kind && v.source?.kind !== kind) ctx.addIssue({ code: 'custom', path: ['source'], message: `Ek ${kind} chuno` })
  })
type SetupForm = z.infer<typeof setupSchema>

function toSetupForm(post: Post | undefined, defaults: { provider: SetupForm['contentProvider']; language: SetupForm['language'] }): SetupForm {
  return {
    type: post?.type ?? 'product',
    festivalName: post?.festival?.name ?? '',
    festivalDate: post?.festival?.date?.slice(0, 10) ?? '',
    source: post?.sourceItem ?? null,
    targets: post?.targets ?? ['ig_feed', 'ig_story', 'fb_feed'],
    contentProvider: post?.contentProvider ?? defaults.provider,
    language: post?.language ?? defaults.language,
    brief: post?.brief ?? '',
  }
}

function toPayload(v: SetupForm): PostSetup {
  return {
    type: v.type,
    sourceItemId: v.source?._id ?? null,
    festival: v.type === 'festival' ? { name: v.festivalName, date: v.festivalDate || null } : null,
    brief: v.brief,
    language: v.language,
    format: 'image',
    targets: v.targets as TargetKey[],
    contentProvider: v.contentProvider,
  }
}

export function CreatePostPage() {
  const { id } = useParams()
  const { currentStore } = useCurrentStore()
  if (!currentStore) {
    return (
      <p className="text-sm text-muted-foreground">
        Pehle ek store chuno ya <Link to="/stores" className="text-primary underline">store add karo</Link>.
      </p>
    )
  }
  // Remount on store / post change so forms start fresh.
  return <CreatePostScreen key={`${currentStore._id}:${id ?? 'new'}`} storeId={currentStore._id} postId={id} />
}

function CreatePostScreen({ storeId, postId }: { storeId: string; postId?: string }) {
  const { currentStore } = useCurrentStore()
  const can = useCan()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const canCreate = can('post.create')

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['post', storeId, postId],
    queryFn: () => getPost(storeId, postId!),
    enabled: !!postId,
  })
  const editable = !post || EDITABLE.includes(post.status)

  const defaults = {
    provider: (currentStore?.ai.content.provider ?? 'claude') as SetupForm['contentProvider'],
    language: currentStore?.defaultLanguage ?? 'hinglish',
  }
  const form = useForm<SetupForm>({ resolver: zodResolver(setupSchema), defaultValues: toSetupForm(undefined, defaults) })
  useEffect(() => {
    if (post) form.reset(toSetupForm(post, defaults))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?._id])

  const setPost = (p: Post) => {
    queryClient.setQueryData(['post', storeId, p._id], p)
    queryClient.invalidateQueries({ queryKey: ['posts', storeId] })
  }

  // Save setup (create or update), then ask Content AI for 3 options.
  const generate = useMutation({
    mutationFn: async (v: SetupForm) => {
      let current = post
      if (!current) current = await createPost(storeId, toPayload(v))
      else if (form.formState.isDirty) current = await updatePost(storeId, current._id, toPayload(v))
      setPost(current)
      if (!postId) navigate(`/posts/${current._id}`, { replace: true })
      return generatePostContent(storeId, current._id)
    },
    onSuccess: (p) => {
      setPost(p)
      form.reset(toSetupForm(p, defaults))
      toast.success('AI ne 3 options bana diye')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const saveDraft = useMutation({
    mutationFn: async (v: SetupForm) =>
      post ? updatePost(storeId, post._id, toPayload(v)) : createPost(storeId, toPayload(v)),
    onSuccess: (p) => {
      setPost(p)
      form.reset(toSetupForm(p, defaults))
      toast.success('Draft save ho gaya')
      if (!postId) navigate(`/posts/${p._id}`, { replace: true })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: () => deletePost(storeId, post!._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts', storeId] })
      toast.success('Draft delete ho gaya')
      navigate('/posts/new')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (postId && isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (postId && error) return <p className="text-sm text-destructive">{errorMessage(error)}</p>

  const busy = generate.isPending || saveDraft.isPending
  const hasContent = !!post?.contentVariations.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{post ? post.title || 'Post' : 'Create Post'}</h1>
          <p className="text-sm text-muted-foreground">
            Source choose karo → AI content + image banayega → verify → approve
          </p>
        </div>
        {canCreate && editable && (
          <div className="flex flex-wrap gap-2">
            {post && (
              <Button variant="ghost" size="icon" aria-label="Delete draft" disabled={remove.isPending}
                onClick={() => confirm('Ye draft delete karein?') && remove.mutate()}>
                <Trash2 />
              </Button>
            )}
            {post && (
              <Button variant="outline" asChild>
                <Link to="/posts/new">New post</Link>
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={form.handleSubmit((v) => saveDraft.mutate(v))}>
              Save Draft
            </Button>
            <Button disabled={busy} onClick={form.handleSubmit((v) => generate.mutate(v))}>
              {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {generate.isPending ? 'AI likh raha hai…' : hasContent ? 'Regenerate' : 'Generate with AI'}
            </Button>
          </div>
        )}
      </div>

      {!canCreate && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Aapke role me post banane ki permission nahi hai. Aap sirf dekh sakte ho.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <SetupCard form={form} storeId={storeId} disabled={!canCreate || !editable || busy} />
        <OutputCard storeId={storeId} post={post} generating={generate.isPending} canEdit={canCreate && editable} onSaved={setPost} />
        <VerifyCard post={post} />
      </div>

      <QueueCard storeId={storeId} activeId={post?._id} />
    </div>
  )
}

/* ---------------- 1 · Post setup ---------------- */

function SetupCard({
  form,
  storeId,
  disabled,
}: {
  form: ReturnType<typeof useForm<SetupForm>>
  storeId: string
  disabled: boolean
}) {
  const type = useWatch({ control: form.control, name: 'type' })
  const { errors } = form.formState
  const sourceKind = SOURCE_KIND_FOR_TYPE[type]

  return (
    <Card>
      <CardHeader>
        <CardTitle>1 · Post setup</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-5">
          <Field label="Post type">
            <Controller
              control={form.control}
              name="type"
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {POST_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        field.onChange(t.value)
                        // A product can't be the source of a collection post, etc.
                        const kind = SOURCE_KIND_FOR_TYPE[t.value]
                        const src = form.getValues('source')
                        if (src && kind && src.kind !== kind) form.setValue('source', null, { shouldDirty: true })
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60',
                        field.value === t.value
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'hover:bg-muted',
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            />
          </Field>

          {type === 'festival' && (
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Festival" htmlFor="festivalName" error={errors.festivalName?.message}>
                <Input id="festivalName" placeholder="Diwali, Holi, Navratri…" {...form.register('festivalName')} />
              </Field>
              <Field label="Date" htmlFor="festivalDate">
                <Input id="festivalDate" type="date" {...form.register('festivalDate')} />
              </Field>
            </div>
          )}

          <Field
            label={sourceKind ? `Shopify ${sourceKind}` : 'Shopify product / collection (optional)'}
            error={errors.source?.message}
          >
            <Controller
              control={form.control}
              name="source"
              render={({ field }) => (
                <SourcePicker
                  storeId={storeId}
                  kind={sourceKind}
                  value={field.value}
                  onChange={field.onChange}
                  disabled={disabled}
                />
              )}
            />
          </Field>

          <Field label="Platforms & sizes" error={errors.targets?.message}>
            <Controller
              control={form.control}
              name="targets"
              render={({ field }) => (
                <div className="space-y-2.5">
                  {TARGETS.map((t) => {
                    const checked = field.value.includes(t.value)
                    return (
                      <label key={t.value} className="flex items-center gap-3 text-sm">
                        <Checkbox
                          checked={checked}
                          disabled={disabled}
                          onCheckedChange={(c) =>
                            field.onChange(c ? [...field.value, t.value] : field.value.filter((x) => x !== t.value))
                          }
                        />
                        {t.label} · <span className="text-muted-foreground">{t.size.replace('x', '×')}</span>
                      </label>
                    )
                  })}
                  <p className="text-xs text-muted-foreground">WhatsApp, Pinterest, YouTube Shorts: Phase 2</p>
                </div>
              )}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Content AI">
              <Controller
                control={form.control}
                name="contentProvider"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTENT_PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Language">
              <Controller
                control={form.control}
                name="language"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Format" hint="Video: Phase 2">
              <Select value="image" disabled>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Extra instructions (optional)" htmlFor="brief" hint="Jaise: offer 20% off code JAGAT20, ya winter season angle">
            <Textarea id="brief" rows={3} {...form.register('brief')} />
          </Field>
        </fieldset>
      </CardContent>
    </Card>
  )
}

type PickedSource = SetupForm['source']

function SourcePicker({
  storeId,
  kind,
  value,
  onChange,
  disabled,
}: {
  storeId: string
  kind?: 'product' | 'collection' | 'page'
  value: PickedSource
  onChange: (v: PickedSource) => void
  disabled: boolean
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  const { data, isFetching } = useQuery({
    queryKey: ['sources', storeId, { pick: true, kind, q: debounced }],
    queryFn: () => listSources(storeId, { kind: kind ?? 'product', q: debounced || undefined, filter: 'usable', limit: 8 }),
    enabled: open,
  })

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-md border p-2">
        <Thumb url={value.imageUrls[0]} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{value.title}</div>
          <div className="text-xs text-muted-foreground">
            {value.kind}
            {value.price ? ` · ${value.price}` : ''}
          </div>
        </div>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(null)}>
            <X />
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={`Search ${kind ?? 'product'} from Shopify…`}
        className="pl-8"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {isFetching && !data ? (
            <p className="p-2 text-sm text-muted-foreground">Loading…</p>
          ) : !data?.items.length ? (
            <p className="p-2 text-sm text-muted-foreground">
              Kuch nahi mila. <Link to="/sources" className="text-primary underline">Products & Pages</Link> me sync karo.
            </p>
          ) : (
            data.items.map((item) => (
              <button
                key={item._id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item)
                  setQ('')
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 rounded-sm p-1.5 text-left text-sm hover:bg-muted"
              >
                <Thumb url={item.imageUrls[0]} small />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {item.price && <span className="text-xs text-muted-foreground">{item.price}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function shopifyImg(url: string, width: number) {
  return url.includes('cdn.shopify.com') ? `${url}${url.includes('?') ? '&' : '?'}width=${width}` : url
}

function Thumb({ url, small }: { url?: string; small?: boolean }) {
  const size = small ? 'size-8' : 'size-10'
  return url ? (
    <img src={shopifyImg(url, 96)} alt="" className={cn(size, 'shrink-0 rounded border object-cover')} />
  ) : (
    <div className={cn(size, 'flex shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground')}>
      <ImageOff className="size-3.5" />
    </div>
  )
}

/* ---------------- 2 · AI output ---------------- */

const contentSchema = z.object({
  heading: z.string().trim().min(1, 'Heading zaroori hai').max(120),
  caption: z.string().trim().min(1, 'Caption zaroori hai').max(2200),
  hashtags: z.string(),
  cta: z.string().trim().max(60),
})
type ContentForm = z.infer<typeof contentSchema>

const toContentForm = (post?: Post): ContentForm => ({
  heading: post?.content?.heading ?? '',
  caption: post?.content?.caption ?? '',
  hashtags: (post?.content?.hashtags ?? []).join(' '),
  cta: post?.content?.cta ?? '',
})

function OutputCard({
  storeId,
  post,
  generating,
  canEdit,
  onSaved,
}: {
  storeId: string
  post?: Post
  generating: boolean
  canEdit: boolean
  onSaved: (p: Post) => void
}) {
  const form = useForm<ContentForm>({ resolver: zodResolver(contentSchema), defaultValues: toContentForm(post) })
  const { errors, isDirty } = form.formState
  useEffect(() => {
    form.reset(toContentForm(post))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.updatedAt])

  const save = useMutation({
    mutationFn: (body: Parameters<typeof updatePost>[2]) => updatePost(storeId, post!._id, body),
    onSuccess: (p, body) => {
      onSaved(p)
      if (body.content) toast.success(p.compliance?.passed ? 'Save ho gaya' : 'Save ho gaya, lekin compliance issue hai')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const heading = useWatch({ control: form.control, name: 'heading' })
  const photo = post?.sourceItem?.imageUrls[0]
  const targets = TARGETS.filter((t) => post?.targets.includes(t.value))

  return (
    <Card>
      <CardHeader>
        <CardTitle>2 · AI output preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {generating ? (
          <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            AI 3 options likh raha hai… (15–60 sec)
          </div>
        ) : !post?.contentVariations.length ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Left me setup bharo aur <b>Generate with AI</b> dabao.
            <br />
            Heading, caption, hashtags aur CTA yahan aayenge.
          </div>
        ) : (
          <>
            {/* Rough layout preview with the real product photo. Real creatives come from Image AI (next step). */}
            <div className="flex flex-wrap items-end gap-3">
              {targets.map((t) => (
                <div key={t.value} className="space-y-1 text-center">
                  <div
                    className="relative w-24 overflow-hidden rounded-md border bg-muted"
                    style={{ aspectRatio: t.ratio }}
                  >
                    {photo && <img src={shopifyImg(photo, 300)} alt="" className="absolute inset-0 size-full object-contain p-2" />}
                    <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-1 text-[8px] leading-tight font-semibold text-white">
                      {heading}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{t.label.replace('Instagram', 'IG').replace('Facebook', 'FB')}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Ye sirf rough preview hai. Asli image Image AI banayega (agla step).</p>

            <div className="flex flex-wrap gap-2">
              {post.contentVariations.map((v, i) => {
                const blocks = v.flags.filter((f) => f.severity === 'block').length
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!canEdit || save.isPending}
                    title={v.angle}
                    onClick={() => {
                      if (i === post.selectedVariation) return
                      if (isDirty && !confirm('Aapke edits hat jayenge. Option badlein?')) return
                      save.mutate({ selectedVariation: i })
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm',
                      i === post.selectedVariation ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted',
                    )}
                  >
                    Option {i + 1}
                    {blocks ? (
                      <ShieldAlert className="size-3.5 text-destructive" />
                    ) : (
                      <ShieldCheck className="size-3.5 text-primary" />
                    )}
                  </button>
                )
              })}
            </div>
            {post.selectedVariation !== undefined && post.contentVariations[post.selectedVariation]?.angle && (
              <p className="-mt-2 text-xs text-muted-foreground">Idea: {post.contentVariations[post.selectedVariation].angle}</p>
            )}

            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((v) =>
                save.mutate({
                  content: {
                    heading: v.heading,
                    caption: v.caption,
                    cta: v.cta,
                    hashtags: v.hashtags.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`)),
                  },
                }),
              )}
            >
              <fieldset disabled={!canEdit} className="space-y-4">
                <Field label="Heading (image par)" htmlFor="heading" error={errors.heading?.message}>
                  <Input id="heading" {...form.register('heading')} />
                </Field>
                <Field label="Description / Caption" htmlFor="caption" error={errors.caption?.message}>
                  <Textarea id="caption" rows={9} {...form.register('caption')} />
                </Field>
                <Field label="Hashtags" htmlFor="hashtags">
                  <Textarea id="hashtags" rows={2} {...form.register('hashtags')} />
                </Field>
                <Field label="CTA" htmlFor="cta" error={errors.cta?.message}>
                  <Input id="cta" {...form.register('cta')} />
                </Field>
                {post.content?.utmUrl && (
                  <Field label="Link (UTM ke saath)">
                    <a href={post.content.utmUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-primary underline">
                      {post.content.utmUrl}
                    </a>
                  </Field>
                )}
                {canEdit && (
                  <div className="flex items-center gap-3">
                    <Button type="submit" variant="outline" disabled={!isDirty || save.isPending}>
                      {save.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                    {isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
                  </div>
                )}
              </fieldset>
            </form>
            <p className="text-xs text-muted-foreground">
              {post.content?.model}
              {post.aiCostUsd > 0 ? ` · AI cost $${post.aiCostUsd.toFixed(3)}` : ''}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------------- 3 · Verify + 4 · Approve ---------------- */

const FIELD_LABEL: Record<ComplianceFlag['field'], string> = {
  heading: 'Heading',
  caption: 'Caption',
  hashtags: 'Hashtags',
  cta: 'CTA',
}

function VerifyCard({ post }: { post?: Post }) {
  const flags = post?.compliance?.flags ?? []
  const checked = !!post?.compliance?.checkedAt
  const passed = !!post?.compliance?.passed
  const imageChecks = ['Product & label sahi', 'Logo & brand colors', 'Text spelling & safe zone', 'Size & resolution', 'Caption ↔ image match']

  return (
    <Card>
      <CardHeader>
        <CardTitle>3 · Verify AI report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div
            className={cn(
              'flex items-center justify-between rounded-md px-3 py-2.5 text-sm',
              !checked ? 'bg-muted/60' : passed ? 'bg-primary/10' : 'bg-destructive/10',
            )}
          >
            <span>Ayurveda claim compliance</span>
            <span className={cn('font-semibold', !checked ? 'text-muted-foreground' : passed ? 'text-primary' : 'text-destructive')}>
              {!checked ? 'Pending' : passed ? (flags.length ? 'Pass (warnings)' : 'Pass') : 'Fail'}
            </span>
          </div>
          {flags.length > 0 && (
            <ul className="space-y-1.5 pl-1 text-xs">
              {flags.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <Badge variant={f.severity === 'block' ? 'destructive' : 'secondary'} className="shrink-0">
                    {f.severity === 'block' ? 'Block' : 'Warn'}
                  </Badge>
                  <span>
                    {FIELD_LABEL[f.field]}: "<b>{f.term}</b>". {f.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {checked && !passed && (
            <p className="text-xs text-muted-foreground">
              Block wale shabd caption se hatao aur "Save changes" dabao, ya doosra option chuno.
            </p>
          )}
          {imageChecks.map((c) => (
            <div key={c} className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2.5 text-sm">
              <span>{c}</span>
              <span className="text-muted-foreground">Image ke baad</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Image AI + Verify AI (score 0–100, "Fix with AI") agle step me ban rahe hain.
          </p>
        </div>

        <div className="space-y-3 border-t pt-4">
          <h3 className="font-medium">4 · Approve & schedule</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" disabled aria-label="Date" />
            <Input type="time" disabled aria-label="Time" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button disabled>
              <Check /> Approve & Schedule
            </Button>
            <Button variant="outline" disabled>
              Post Now
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Image + verify ke baad approval aur Facebook/Instagram publish chalu hoga.</p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------------- Queue ---------------- */

function QueueCard({ storeId, activeId }: { storeId: string; activeId?: string }) {
  const navigate = useNavigate()
  const { data: posts, isLoading } = useQuery({ queryKey: ['posts', storeId], queryFn: () => listPosts(storeId) })

  return (
    <Card className="py-0">
      <CardHeader className="pt-6">
        <CardTitle>Recent posts</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading…</p>
        ) : !posts?.length ? (
          <p className="p-6 text-sm text-muted-foreground">Abhi koi post nahi bani.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Post</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Platforms</TableHead>
                <TableHead>Compliance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((p) => (
                <TableRow
                  key={p._id}
                  className={cn('cursor-pointer', p._id === activeId && 'bg-muted/50')}
                  onClick={() => navigate(`/posts/${p._id}`)}
                >
                  <TableCell className="max-w-64 truncate pl-6 font-medium">{p.title}</TableCell>
                  <TableCell>{POST_TYPES.find((t) => t.value === p.type)?.label ?? p.type}</TableCell>
                  <TableCell>
                    {TARGETS.filter((t) => p.targets?.includes(t.value))
                      .map((t) => t.label.replace('Instagram', 'IG').replace('Facebook', 'FB'))
                      .join(', ')}
                  </TableCell>
                  <TableCell>
                    {p.compliance?.passed === undefined ? '—' : p.compliance.passed ? (
                      <Badge variant="outline">Pass</Badge>
                    ) : (
                      <Badge variant="destructive">Fail</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{POST_STATUS_LABELS[p.status] ?? p.status}</Badge>
                  </TableCell>
                  <TableCell className="pr-6 text-muted-foreground">
                    {new Date(p.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
