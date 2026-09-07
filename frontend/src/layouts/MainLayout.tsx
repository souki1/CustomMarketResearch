import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CommandPalette, Navbar, Sidebar } from '@/components'
import { BucketProvider } from '@/contexts/BucketContext'
import { ComparisonProvider } from '@/contexts/ComparisonContext'
import { LayoutProvider, useLayout } from '@/contexts/LayoutContext'
import { getCurrentUserEmail, syncWorkspaceOwner } from '@/lib/auth'

const SIDEBAR_OPEN_KEY = 'sidebar-open'

const OpenCommandPaletteContext = createContext<(() => void) | null>(null)

/** Opens the global command palette (Ctrl+K). Only available under MainLayout. */
export function useOpenCommandPalette(): (() => void) | null {
  return useContext(OpenCommandPaletteContext)
}

function pageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard'
  if (pathname.startsWith('/research/compare') || pathname === '/compare') return 'Compare'
  if (pathname.startsWith('/research')) return 'Research'
  if (pathname.startsWith('/files')) return 'Files'
  if (pathname.startsWith('/parts-catalog')) return 'Parts Catalog'
  if (pathname.startsWith('/reports')) return 'Reports'
  if (pathname.startsWith('/bucket')) return 'Bucket'
  if (pathname.startsWith('/ai')) return 'AI'
  if (pathname.startsWith('/portfolio')) return 'Portfolio'
  if (pathname.startsWith('/wishlist')) return 'Wishlist'
  if (pathname.startsWith('/settings')) return 'Settings'
  if (pathname.startsWith('/purchase-order')) return 'Purchase Order'
  return 'Intelligent Research'
}

function MainLayoutContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const prevPathnameRef = useRef<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_OPEN_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const [sidebarOpenBeforeInspector, setSidebarOpenBeforeInspector] = useState<boolean | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const { collapseSidebarForInspector, setCollapseSidebarForInspector } = useLayout()

  useEffect(() => {
    document.title = `${pageTitle(location.pathname)} — Intelligent Research`
  }, [location.pathname])

  useEffect(() => {
    syncWorkspaceOwner(getCurrentUserEmail())
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        navigate('/settings')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  useEffect(() => {
    const prev = prevPathnameRef.current
    prevPathnameRef.current = location.pathname
    if (prev === '/research' && location.pathname !== '/research') {
      setCollapseSidebarForInspector(false)
      setSidebarOpenBeforeInspector(null)
      setSidebarOpen(true)
    }
  }, [location.pathname, setCollapseSidebarForInspector])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(sidebarOpen))
    } catch {
      // ignore
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (!collapseSidebarForInspector) {
      if (sidebarOpenBeforeInspector != null) {
        setSidebarOpen(sidebarOpenBeforeInspector)
        setSidebarOpenBeforeInspector(null)
      }
    } else if (sidebarOpenBeforeInspector == null) {
      setSidebarOpenBeforeInspector(sidebarOpen)
    }
  }, [collapseSidebarForInspector, sidebarOpenBeforeInspector, sidebarOpen])

  const showSidebar = sidebarOpen && !collapseSidebarForInspector

  const handleSidebarToggle = () => {
    if (!showSidebar) {
      setCollapseSidebarForInspector(false)
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }

  return (
    <OpenCommandPaletteContext.Provider value={openCommandPalette}>
      <BucketProvider>
        <ComparisonProvider>
          <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
          <Navbar
            sidebarOpen={showSidebar}
            onSidebarToggle={handleSidebarToggle}
            onOpenCommandPalette={openCommandPalette}
          />
          <div className="flex bg-app-bg">
            <div
              className={`sticky top-14 flex h-[calc(100vh-3.5rem)] shrink-0 transition-[width] duration-200 ease-out ${showSidebar ? 'w-56' : 'w-14'}`}
            >
              <div className="h-full w-full overflow-hidden">
                <Sidebar open={showSidebar} collapsed={!showSidebar} />
              </div>
            </div>
            <main className="min-h-[calc(100vh-3.5rem)] min-w-0 flex-1 bg-app-bg">
              <Outlet />
            </main>
          </div>
        </ComparisonProvider>
      </BucketProvider>
    </OpenCommandPaletteContext.Provider>
  )
}

/**
 * Renders Navbar and Sidebar once. Only the <Outlet /> (main content) updates
 * when the route or page content changes — sidebar and navbar do not re-mount or re-render.
 * Sidebar can be collapsed by the Research inspector on /research; other routes expand it again.
 */
export function MainLayout() {
  return (
    <LayoutProvider>
      <MainLayoutContent />
    </LayoutProvider>
  )
}
