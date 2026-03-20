import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '@/contexts/ThemeContext'
import { THEME_CARD, THEME_SETTINGS_RAIL } from '@/lib/uiTheme'

const SECTIONS = [
  { path: 'profile', label: 'Profile' },
  { path: 'company', label: 'Company' },
  { path: 'billing', label: 'Billing & subscription' },
  { path: 'notifications', label: 'Notifications' },
  { path: 'security', label: 'Security' },
] as const

export function SettingsLayout() {
  const { theme } = useTheme()
  const st = THEME_SETTINGS_RAIL[theme]
  const focusRing = THEME_CARD[theme].focusRing

  return (
    <div className="flex min-h-full bg-transparent">
      <div className={`w-64 shrink-0 px-4 py-6 ${st.rail}`}>
        <h1 className="text-lg font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-xs text-slate-500">
          Configure your profile, company, billing, and security.
        </p>
        <nav className="mt-5 space-y-0.5" aria-label="Settings sections">
          {SECTIONS.map(({ path, label }) => (
            <NavLink
              key={path}
              to={`/settings/${path}`}
              end={path === 'profile'}
              className={({ isActive }) =>
                `block rounded-r-xl py-2.5 pl-3 pr-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${focusRing} ${
                  isActive ? st.navActive : st.navInactive
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto bg-transparent px-6 py-6">
        <div className="mx-auto w-full max-w-[720px]">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
