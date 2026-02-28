export function Sidebar() {
  return (
    <aside
      className="w-56 shrink-0 border-r border-gray-200 bg-white min-h-[calc(100vh-3.5rem)]"
      aria-label="Sidebar"
    >
      <div className="flex flex-col py-4">
        <nav className="flex flex-col gap-1 px-2">
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          >
            <span className="text-gray-500">●</span>
            Dashboard
          </button>
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          >
            <span className="text-gray-500">●</span>
            Research
          </button>
          <button
            type="button"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
          >
            <span className="text-gray-500">●</span>
            Settings
          </button>
        </nav>
      </div>
    </aside>
  )
}
