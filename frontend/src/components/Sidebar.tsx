import { Link, useLocation } from 'react-router-dom'

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
function ResearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}
function CompareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
    </svg>
  )
}
function PurchaseOrderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

type SidebarProps = {
  open: boolean
}

export function Sidebar({ open }: SidebarProps) {
  const iconClass = 'h-5 w-5 shrink-0 text-gray-500'
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isResearch = location.pathname === '/research'
  const isCompare = location.pathname === '/compare'
  const isPurchaseOrder = location.pathname === '/purchase-order'
  const isSettings = location.pathname.startsWith('/settings')

  return (
    <aside
      className={`w-56 shrink-0 border-r border-gray-200 bg-white min-h-[calc(100vh-3.5rem)] transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      aria-label="Sidebar"
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col py-4">
        <nav className="flex flex-col gap-1 px-2">
          <Link
            to="/"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${isHome ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
            title="Home"
          >
            <HomeIcon className={iconClass} />
            <span>Home</span>
          </Link>
          <Link
            to="/research"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${isResearch ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
            title="Research"
          >
            <ResearchIcon className={iconClass} />
            <span>Research</span>
          </Link>
          <Link
            to="/compare"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${isCompare ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
            title="Compare"
          >
            <CompareIcon className={iconClass} />
            <span>Compare</span>
          </Link>
          <Link
            to="/purchase-order"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${isPurchaseOrder ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
            title="Purchase Order"
          >
            <PurchaseOrderIcon className={iconClass} />
            <span>Purchase Order</span>
          </Link>
          <Link
            to="/settings"
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${isSettings ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`}
            title="Settings"
          >
            <SettingsIcon className={iconClass} />
            <span>Settings</span>
          </Link>
        </nav>
      </div>
    </aside>
  )
}
