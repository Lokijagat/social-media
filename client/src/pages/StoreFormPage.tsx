import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field } from '@/components/form/Field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ShopifyConnectionTest } from '@/components/ShopifyConnectionTest'
import { createStore, errorMessage, getStore, type StorePayload, updateStore } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { useCan, useCurrentStore } from '@/lib/current-store'
import {
  AI_KEY_PROVIDERS,
  type AiKeyProvider,
  CONTENT_PROVIDERS,
  IMAGE_PROVIDERS,
  LANGUAGES,
  type Store,
  VERIFY_PROVIDERS,
} from '@/lib/types'

const optionalUrl = z.union([z.url('Poora URL daalo, https:// ke saath'), z.literal('')])

const schema = z.object({
  name: z.string().trim().min(1, 'Store ka naam daalo'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug daalo')
    .regex(/^[a-z0-9-]+$/, 'Sirf small letters, numbers aur dash (-)'),
  timezone: z.string().trim().min(1),
  defaultLanguage: z.enum(['hi', 'en', 'hinglish']),
  active: z.boolean(),
  shopifyDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^$|^[a-z0-9-]+\.myshopify\.com$/, 'Format: yourstore.myshopify.com'),
  storefrontUrl: optionalUrl,
  shopifyClientId: z.string().trim(),
  shopifyClientSecret: z.string().trim(),
  shopifyToken: z.string().trim(),
  facebookPageId: z.string().trim(),
  instagramBusinessId: z.string().trim(),
  metaToken: z.string().trim(),
  contentProvider: z.string(),
  contentModel: z.string().trim(),
  imageProvider: z.string(),
  imageModel: z.string().trim(),
  verifyProvider: z.string(),
  verifyModel: z.string().trim(),
  keys: z.record(z.string(), z.string().trim()),
  monthlyLimitUsd: z.number('Number daalo').min(0),
  postsPerWeekTarget: z.number('Number daalo').int().min(0).max(50),
})
type FormValues = z.infer<typeof schema>

const emptyKeys = Object.fromEntries(AI_KEY_PROVIDERS.map((p) => [p.value, ''])) as Record<AiKeyProvider, string>

const defaults: FormValues = {
  name: '',
  slug: '',
  timezone: 'Asia/Kolkata',
  defaultLanguage: 'hi',
  active: true,
  shopifyDomain: '',
  storefrontUrl: '',
  shopifyClientId: '',
  shopifyClientSecret: '',
  shopifyToken: '',
  facebookPageId: '',
  instagramBusinessId: '',
  metaToken: '',
  contentProvider: 'claude',
  contentModel: '',
  imageProvider: 'gemini_image',
  imageModel: '',
  verifyProvider: 'claude',
  verifyModel: '',
  keys: emptyKeys,
  monthlyLimitUsd: 50,
  postsPerWeekTarget: 7,
}

function fromStore(s: Store): FormValues {
  return {
    ...defaults,
    name: s.name,
    slug: s.slug,
    timezone: s.timezone,
    defaultLanguage: s.defaultLanguage,
    active: s.active,
    shopifyDomain: s.shopify?.domain ?? '',
    storefrontUrl: s.shopify?.storefrontUrl ?? '',
    shopifyClientId: s.shopify?.clientId ?? '',
    facebookPageId: s.meta?.facebookPageId ?? '',
    instagramBusinessId: s.meta?.instagramBusinessId ?? '',
    contentProvider: s.ai.content.provider,
    contentModel: s.ai.content.model ?? '',
    imageProvider: s.ai.image.provider,
    imageModel: s.ai.image.model ?? '',
    verifyProvider: s.ai.verify.provider,
    verifyModel: s.ai.verify.model ?? '',
    monthlyLimitUsd: s.budget.monthlyLimitUsd,
    postsPerWeekTarget: s.budget.postsPerWeekTarget,
  }
}

/** Builds the API body. Empty optional fields are left out; secrets are sent only when typed. */
function toPayload(v: FormValues): StorePayload {
  const opt = (x: string) => x || undefined
  const keys = Object.fromEntries(Object.entries(v.keys).filter(([, val]) => val))
  return {
    name: v.name,
    slug: v.slug,
    timezone: v.timezone,
    defaultLanguage: v.defaultLanguage,
    active: v.active,
    shopify: {
      domain: opt(v.shopifyDomain),
      storefrontUrl: opt(v.storefrontUrl),
      clientId: opt(v.shopifyClientId),
      clientSecret: opt(v.shopifyClientSecret),
      accessToken: opt(v.shopifyToken),
    },
    meta: {
      facebookPageId: opt(v.facebookPageId),
      instagramBusinessId: opt(v.instagramBusinessId),
      accessToken: opt(v.metaToken),
    },
    ai: {
      content: { provider: v.contentProvider, model: opt(v.contentModel) },
      image: { provider: v.imageProvider, model: opt(v.imageModel) },
      verify: { provider: v.verifyProvider, model: opt(v.verifyModel) },
      ...(Object.keys(keys).length ? { keys } : {}),
    },
    budget: { monthlyLimitUsd: v.monthlyLimitUsd, postsPerWeekTarget: v.postsPerWeekTarget },
  }
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

function SecretHint({ mask }: { mask?: string }) {
  return mask ? (
    <>
      Saved: <code className="font-mono">{mask}</code>. Badalna ho to naya daalo, warna khaali chhodo.
    </>
  ) : (
    'Encrypted save hoga. Baad me sirf masked dikhega.'
  )
}

function ProviderSelect({
  value,
  onChange,
  options,
  id,
}: {
  value: string
  onChange: (v: string) => void
  options: readonly { value: string; label: string }[]
  id: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function StoreFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setCurrentStoreId } = useCurrentStore()
  const can = useCan()
  const readOnly = !isNew && !can('store.manage', id)

  const storeQuery = useQuery({ queryKey: ['store', id], queryFn: () => getStore(id!), enabled: !isNew })
  const store = storeQuery.data

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    getFieldState,
    formState: { errors, isDirty },
  } = form

  useEffect(() => {
    if (store) reset(fromStore(store))
  }, [store, reset])

  const save = useMutation({
    mutationFn: (v: FormValues) => (isNew ? createStore(toPayload(v)) : updateStore(id!, toPayload(v))),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['stores'] })
      queryClient.setQueryData(['store', saved._id], saved)
      toast.success(isNew ? 'Store ban gaya' : 'Store save ho gaya')
      if (isNew) {
        setCurrentStoreId(saved._id)
        navigate(`/stores/${saved._id}`, { replace: true })
      } else reset(fromStore(saved))
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (!isNew && storeQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!isNew && storeQuery.error) return <p className="text-sm text-destructive">{errorMessage(storeQuery.error)}</p>

  const nameField = register('name', {
    onChange: (e) => {
      if (isNew && !getFieldState('slug').isDirty) setValue('slug', slugify(e.target.value))
    },
  })

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link to="/stores" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Stores
          </Link>
          <h1 className="text-2xl font-semibold">{isNew ? 'Add store' : store?.name}</h1>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button type="button" variant="outline" asChild>
              <Link to="/brand-kit" onClick={() => setCurrentStoreId(id!)}>
                Brand Kit
              </Link>
            </Button>
          )}
          {readOnly ? (
            <Badge variant="secondary">View only</Badge>
          ) : (
            <Button type="submit" disabled={save.isPending || (!isNew && !isDirty)}>
              {save.isPending ? 'Saving…' : isNew ? 'Create store' : 'Save changes'}
            </Button>
          )}
        </div>
      </div>

      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" placeholder="Jagat Pharma" {...nameField} />
          </Field>
          <Field label="Slug" htmlFor="slug" error={errors.slug?.message} hint="Unique short id, e.g. jagat-pharma">
            <Input id="slug" {...register('slug')} />
          </Field>
          <Field label="Default language" htmlFor="defaultLanguage" hint="Har post me badal sakte ho">
            <Controller
              control={control}
              name="defaultLanguage"
              render={({ field }) => (
                <ProviderSelect id="defaultLanguage" value={field.value} onChange={field.onChange} options={LANGUAGES} />
              )}
            />
          </Field>
          <Field label="Timezone" htmlFor="timezone" error={errors.timezone?.message}>
            <Input id="timezone" {...register('timezone')} />
          </Field>
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
                Active (paused store par koi post generate / publish nahi hogi)
              </label>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shopify</CardTitle>
          <CardDescription>
            Shopify Dev Dashboard app ke Client ID + Client Secret. Scopes: <code>read_products</code>, <code>read_content</code>.
            Token server khud banata aur refresh karta hai.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Shopify domain" htmlFor="shopifyDomain" error={errors.shopifyDomain?.message} hint="Hamesha .myshopify.com wala address">
            <Input id="shopifyDomain" placeholder="jagatpharma.myshopify.com" {...register('shopifyDomain')} />
          </Field>
          <Field label="Website URL" htmlFor="storefrontUrl" error={errors.storefrontUrl?.message} hint="UTM links isi par banenge">
            <Input id="storefrontUrl" placeholder="https://www.jagatpharma.com" {...register('storefrontUrl')} />
          </Field>
          <Field label="Client ID" htmlFor="shopifyClientId">
            <Input id="shopifyClientId" autoComplete="off" className="font-mono" {...register('shopifyClientId')} />
          </Field>
          <Field label="Client Secret" htmlFor="shopifyClientSecret" hint={<SecretHint mask={store?.shopify?.clientSecret?.mask} />}>
            <Input id="shopifyClientSecret" type="password" autoComplete="off" {...register('shopifyClientSecret')} />
          </Field>
          <details className="text-sm sm:col-span-2">
            <summary className="cursor-pointer text-muted-foreground">Purana custom app hai (2026 se pehle bana, shpat_ token)?</summary>
            <div className="mt-3">
              <Field
                label="Legacy Admin API access token"
                htmlFor="shopifyToken"
                hint={<SecretHint mask={store?.shopify?.accessToken?.mask} />}
              >
                <Input id="shopifyToken" type="password" autoComplete="off" placeholder="shpat_…" {...register('shopifyToken')} />
              </Field>
              <p className="mt-2 text-xs text-muted-foreground">Client ID + Secret dono bhare hon to wahi use honge, ye token nahi.</p>
            </div>
          </details>
          {!isNew && store && (
            <div className="sm:col-span-2">
              <ShopifyConnectionTest store={store} hasUnsavedChanges={isDirty} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meta (Facebook + Instagram)</CardTitle>
          <CardDescription>Page ID, IG Business account ID aur long-lived page access token</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Facebook Page ID" htmlFor="facebookPageId">
            <Input id="facebookPageId" inputMode="numeric" {...register('facebookPageId')} />
          </Field>
          <Field label="Instagram Business ID" htmlFor="instagramBusinessId">
            <Input id="instagramBusinessId" inputMode="numeric" {...register('instagramBusinessId')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Page access token" htmlFor="metaToken" hint={<SecretHint mask={store?.meta?.accessToken?.mask} />}>
              <Input id="metaToken" type="password" autoComplete="off" placeholder="EAAG…" {...register('metaToken')} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI models</CardTitle>
          <CardDescription>Default models. Create Post screen par har post ke liye badal sakte ho.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['contentProvider', 'contentModel', 'Content AI', CONTENT_PROVIDERS],
              ['imageProvider', 'imageModel', 'Image AI', IMAGE_PROVIDERS],
              ['verifyProvider', 'verifyModel', 'Verify AI', VERIFY_PROVIDERS],
            ] as const
          ).map(([providerName, modelName, label, options]) => (
            <div key={providerName} className="contents">
              <Field label={label} htmlFor={providerName}>
                <Controller
                  control={control}
                  name={providerName}
                  render={({ field }) => (
                    <ProviderSelect id={providerName} value={field.value} onChange={field.onChange} options={options} />
                  )}
                />
              </Field>
              <Field label={`${label} model (optional)`} htmlFor={modelName} hint="Khaali = provider ka default model">
                <Input id={modelName} {...register(modelName)} />
              </Field>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI API keys</CardTitle>
          <CardDescription>Is store ki apni keys (client ka billing alag rahe). Khaali = platform key use hogi.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {AI_KEY_PROVIDERS.map((p) => (
            <Field key={p.value} label={p.label} htmlFor={`key-${p.value}`} hint={<SecretHint mask={store?.ai.keys?.[p.value]?.mask} />}>
              <Input id={`key-${p.value}`} type="password" autoComplete="off" {...register(`keys.${p.value}`)} />
            </Field>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Monthly AI budget (USD)" htmlFor="monthlyLimitUsd" error={errors.monthlyLimitUsd?.message}>
            <Input id="monthlyLimitUsd" type="number" min={0} step="1" {...register('monthlyLimitUsd', { valueAsNumber: true })} />
          </Field>
          <Field label="Posts per week (target)" htmlFor="postsPerWeekTarget" error={errors.postsPerWeekTarget?.message} hint="Plan: 7–14">
            <Input id="postsPerWeekTarget" type="number" min={0} step="1" {...register('postsPerWeekTarget', { valueAsNumber: true })} />
          </Field>
        </CardContent>
      </Card>
      </fieldset>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending || (!isNew && !isDirty)}>
            {save.isPending ? 'Saving…' : isNew ? 'Create store' : 'Save changes'}
          </Button>
        </div>
      )}
    </form>
  )
}
