import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Field } from '@/components/form/Field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { errorMessage, getSetupStatus, login, setupFirstAdmin } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const loginSchema = z.object({
  email: z.email('Sahi email daalo'),
  password: z.string().min(1, 'Password daalo'),
})

const setupSchema = z
  .object({
    name: z.string().trim().min(1, 'Naam daalo'),
    email: z.email('Sahi email daalo'),
    password: z.string().min(8, 'Kam se kam 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Dono password same nahi hain' })

function LoginForm() {
  const { signedIn } = useAuth()
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const m = useMutation({ mutationFn: login, onSuccess: signedIn })
  const { errors } = form.formState

  return (
    <form onSubmit={form.handleSubmit((v) => m.mutate(v))} className="grid gap-4">
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" autoFocus {...form.register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
      </Field>
      {m.error && <p className="text-sm text-destructive">{errorMessage(m.error)}</p>}
      <Button type="submit" disabled={m.isPending}>
        {m.isPending ? 'Logging in…' : 'Login'}
      </Button>
    </form>
  )
}

function SetupForm() {
  const { signedIn } = useAuth()
  const form = useForm<z.infer<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    defaultValues: { name: '', email: '', password: '', confirm: '' },
  })
  const m = useMutation({ mutationFn: setupFirstAdmin, onSuccess: signedIn })
  const { errors } = form.formState

  return (
    <form onSubmit={form.handleSubmit(({ confirm: _c, ...v }) => m.mutate(v))} className="grid gap-4">
      <Field label="Aapka naam" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoComplete="name" autoFocus {...form.register('name')} />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" {...form.register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Field label="Password dobara" htmlFor="confirm" error={errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
      </Field>
      {m.error && <p className="text-sm text-destructive">{errorMessage(m.error)}</p>}
      <Button type="submit" disabled={m.isPending}>
        {m.isPending ? 'Creating…' : 'Create admin account'}
      </Button>
    </form>
  )
}

export function LoginPage() {
  const status = useQuery({ queryKey: ['setupStatus'], queryFn: getSetupStatus })
  const needsSetup = status.data?.needsSetup

  return (
    <div className="flex min-h-svh items-center justify-center bg-sidebar p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 text-sm font-semibold text-primary">Jagat Social AI</div>
          <CardTitle className="text-xl">{needsSetup ? 'Pehla admin account banao' : 'Login'}</CardTitle>
          {needsSetup && (
            <CardDescription>Ye account Super Admin hoga: saare stores aur users manage kar sakega.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {status.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : status.error ? (
            <p className="text-sm text-destructive">{errorMessage(status.error)}</p>
          ) : needsSetup ? (
            <SetupForm />
          ) : (
            <LoginForm />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
