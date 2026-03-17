import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CommandPalette, Navbar, Sidebar } from '@/components'
import { BucketProvider } from '@/contexts/BucketContext'
import { ComparisonProvider } from '@/contexts/ComparisonContext'
import { LayoutProvider, useLayout } from '@/contexts/LayoutContext'

const SIDEBAR_OPEN_KEY = 'sidebar-open'

function MainLayoutContent() {
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

  const [collapsedStripHover, setCollapsedStripHover] = useState(false)
  useEffect(() => {
    if (!collapseSidebarForInspector) setCollapsedStripHover(false)
  }, [collapseSidebarForInspector])
  const sidebarClosed = !sidebarOpen || collapseSidebarForInspector
  const showSidebar =
    (sidebarOpen && !collapseSidebarForInspector) || (sidebarClosed && collapsedStripHover)
  const showCollapsedStrip = sidebarClosed && !collapsedStripHover

  const handleSidebarToggle = () => {
    if (!showSidebar) {
      setCollapseSidebarForInspector(false)
      setSidebarOpen(true)
    } else {
      setSidebarOpen(false)
    }
  }

  const handleExpandFromCollapsed = () => {
    setCollapseSidebarForInspector(false)
    setSidebarOpen(true)
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
          className={`sticky top-14 flex h-[calc(100vh-3.5rem)] shrink-0 transition-[width] duration-200 ease-out ${showSidebar ? 'w-56' : showCollapsedStrip ? 'w-14' : 'w-0'}`}
          onMouseEnter={sidebarClosed ? () => setCollapsedStripHover(true) : undefined}
          onMouseLeave={sidebarClosed ? () => setCollapsedStripHover(false) : undefined}
        >
          <div className="h-full w-full overflow-hidden">
            <Sidebar
              open={showSidebar}
              collapsed={showCollapsedStrip}
              onExpand={showCollapsedStrip ? handleExpandFromCollapsed : undefined}
            />
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
 * Sidebar can be collapsed by the Research inspector via LayoutContext.
 */
export function MainLayout() {
  return (
    <LayoutProvider>
      <MainLayoutContent />
    </LayoutProvider>
  )
}
