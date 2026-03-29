import { Link, useLocation } from 'react-router-dom'
import { RESEARCH_COMPARE_PATH } from '@/lib/paths'

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
function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6m4 6V9m4 10V5M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}
function AnalysisIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5M4 19h16M8 15v-4m4 4V9m4 6v-6" />
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
function AiIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 20v-2m7.07-9H21M3 12h2m14.07 6.07l-1.41-1.41M6.34 6.34L4.93 4.93m14.14 0l-1.41 1.41M6.34 17.66l-1.41 1.41" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 14.5a4 4 0 01-5.66 0 4 4 0 010-5.66 4 4 0 015.66 0 4 4 0 010 5.66z" />
    </svg>
  )
}
function PortfolioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6m6 6v-6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18v13a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 7l2-4h6l2 4" />
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
  collapsed?: boolean
}

const linkClass = (active: boolean) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`

const collapsedLinkClass = (active: boolean) =>
  `flex items-center justify-center rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${active ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-100'}`

export function Sidebar({ open, collapsed = false }: SidebarProps) {
  const iconClass = 'h-5 w-5 shrink-0 text-gray-500'
  const location = useLocation()
  const isHome = location.pathname === '/'
  const isResearch = location.pathname === '/research'
  const isCompare = location.pathname === RESEARCH_COMPARE_PATH
  const isReports = location.pathname === '/reports'
  const isAnalysis = location.pathname === '/analysis'
  const isPurchaseOrder = location.pathname === '/purchase-order'
  const isAi = location.pathname === '/ai'
  const isPortfolio = location.pathname === '/portfolio'
  const isSettings = location.pathname.startsWith('/settings')

  if (collapsed) {
    return (
      <aside
        className="h-full min-h-0 w-14 shrink-0 border-r border-gray-200 bg-white"
        aria-label="Collapsed sidebar"
      >
        <div className="flex h-full min-h-0 flex-col py-4">
          <nav className="flex flex-col items-center gap-1 px-2">
            <Link to="/" className={collapsedLinkClass(isHome)} title="Home">
              <HomeIcon className={iconClass} />
            </Link>
            <Link to="/research" className={collapsedLinkClass(isResearch)} title="Research">
              <ResearchIcon className={iconClass} />
            </Link>
            <Link to={RESEARCH_COMPARE_PATH} className={collapsedLinkClass(isCompare)} title="Compare">
              <CompareIcon className={iconClass} />
            </Link>
            <Link to="/reports" className={collapsedLinkClass(isReports)} title="Reports">
              <ReportsIcon className={iconClass} />
            </Link>
            <Link to="/analysis" className={collapsedLinkClass(isAnalysis)} title="Analysis">
              <AnalysisIcon className={iconClass} />
            </Link>
            <Link to="/ai" className={collapsedLinkClass(isAi)} title="AI">
              <AiIcon className={iconClass} />
            </Link>
            <Link to="/portfolio" className={collapsedLinkClass(isPortfolio)} title="Portfolio">
              <PortfolioIcon className={iconClass} />
            </Link>
            <Link to="/purchase-order" className={collapsedLinkClass(isPurchaseOrder)} title="Purchase Order">
              <PurchaseOrderIcon className={iconClass} />
            </Link>
            <Link to="/settings" className={collapsedLinkClass(isSettings)} title="Settings">
              <SettingsIcon className={iconClass} />
            </Link>
          </nav>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={`h-full min-h-0 w-56 shrink-0 border-r border-gray-200 bg-white transition-transform duration-200 ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      aria-label="Sidebar"
      aria-hidden={!open}
    >
      <div className="flex h-full min-h-0 flex-col py-4">
        <nav className="flex flex-col gap-1 px-2">
          <Link to="/" className={linkClass(isHome)} title="Home">
            <HomeIcon className={iconClass} />
            <span>Home</span>
          </Link>
          <Link to="/research" className={linkClass(isResearch)} title="Research">
            <ResearchIcon className={iconClass} />
            <span>Research</span>
          </Link>
          <Link to={RESEARCH_COMPARE_PATH} className={linkClass(isCompare)} title="Compare">
            <CompareIcon className={iconClass} />
            <span>Compare</span>
          </Link>
          <Link to="/reports" className={linkClass(isReports)} title="Reports">
            <ReportsIcon className={iconClass} />
            <span>Reports</span>
          </Link>
          <Link to="/analysis" className={linkClass(isAnalysis)} title="Analysis">
            <AnalysisIcon className={iconClass} />
            <span>Analysis</span>
          </Link>
          <Link to="/ai" className={linkClass(isAi)} title="AI">
            <AiIcon className={iconClass} />
            <span>AI</span>
          </Link>
          <Link to="/portfolio" className={linkClass(isPortfolio)} title="Portfolio">
            <PortfolioIcon className={iconClass} />
            <span>Portfolio</span>
          </Link>
          <Link to="/purchase-order" className={linkClass(isPurchaseOrder)} title="Purchase Order">
            <PurchaseOrderIcon className={iconClass} />
            <span>Purchase Order</span>
          </Link>
          <Link to="/settings" className={linkClass(isSettings)} title="Settings">
            <SettingsIcon className={iconClass} />
            <span>Settings</span>
          </Link>
        </nav>
      </div>
    </aside>
  )
}
