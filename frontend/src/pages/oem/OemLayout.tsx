import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  OEM_PATH,
  PURCHASE_ORDER_PATH,
  RESEARCH_COMPARE_PATH,
  SUPPLIER_HOME_PATH,
} from '@/lib/paths'
import { OEM_NAV } from './deskNav'

export function OemLayout() {
  return (
    <div className="flex min-h-full bg-app-bg">
      <aside className="sticky top-0 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 overflow-y-auto border-r border-app-separator bg-app-surface px-3 py-5 md:block">
        <p className="px-2.5 text-xs font-semibold tracking-[0.04em] text-app-tertiary">OEM</p>
        <h1 className="mt-1 px-2.5 text-[17px] font-semibold tracking-[-0.02em] text-app-label">
          Buyer desk
        </h1>
        <nav className="mt-4 flex flex-col gap-3.5" aria-label="OEM desk sections">
          {OEM_NAV.map((group) => (
            <div key={group.id}>
              <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-app-tertiary">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.id}
                    to={`${OEM_PATH}/${item.id}`}
                    className={({ isActive }) =>
                      `rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium ${
                        isActive
                          ? 'bg-app-fill-strong text-app-label'
                          : 'text-app-secondary hover:bg-app-fill hover:text-app-label'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-b border-app-separator bg-app-surface px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.04em] text-app-tertiary">OEM BUYER</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-app-label">
                Source, buy, and pay
              </h2>
              <p className="mt-1 max-w-xl text-[13px] text-app-secondary">
                Your plant-side workspace. Sample data only — not saved. Suppliers work in a
                separate portal.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={SUPPLIER_HOME_PATH}
                className="inline-flex h-8 items-center rounded-[8px] border border-app-separator px-3 text-[13px] font-medium text-app-secondary hover:bg-app-fill hover:text-app-label"
              >
                Open supplier portal
              </Link>
              <Link
                to={RESEARCH_COMPARE_PATH}
                className="inline-flex h-8 items-center rounded-[8px] border border-app-separator px-3 text-[13px] font-medium text-app-secondary hover:bg-app-fill hover:text-app-label"
              >
                Compare vendors
              </Link>
              <Link
                to={PURCHASE_ORDER_PATH}
                className="inline-flex h-8 items-center rounded-[8px] bg-app-accent px-3 text-[13px] font-medium text-white hover:bg-app-accent-hover"
              >
                Purchase orders
              </Link>
            </div>
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto pb-1 md:hidden" aria-label="OEM sections">
            {OEM_NAV.flatMap((g) => g.items).map((item) => (
              <NavLink
                key={item.id}
                to={`${OEM_PATH}/${item.id}`}
                className={({ isActive }) =>
                  `shrink-0 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium ${
                    isActive
                      ? 'bg-app-fill-strong text-app-label'
                      : 'text-app-secondary hover:bg-app-fill'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
        <div className="px-5 py-5 sm:px-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
