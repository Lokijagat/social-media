import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Palette,
  PlusSquare,
  Plug,
  Settings,
  Store,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/lib/auth'
import { useCurrentStore } from '@/lib/current-store'
import { ROLES, roleIn } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import { StoreSwitcher } from './StoreSwitcher'

// Order and names follow the dashboard mockup (docs/Dashboard–Create-Post.png), plus Products & Pages (Shopify data).
const nav = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/posts/new', label: 'Create Post', icon: PlusSquare },
  { to: '/sources', label: 'Products & Pages', icon: Package },
  { to: '/approvals', label: 'Approval Queue', icon: CheckCircle2 },
  { to: '/calendar', label: 'Content Calendar', icon: CalendarDays },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/brand-kit', label: 'Brand Kit & Media', icon: Palette },
  { to: '/ai-models', label: 'AI Models & Prompts', icon: Bot },
  { to: '/integrations', label: 'Integrations', icon: Plug },
  { to: '/stores', label: 'Stores', icon: Store },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function UserBox() {
  const { me, signOut } = useAuth()
  const { currentStore } = useCurrentStore()
  if (!me) return null
  const role = me.isSuperAdmin ? 'Super Admin' : ROLES.find((r) => r.value === roleIn(me, currentStore?._id))?.label

  return (
    <div className="flex items-center gap-2 border-t border-sidebar-border px-3 py-4">
      <div className="min-w-0 flex-1 px-2">
        <div className="truncate text-sm font-medium">{me.name}</div>
        <div className="truncate text-xs text-sidebar-foreground/60">{role ?? me.email}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Logout"
        title="Logout"
        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={() => signOut()}
      >
        <LogOut />
      </Button>
    </div>
  )
}

function MobileBar() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <header className="flex items-center gap-2 bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Menu" className="text-sidebar-foreground hover:bg-sidebar-accent">
            <Menu />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {nav.map(({ to, label, icon: Icon }) => (
            <DropdownMenuItem key={to} onSelect={() => navigate(to)}>
              <Icon /> {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => signOut()}>
            <LogOut /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="font-semibold">Jagat Social AI</span>
      <div className="ml-auto w-40">
        <StoreSwitcher />
      </div>
    </header>
  )
}

export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40 text-foreground md:flex-row">
      <MobileBar />
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-6 pt-6 pb-4 text-lg font-semibold">Jagat Social AI</div>
        <div className="px-3 pb-4">
          <StoreSwitcher />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  isActive && 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <UserBox />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  )
}
