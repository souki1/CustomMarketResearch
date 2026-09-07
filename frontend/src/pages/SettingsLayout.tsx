import { NavLink, Outlet } from 'react-router-dom'

const SECTIONS = [
  { path: 'profile', label: 'Profile' },
  { path: 'company', label: 'Company' },
  { path: 'billing', label: 'Billing' },
  { path: 'notifications', label: 'Notifications' },
  { path: 'security', label: 'Security' },
] as const

export function SettingsLayout() {
  return (
    <div className="flex min-h-full bg-app-bg">
      <div className="w-56 shrink-0 border-r border-app-separator px-3 py-6">
        <h1 className="px-2.5 text-[22px] font-semibold tracking-[-0.03em] text-app-label">Settings</h1>
        <p className="mt-1 px-2.5 text-xs text-app-secondary">
          Profile, company, billing, and security.
        </p>
        <nav className="mt-5 space-y-0.5" aria-label="Settings sections">
          {SECTIONS.map(({ path, label }) => (
            <NavLink
              key={path}
              to={`/settings/${path}`}
              end={path === 'profile'}
              className={({ isActive }) =>
                `block rounded-[8px] px-2.5 py-2 text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40 ${
                  isActive
                    ? 'bg-app-fill-strong font-semibold text-app-label'
                    : 'font-medium text-app-secondary hover:bg-app-fill hover:text-app-label'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-[720px]">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
