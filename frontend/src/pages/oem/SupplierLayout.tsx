import { AppScroll } from '@/components/AppScroll'
import { Link, Outlet } from 'react-router-dom'
import { OEM_OVERVIEW_PATH, SUPPLIER_PATH } from '@/lib/paths'
import { SUPPLIER_NAV } from './deskNav'
import { DeskSectionNav } from './oemUi'

export function SupplierLayout() {
  return (
    <div className="flex min-h-full bg-app-bg">
      <aside className="sticky top-0 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-app-separator bg-app-surface md:block">
        <AppScroll className="h-full" contentClassName="px-3 py-5">
        <p className="px-2.5 text-xs font-semibold tracking-[0.04em] text-app-ok">SUPPLIER</p>
        <h1 className="mt-1 px-2.5 text-[17px] font-semibold tracking-[-0.02em] text-app-label">
          Vendor portal
        </h1>
        <p className="mt-1 px-2.5 text-xs text-app-secondary">Messicks</p>
        <div className="mt-4">
          <DeskSectionNav
            groups={SUPPLIER_NAV}
            basePath={SUPPLIER_PATH}
            ariaLabel="Supplier portal sections"
            activeClassName="bg-app-ok-soft text-app-label"
          />
        </div>
        </AppScroll>
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
          <div className="mt-3 md:hidden">
            <DeskSectionNav
              groups={SUPPLIER_NAV}
              basePath={SUPPLIER_PATH}
              ariaLabel="Supplier sections"
              activeClassName="bg-app-ok-soft text-app-label"
              compact
            />
          </div>
        </header>
        <div className="px-5 py-5 sm:px-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
