import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field } from '@/components/form/Field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage, getBrandKit, saveBrandKit } from '@/lib/api'
import { useCan, useCurrentStore } from '@/lib/current-store'
import type { BrandKit } from '@/lib/types'

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex color, jaise #1f6f43')
const optionalUrl = z.union([z.url('Poora URL daalo, https:// ke saath'), z.literal('')])

const schema = z.object({
  logoUrl: optionalUrl,
  logoLightUrl: optionalUrl,
  colors: z.object({ primary: hex, secondary: hex, accent: hex, text: hex }),
  fonts: z.object({ heading: z.string().trim(), body: z.string().trim(), hindi: z.string().trim() }),
  tone: z.string().trim().max(500),
  defaultHashtags: z.string(),
  defaultCta: z.string().trim().max(60),
  disclaimer: z.string().trim().max(300),
  bannedWords: z.string(),
  imageStyleNotes: z.string().trim().max(1000),
})
type FormValues = z.infer<typeof schema>

/** "#ayurveda, herbal  #wellness" -> ["#ayurveda", "#herbal", "#wellness"] */
const splitList = (s: string) =>
  s
    .split(/[,\n]+|\s+(?=#)/)
    .map((x) => x.trim())
    .filter(Boolean)

function fromKit(k: BrandKit): FormValues {
  return {
    logoUrl: k.logoUrl ?? '',
    logoLightUrl: k.logoLightUrl ?? '',
    colors: k.colors,
    fonts: k.fonts,
    tone: k.tone ?? '',
    defaultHashtags: k.defaultHashtags.join(' '),
    defaultCta: k.defaultCta ?? '',
    disclaimer: k.disclaimer ?? '',
    bannedWords: k.bannedWords.join(', '),
    imageStyleNotes: k.imageStyleNotes ?? '',
  }
}

const COLOR_FIELDS = [
  ['primary', 'Primary', 'Heading, buttons'],
  ['secondary', 'Secondary', 'Background'],
  ['accent', 'Accent', 'CTA, highlights'],
  ['text', 'Text', 'Body text'],
] as const

function Preview({ v, storeName }: { v: FormValues; storeName: string }) {
  const valid = (c: string, fallback: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback)
  const primary = valid(v.colors.primary, '#1f6f43')
  const secondary = valid(v.colors.secondary, '#f4e9d8')
  const accent = valid(v.colors.accent, '#c8962e')
  const text = valid(v.colors.text, '#1a1a1a')
  const tags = splitList(v.defaultHashtags).slice(0, 4)

  return (
    <div className="space-y-3">
      <div
        className="relative flex aspect-[4/5] w-full flex-col justify-between overflow-hidden rounded-xl border p-6 shadow-sm"
        style={{ background: secondary, color: text, fontFamily: `${v.fonts.body}, sans-serif` }}
      >
        <div className="flex items-center justify-between">
          {v.logoUrl ? (
            <img src={v.logoUrl} alt="Logo" className="h-10 max-w-[50%] object-contain" />
          ) : (
            <span className="text-sm font-semibold" style={{ color: primary }}>
              {storeName}
            </span>
          )}
        </div>

        <div className="mx-auto flex aspect-square w-1/2 items-center justify-center rounded-lg border-2 border-dashed text-center text-xs opacity-60" style={{ borderColor: primary }}>
          Asli product photo
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl leading-tight font-bold" style={{ color: primary, fontFamily: `${v.fonts.heading}, sans-serif` }}>
            Is Diwali, apnon ko dijiye sehat ka tohfa
          </h3>
          <span className="inline-block rounded-md px-4 py-2 text-sm font-semibold text-white" style={{ background: accent }}>
            {v.defaultCta || 'Shop now'}
          </span>
          {v.disclaimer && <p className="text-[10px] leading-snug opacity-70">{v.disclaimer}</p>}
        </div>
      </div>
      {tags.length > 0 && <p className="text-sm text-primary">{tags.join(' ')}</p>}
      <p className="text-xs text-muted-foreground">Sirf colors / fonts / text ka andaaza. Asli creative Image AI banayega.</p>
    </div>
  )
}

export function BrandKitPage() {
  const { currentStore, isLoading: storesLoading } = useCurrentStore()
  const storeId = currentStore?._id
  const can = useCan()
  const readOnly = !can('store.manage')
  const queryClient = useQueryClient()

  const kitQuery = useQuery({ queryKey: ['brandKit', storeId], queryFn: () => getBrandKit(storeId!), enabled: !!storeId })

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })
  const values = useWatch({ control }) as FormValues

  useEffect(() => {
    if (kitQuery.data) reset(fromKit(kitQuery.data))
  }, [kitQuery.data, reset])

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      saveBrandKit(storeId!, {
        ...v,
        defaultHashtags: splitList(v.defaultHashtags),
        bannedWords: splitList(v.bannedWords),
      }),
    onSuccess: (kit) => {
      queryClient.setQueryData(['brandKit', storeId], kit)
      reset(fromKit(kit))
      toast.success('Brand kit save ho gaya')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (storesLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!currentStore)
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Brand Kit & Media</h1>
        <p className="text-sm text-muted-foreground">
          Abhi aapke paas koi store nahi hai. <Link to="/stores" className="font-medium text-primary underline">Stores</Link>
        </p>
      </div>
    )
  if (kitQuery.error) return <p className="text-sm text-destructive">{errorMessage(kitQuery.error)}</p>
  if (!kitQuery.data || !values?.colors) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Brand Kit & Media</h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant="outline" className="mr-2">{currentStore.name}</Badge>
            Content AI aur Image AI har post me yahi settings use karenge.
          </p>
        </div>
        {readOnly ? (
          <Badge variant="secondary">View only</Badge>
        ) : (
          <Button type="submit" disabled={save.isPending || !isDirty}>
            {save.isPending ? 'Saving…' : 'Save brand kit'}
          </Button>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <fieldset disabled={readOnly} className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>Abhi public image URL daalo. Upload Cloudinary setup ke baad aayega.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Logo URL" htmlFor="logoUrl" error={errors.logoUrl?.message}>
                <Input id="logoUrl" placeholder="https://…/logo.png" {...register('logoUrl')} />
              </Field>
              <Field label="Logo for dark backgrounds" htmlFor="logoLightUrl" error={errors.logoLightUrl?.message}>
                <Input id="logoLightUrl" placeholder="https://…/logo-white.png" {...register('logoLightUrl')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Colors</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {COLOR_FIELDS.map(([key, label, hint]) => (
                <Field key={key} label={label} htmlFor={`color-${key}`} hint={hint} error={errors.colors?.[key]?.message}>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      aria-label={`${label} color picker`}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                      value={/^#[0-9a-fA-F]{6}$/.test(values.colors[key]) ? values.colors[key] : '#000000'}
                      onChange={(e) => setValue(`colors.${key}`, e.target.value, { shouldDirty: true, shouldValidate: true })}
                    />
                    <Input id={`color-${key}`} className="font-mono" {...register(`colors.${key}`)} />
                  </div>
                </Field>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fonts</CardTitle>
              <CardDescription>Google Fonts ke naam</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field label="Heading" htmlFor="font-heading">
                <Input id="font-heading" {...register('fonts.heading')} />
              </Field>
              <Field label="Body" htmlFor="font-body">
                <Input id="font-body" {...register('fonts.body')} />
              </Field>
              <Field label="Hindi (Devanagari)" htmlFor="font-hindi">
                <Input id="font-hindi" {...register('fonts.hindi')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand voice</CardTitle>
              <CardDescription>Content AI ke prompt me jayega</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Tone" htmlFor="tone" error={errors.tone?.message}>
                <Textarea id="tone" rows={2} {...register('tone')} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Default hashtags" htmlFor="defaultHashtags" hint="Space ya comma se alag karo">
                  <Input id="defaultHashtags" placeholder="#ayurveda #jagatpharma" {...register('defaultHashtags')} />
                </Field>
                <Field label="Default CTA" htmlFor="defaultCta" error={errors.defaultCta?.message}>
                  <Input id="defaultCta" placeholder="Shop now" {...register('defaultCta')} />
                </Field>
              </div>
              <Field label="Disclaimer" htmlFor="disclaimer" hint="Health posts ke neeche, jaise: Use karne se pehle doctor se salah lein." error={errors.disclaimer?.message}>
                <Input id="disclaimer" {...register('disclaimer')} />
              </Field>
              <Field
                label="Extra banned words"
                htmlFor="bannedWords"
                hint="Comma se alag karo. Ye global compliance list (cure, guaranteed, 100%…) ke upar extra block honge."
              >
                <Textarea id="bannedWords" rows={2} placeholder="miracle, instant result" {...register('bannedWords')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Image style</CardTitle>
              <CardDescription>Image AI ke liye background / scene guidance. Product khud kabhi AI se nahi banega.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field label="Style notes" htmlFor="imageStyleNotes" error={errors.imageStyleNotes?.message}>
                <Textarea
                  id="imageStyleNotes"
                  rows={4}
                  placeholder="Warm natural light, wooden table, fresh herbs aur leaves, minimal props, earthy tones"
                  {...register('imageStyleNotes')}
                />
              </Field>
            </CardContent>
          </Card>
        </fieldset>

        <div className="lg:sticky lg:top-8">
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <Preview v={values} storeName={currentStore.name} />
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  )
}
