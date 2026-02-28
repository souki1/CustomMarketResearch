import { Navbar, Sidebar } from '@/components'

export function HomePage() {
  return (
    <>
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-h-[calc(100vh-3.5rem)]" />
      </div>
    </>
  )
}
