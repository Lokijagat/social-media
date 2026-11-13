import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Field } from '@/components/form/Field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { addMember, changePassword, errorMessage, listMembers, removeMember, updateMemberRole } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCan, useCurrentStore } from '@/lib/current-store'
import { type Role, ROLES, roleIn } from '@/lib/permissions'

function RoleSelect({ value, onChange, allowOwner, id }: { value: Role; onChange: (r: Role) => void; allowOwner: boolean; id?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)}>
      <SelectTrigger id={id} className="w-full min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value} disabled={r.value === 'owner' && !allowOwner}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const addSchema = z.object({
  email: z.email('Sahi email daalo'),
  name: z.string().trim(),
  password: z.union([z.string().min(8, 'Kam se kam 8 characters'), z.literal('')]),
  role: z.enum(['owner', 'admin', 'editor', 'approver', 'viewer']),
})

function TeamCard({ storeId, storeName }: { storeId: string; storeName: string }) {
  const { me } = useAuth()
  const queryClient = useQueryClient()
  const allowOwner = !!me && (me.isSuperAdmin || roleIn(me, storeId) === 'owner')
  const members = useQuery({ queryKey: ['members', storeId], queryFn: () => listMembers(storeId) })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['members', storeId] })
    queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const form = useForm<z.infer<typeof addSchema>>({
    resolver: zodResolver(addSchema),
    defaultValues: { email: '', name: '', password: '', role: 'editor' },
  })
  const add = useMutation({
    mutationFn: (v: z.infer<typeof addSchema>) =>
      addMember(storeId, { email: v.email, role: v.role, name: v.name || undefined, password: v.password || undefined }),
    onSuccess: (r) => {
      toast.success(r.created ? 'Naya user ban gaya. Email + temporary password unhe khud bhejo.' : 'User store me add ho gaya')
      form.reset()
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => updateMemberRole(storeId, userId, role),
    onSuccess: () => {
      toast.success('Role badal gaya')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeMember(storeId, userId),
    onSuccess: () => {
      toast.success('Member hata diya')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const { errors } = form.formState

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team · {storeName}</CardTitle>
        <CardDescription>Har user ka is store me ek role. Ek user kai stores me ho sakta hai.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {members.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : members.error ? (
          <p className="text-sm text-destructive">{errorMessage(members.error)}</p>
        ) : !members.data?.length ? (
          <p className="text-sm text-muted-foreground">Abhi is store me koi member nahi hai. Super admin ko sab stores dikhte hain.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.map((m) => {
                  const lockedOwner = m.role === 'owner' && !allowOwner
                  return (
                    <TableRow key={m._id}>
                      <TableCell>
                        <div className="font-medium">
                          {m.name} {m._id === me?._id && <Badge variant="outline">You</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </TableCell>
                      <TableCell>
                        {lockedOwner ? (
                          <Badge>Owner</Badge>
                        ) : (
                          <RoleSelect
                            value={m.role}
                            allowOwner={allowOwner}
                            onChange={(role) => changeRole.mutate({ userId: m._id, role })}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${m.name}`}
                          disabled={lockedOwner || remove.isPending}
                          onClick={() => {
                            if (confirm(`${m.name} ko ${storeName} se hatana hai?`)) remove.mutate(m._id)
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <form onSubmit={form.handleSubmit((v) => add.mutate(v))} className="space-y-4 rounded-lg border p-4">
          <div className="text-sm font-medium">Member add karo</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" htmlFor="m-email" error={errors.email?.message}>
              <Input id="m-email" type="email" autoComplete="off" {...form.register('email')} />
            </Field>
            <Field label="Role" htmlFor="m-role" hint={ROLES.find((r) => r.value === form.watch('role'))?.hint}>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => <RoleSelect id="m-role" value={field.value} onChange={field.onChange} allowOwner={allowOwner} />}
              />
            </Field>
            <Field label="Naam (naye user ke liye)" htmlFor="m-name">
              <Input id="m-name" autoComplete="off" {...form.register('name')} />
            </Field>
            <Field
              label="Temporary password (naye user ke liye)"
              htmlFor="m-password"
              error={errors.password?.message}
              hint="User pehle se hai to naam / password ki zaroorat nahi"
            >
              <Input id="m-password" type="password" autoComplete="new-password" {...form.register('password')} />
            </Field>
          </div>
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add member'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

const pwSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password daalo'),
    newPassword: z.string().min(8, 'Kam se kam 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Dono password same nahi hain' })

function PasswordCard() {
  const form = useForm<z.infer<typeof pwSchema>>({
    resolver: zodResolver(pwSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  })
  const m = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success('Password badal gaya. Baaki devices se logout ho gaya.')
      form.reset()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const { errors } = form.formState

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(({ confirm: _c, ...v }) => m.mutate(v))} className="grid gap-4 sm:max-w-sm">
          <Field label="Current password" htmlFor="pw-current" error={errors.currentPassword?.message}>
            <Input id="pw-current" type="password" autoComplete="current-password" {...form.register('currentPassword')} />
          </Field>
          <Field label="New password" htmlFor="pw-new" error={errors.newPassword?.message}>
            <Input id="pw-new" type="password" autoComplete="new-password" {...form.register('newPassword')} />
          </Field>
          <Field label="New password dobara" htmlFor="pw-confirm" error={errors.confirm?.message}>
            <Input id="pw-confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
          </Field>
          <Button type="submit" disabled={m.isPending} className="w-fit">
            {m.isPending ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function SettingsPage() {
  const { currentStore } = useCurrentStore()
  const can = useCan()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {currentStore && can('members.manage') && <TeamCard storeId={currentStore._id} storeName={currentStore.name} />}
      <PasswordCard />
    </div>
  )
}
