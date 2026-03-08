import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CommandPalette, Navbar, Sidebar } from '@/components'
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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const { collapseSidebarForInspector } = useLayout()

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(sidebarOpen))
    } catch {
      // ignore
    }
  }, [sidebarOpen])

  const showSidebar = sidebarOpen && !collapseSidebarForInspector

  return (
    <>
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      <Navbar
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen((o) => !o)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />
      <div className="flex">
        <div
          className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${showSidebar ? 'w-56' : 'w-0'}`}
        >
          <Sidebar open={showSidebar} />
        </div>
        <main className="flex-1 min-h-[calc(100vh-3.5rem)] min-w-0">
          <Outlet />
        </main>
      </div>
    </>
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
