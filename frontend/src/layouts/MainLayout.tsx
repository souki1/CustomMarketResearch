import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Navbar, Sidebar } from '@/components'

const SIDEBAR_OPEN_KEY = 'sidebar-open'

/**
 * Renders Navbar and Sidebar once. Only the <Outlet /> (main content) updates
 * when the route or page content changes — sidebar and navbar do not re-mount or re-render.
 */
export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_OPEN_KEY) !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(sidebarOpen))
    } catch {
      // ignore
    }
  }, [sidebarOpen])

  return (
    <>
      <Navbar sidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen((o) => !o)} />
      <div className="flex">
        <div
          className={`shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${sidebarOpen ? 'w-56' : 'w-0'}`}
        >
          <Sidebar open={sidebarOpen} />
        </div>
        <main className="flex-1 min-h-[calc(100vh-3.5rem)] min-w-0">
          <Outlet />
        </main>
      </div>
    </>
  )
}
