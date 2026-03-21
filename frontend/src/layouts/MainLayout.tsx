import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { CommandPalette, Navbar, Sidebar } from '@/components'
import { BucketProvider } from '@/contexts/BucketContext'
import { ComparisonProvider } from '@/contexts/ComparisonContext'
import { LayoutProvider, useLayout } from '@/contexts/LayoutContext'

const SIDEBAR_OPEN_KEY = 'sidebar-open'

function MainLayoutContent() {
  const location = useLocation()
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
  const { collapseSidebarForInspector, setCollapseSidebarForInspector } = useLayout()

  // When leaving Research (e.g. Home, AI, Compare), undo inspector collapse and show the full sidebar again.
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
    } else {
      if (sidebarOpenBeforeInspector == null) setSidebarOpenBeforeInspector(sidebarOpen)
    }
  }, [collapseSidebarForInspector, sidebarOpenBeforeInspector, sidebarOpen])

  const showSidebar = sidebarOpen && !collapseSidebarForInspector
  const showCollapsedStrip = !showSidebar

  const handleSidebarToggle = () => {
    if (!showSidebar) {
      setCollapseSidebarForInspector(false)
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }

  return (
    <BucketProvider>
      <ComparisonProvider>
        <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
        <Navbar
        sidebarOpen={showSidebar}
        onSidebarToggle={handleSidebarToggle}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />
      <div className="flex">
        <div
          className={`sticky top-14 flex h-[calc(100vh-3.5rem)] shrink-0 transition-[width] duration-200 ease-out ${showSidebar ? 'w-56' : 'w-14'}`}
        >
          <div className="h-full w-full overflow-hidden">
            <Sidebar open={showSidebar} collapsed={showCollapsedStrip} />
          </div>
        </div>
        <main className="flex-1 min-h-[calc(100vh-3.5rem)] min-w-0">
          <Outlet />
        </main>
      </div>
      </ComparisonProvider>
    </BucketProvider>
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
