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
  const [sidebarHoverVisible, setSidebarHoverVisible] = useState(false)
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
    if (!collapseSidebarForInspector) setSidebarHoverVisible(false)
  }, [collapseSidebarForInspector])

  const showSidebar =
    (sidebarOpen && !collapseSidebarForInspector) ||
    (collapseSidebarForInspector && sidebarHoverVisible)

  const handleSidebarToggle = () => {
    if (!showSidebar) {
      // Sidebar is hidden (user closed it or inspector collapsed it) — show it
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
          className="flex shrink-0"
          onMouseLeave={
            collapseSidebarForInspector ? () => setSidebarHoverVisible(false) : undefined
          }
        >
          {collapseSidebarForInspector && (
            <div
              className="w-3 shrink-0 border-r border-gray-200 bg-white min-h-[calc(100vh-3.5rem)] cursor-default hover:bg-gray-50 transition-colors"
              style={{ minHeight: 'calc(100vh - 3.5rem)' }}
              onMouseEnter={() => setSidebarHoverVisible(true)}
              title="Move mouse here to show sidebar"
              aria-label="Show sidebar on hover"
            />
          )}
          <div
            className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${showSidebar ? 'w-56' : 'w-0'}`}
          >
            <Sidebar open={showSidebar} />
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
