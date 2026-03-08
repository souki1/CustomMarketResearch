import { NavLink, Outlet } from 'react-router-dom'

const SECTIONS = [
  { path: 'profile', label: 'Profile' },
  { path: 'company', label: 'Company' },
  { path: 'billing', label: 'Billing & subscription' },
  { path: 'notifications', label: 'Notifications' },
  { path: 'security', label: 'Security' },
] as const

export function SettingsLayout() {
  return (
    <div className="flex min-h-full bg-white">
      <div className="w-64 shrink-0 border-r border-gray-200 bg-white px-4 py-6">
        <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
        <p className="mt-1 text-xs text-gray-500">
          Configure your profile, company, billing, and security.
        </p>
        <nav className="mt-5 space-y-0.5" aria-label="Settings sections">
          {SECTIONS.map(({ path, label }) => (
            <NavLink
              key={path}
              to={`/settings/${path}`}
              end={path === 'profile'}
              className={({ isActive }) =>
                `block rounded-r-lg border-l-2 py-2.5 pl-3 pr-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                  isActive
                    ? 'border-blue-600 bg-blue-50/80 font-semibold text-gray-900'
                    : 'border-transparent font-medium text-gray-700 hover:bg-gray-100'
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
