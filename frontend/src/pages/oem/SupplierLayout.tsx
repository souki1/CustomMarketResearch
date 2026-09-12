import { Link, NavLink, Outlet } from 'react-router-dom'
import { OEM_OVERVIEW_PATH, SUPPLIER_PATH } from '@/lib/paths'
import { SUPPLIER_NAV } from './deskNav'

export function SupplierLayout() {
  return (
    <div className="flex min-h-full bg-app-bg">
      <aside className="sticky top-0 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 overflow-y-auto border-r border-app-separator bg-app-surface px-3 py-5 md:block">
        <p className="px-2.5 text-xs font-semibold tracking-[0.04em] text-app-ok">SUPPLIER</p>
        <h1 className="mt-1 px-2.5 text-[17px] font-semibold tracking-[-0.02em] text-app-label">
          Vendor portal
        </h1>
        <p className="mt-1 px-2.5 text-xs text-app-secondary">Messicks</p>
        <nav className="mt-4 flex flex-col gap-3.5" aria-label="Supplier portal sections">
          {SUPPLIER_NAV.map((group) => (
            <div key={group.id}>
              <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-app-tertiary">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.id}
                    to={`${SUPPLIER_PATH}/${item.id}`}
                    className={({ isActive }) =>
                      `rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium ${
                        isActive
                          ? 'bg-app-ok-soft text-app-label'
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
              <p className="text-xs font-semibold tracking-[0.04em] text-app-ok">SUPPLIER PORTAL</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-app-label">
                Bid, acknowledge, ship
              </h2>
              <p className="mt-1 max-w-xl text-[13px] text-app-secondary">
                You are logged in as Messicks. This is not the OEM buyer desk. Sample data only.
              </p>
            </div>
            <Link
              to={OEM_OVERVIEW_PATH}
              className="inline-flex h-8 items-center rounded-[8px] border border-app-separator px-3 text-[13px] font-medium text-app-secondary hover:bg-app-fill hover:text-app-label"
            >
              Back to OEM desk
            </Link>
          </div>
          <nav
            className="mt-3 flex gap-1 overflow-x-auto pb-1 md:hidden"
            aria-label="Supplier sections"
          >
            {SUPPLIER_NAV.flatMap((g) => g.items).map((item) => (
              <NavLink
                key={item.id}
                to={`${SUPPLIER_PATH}/${item.id}`}
                className={({ isActive }) =>
                  `shrink-0 rounded-[8px] px-2.5 py-1.5 text-[13px] font-medium ${
                    isActive ? 'bg-app-ok-soft text-app-label' : 'text-app-secondary hover:bg-app-fill'
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
