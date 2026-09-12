import {
  Archive,
  Factory,
  Files,
  GitCompare,
  Heart,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  BUCKET_PATH,
  FILES_PATH,
  OEM_OVERVIEW_PATH,
  OEM_PATH,
  PARTS_CATALOG_PATH,
  PURCHASE_ORDER_PATH,
  RESEARCH_COMPARE_PATH,
  SUPPLIER_HOME_PATH,
  SUPPLIER_PATH,
  WISHLIST_PATH,
} from '@/lib/paths'

const ICON = 18
const STROKE = 1.75

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  match: (path: string) => boolean
}

type NavGroup = {
  id: string
  label: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/' },
      { to: FILES_PATH, label: 'Files', icon: Files, match: (p) => p === FILES_PATH },
      { to: '/research', label: 'Research', icon: Search, match: (p) => p === '/research' },
      {
        to: PARTS_CATALOG_PATH,
        label: 'Parts Catalog',
        icon: Package,
        match: (p) => p === PARTS_CATALOG_PATH,
      },
    ],
  },
  {
    id: 'decide',
    label: 'Decide',
    items: [
      {
        to: RESEARCH_COMPARE_PATH,
        label: 'Compare',
        icon: GitCompare,
        match: (p) => p === RESEARCH_COMPARE_PATH,
      },
      { to: '/reports', label: 'Reports', icon: LineChart, match: (p) => p === '/reports' },
      { to: '/portfolio', label: 'Portfolio', icon: LayoutGrid, match: (p) => p === '/portfolio' },
      { to: WISHLIST_PATH, label: 'Wishlist', icon: Heart, match: (p) => p === WISHLIST_PATH },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    items: [
      {
        to: OEM_OVERVIEW_PATH,
        label: 'OEM desk',
        icon: Factory,
        match: (p) => p.startsWith(OEM_PATH),
      },
      {
        to: SUPPLIER_HOME_PATH,
        label: 'Supplier portal',
        icon: Store,
        match: (p) => p.startsWith(SUPPLIER_PATH),
      },
      {
        to: PURCHASE_ORDER_PATH,
        label: 'Orders',
        icon: ShoppingCart,
        match: (p) => p.startsWith(PURCHASE_ORDER_PATH),
      },
      {
        to: BUCKET_PATH,
        label: 'Bucket',
        icon: Archive,
        match: (p) => p === BUCKET_PATH,
      },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { to: '/ai', label: 'AI', icon: Sparkles, match: (p) => p === '/ai' },
      { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
    ],
  },
]

type SidebarProps = {
  open: boolean
  collapsed?: boolean
}

function linkClass(active: boolean, collapsed: boolean) {
  const base = collapsed
    ? 'flex h-9 w-9 items-center justify-center rounded-[8px] focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/50'
    : 'flex h-8 items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] font-medium tracking-[-0.01em] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-accent/50'
  if (active) {
    return `${base} bg-app-fill-strong text-app-label`
  }
  return `${base} text-app-secondary hover:bg-app-fill hover:text-app-label`
}

export function Sidebar({ open, collapsed = false }: SidebarProps) {
  const location = useLocation()

  if (collapsed) {
    return (
      <aside className="h-full min-h-0 w-14 shrink-0 border-r border-app-separator bg-app-sidebar" aria-label="Sidebar">
        <nav className="flex h-full min-h-0 flex-col items-center gap-4 overflow-y-auto px-2 py-3">
          {GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col items-center gap-1" role="group" aria-label={group.label}>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = item.match(location.pathname)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={linkClass(active, true)}
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                    title={item.label}
                  >
                    <Icon size={ICON} strokeWidth={STROKE} aria-hidden />
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
    )
  }

  return (
    <aside
      className={`h-full min-h-0 w-56 shrink-0 border-r border-app-separator bg-app-sidebar transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      aria-label="Sidebar"
      aria-hidden={!open}
    >
      <nav className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-3 py-3">
        {GROUPS.map((group) => (
          <div key={group.id} role="group" aria-labelledby={`nav-${group.id}`}>
            <p
              id={`nav-${group.id}`}
              className="mb-1 px-2.5 text-xs font-semibold tracking-[0.04em] text-app-tertiary"
            >
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                const active = item.match(location.pathname)
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={linkClass(active, false)}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon
                      size={ICON}
                      strokeWidth={STROKE}
                      className={active ? 'text-app-accent' : 'text-app-tertiary'}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  )
}
