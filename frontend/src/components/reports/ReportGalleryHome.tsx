import { useEffect, useState } from 'react'
import { FileText, LayoutTemplate, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, Trash2 } from 'lucide-react'
import { formatCreated } from '@/components/reports/reportBlockUtils'
import { BTN_GHOST, BTN_PRIMARY, PAGE_SHADOW } from '@/components/reports/reportStudioStyles'
import { blocksToPlainText, type SavedReport } from '@/lib/savedReports'

const REPORTS_NAV_OPEN_KEY = 'ir-reports-nav-open'
const PAGE_MIN_H = 'min-h-[calc(100vh-3.5rem)]'

const sidebarNavBtn = (active: boolean) =>
  `flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm ${
    active
      ? 'bg-violet-100 text-violet-900 ring-1 ring-violet-200'
      : 'text-gray-700 hover:bg-white hover:shadow-sm'
  }`

export type ReportGalleryHomeProps = {
  tab: 'list' | 'create'
  onTabChange: (tab: 'list' | 'create') => void
  sorted: SavedReport[]
  previewId: string | null
  onPreviewIdChange: (id: string | null) => void
  onOpenStudioNew: () => void
  onOpenStudioAi: () => void
  onOpenStudioEdit: (r: SavedReport) => void
  onDeleteReport: (id: string) => void
}

export function ReportGalleryHome({
  tab,
  onTabChange,
  sorted,
  previewId,
  onPreviewIdChange,
  onOpenStudioNew,
  onOpenStudioAi,
  onOpenStudioEdit,
  onDeleteReport,
}: ReportGalleryHomeProps) {
  const [navOpen, setNavOpen] = useState(() => {
    try {
      return localStorage.getItem(REPORTS_NAV_OPEN_KEY) !== 'false'
    } catch {
      return true
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(REPORTS_NAV_OPEN_KEY, navOpen ? 'true' : 'false')
    } catch {
      // ignore
    }
  }, [navOpen])

  return (
    <div className={`${PAGE_MIN_H} bg-white text-gray-900`}>
      <div className={`mx-auto flex ${PAGE_MIN_H} w-full min-w-0 max-w-7xl items-stretch`}>
        {!navOpen && (
          <div
            className={`flex ${PAGE_MIN_H} w-10 shrink-0 flex-col border-r border-gray-200 bg-gray-50/90 sm:w-11`}
          >
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="flex h-11 w-full shrink-0 items-center justify-center text-gray-600 transition-colors hover:bg-white hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
              title="Show report navigation"
              aria-label="Show report navigation"
              aria-expanded={false}
            >
              <PanelLeftOpen className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}

        {navOpen && (
          <aside
            className={`flex ${PAGE_MIN_H} shrink-0 flex-col border-r border-gray-200 bg-gray-50/90 sm:w-52 md:w-64 lg:w-72`}
            aria-label="Report navigation"
          >
            <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-2 sm:px-3 sm:py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <LayoutTemplate className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
                <h2 className="truncate text-sm font-semibold text-gray-900">Reports</h2>
              </div>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-white hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                title="Hide navigation"
                aria-label="Hide report navigation"
                aria-expanded={true}
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-1.5 sm:p-2" aria-label="Report views">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'list'}
                className={sidebarNavBtn(tab === 'list')}
                onClick={() => onTabChange('list')}
              >
                <FileText className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 leading-snug">My designs</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'create'}
                className={sidebarNavBtn(tab === 'create')}
                onClick={() => onTabChange('create')}
              >
                <Plus className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                <span className="min-w-0 leading-snug">New design</span>
              </button>
            </nav>
          </aside>
        )}

        <div className={`flex ${PAGE_MIN_H} min-w-0 flex-1 flex-col bg-zinc-50`}>
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-5 py-10 sm:px-8 sm:py-14 lg:max-w-5xl">
            <header className="max-w-xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                {tab === 'list' ? 'Library' : 'Studio'}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-[2rem] sm:leading-tight">
                {tab === 'list' ? 'My designs' : 'New design'}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
                {tab === 'list'
                  ? 'Reports stay in this browser. Build pages with text, metrics, images, and structured blocks.'
                  : 'Start from a blank canvas. Edit blocks, layout, and styling in the studio.'}
              </p>
            </header>

            {tab === 'list' && (
              <section className="mt-10 sm:mt-12" aria-label="Saved reports">
                {sorted.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200/80 bg-white px-8 py-16 text-center sm:px-12 sm:py-20">
                    <div
                      className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400"
                      aria-hidden
                    >
                      <LayoutTemplate className="h-6 w-6 stroke-[1.25]" />
                    </div>
                    <p className="mt-5 text-base font-medium text-zinc-900">No reports yet</p>
                    <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">
                      Make your first design — it will appear here automatically.
                    </p>
                    <button
                      type="button"
                      className={`${BTN_PRIMARY} mt-8 rounded-lg px-5`}
                      onClick={onOpenStudioAi}
                    >
                      <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                      Make report with AI
                    </button>
                  </div>
                ) : (
                  <ul className="grid gap-5 sm:grid-cols-2 lg:gap-6">
                    {sorted.map((r) => {
                      const open = previewId === r.id
                      return (
                        <li
                          key={r.id}
                          className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white transition-[border-color,box-shadow] duration-200 hover:border-zinc-300 hover:shadow-sm"
                        >
                          <div className="aspect-4/3 bg-zinc-100 p-5">
                            <div
                              className={`mx-auto flex h-full max-h-full w-full max-w-[200px] flex-col overflow-hidden rounded-[3px] bg-white ${PAGE_SHADOW} px-3 py-3 text-[7px] leading-tight text-zinc-700`}
                              aria-hidden
                            >
                              <div className="line-clamp-2 font-semibold text-zinc-900">{r.title}</div>
                              <div className="mt-1 line-clamp-6 whitespace-pre-wrap text-zinc-500">
                                {blocksToPlainText(r.blocks)}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-1 flex-col gap-3 border-t border-zinc-100 p-4 sm:p-5">
                            <div className="min-w-0">
                              <p className="truncate text-[15px] font-medium text-zinc-900">{r.title}</p>
                              <p className="mt-0.5 text-xs text-zinc-400">{formatCreated(r.createdAt)}</p>
                            </div>
                            <div className="mt-auto flex flex-wrap gap-2">
                              <button type="button" className={`${BTN_PRIMARY} flex-1 rounded-lg`} onClick={() => onOpenStudioEdit(r)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className={`${BTN_GHOST} rounded-lg`}
                                onClick={() => onPreviewIdChange(open ? null : r.id)}
                              >
                                {open ? 'Hide' : 'Preview'}
                              </button>
                              <button
                                type="button"
                                className={`${BTN_GHOST} rounded-lg text-red-600 hover:border-red-200 hover:bg-red-50`}
                                onClick={() => onDeleteReport(r.id)}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            {open && (
                              <div className="max-h-48 overflow-auto rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 text-xs leading-relaxed text-zinc-700">
                                <pre className="whitespace-pre-wrap wrap-break-word font-sans">{blocksToPlainText(r.blocks)}</pre>
                              </div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}

            {tab === 'create' && (
              <section className="mt-10 sm:mt-12" aria-label="Start a new design">
                <div className="max-w-lg rounded-2xl border border-zinc-200/80 bg-white px-8 py-12 sm:px-10 sm:py-14">
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-zinc-500"
                    aria-hidden
                  >
                    <LayoutTemplate className="h-5 w-5 stroke-[1.25]" />
                  </div>
                  <h2 className="mt-6 text-lg font-semibold tracking-tight text-zinc-900">Open the studio</h2>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                    Headings, lists, metrics, images, and code — plus alignment, callouts, and spacing from the toolbar.
                  </p>
                  <button type="button" className={`${BTN_PRIMARY} mt-8 rounded-lg px-6`} onClick={onOpenStudioNew}>
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Start designing
                  </button>
                  <button
                    type="button"
                    className={`${BTN_GHOST} mt-3 rounded-lg px-6`}
                    onClick={onOpenStudioAi}
                  >
                    <Sparkles className="mr-2 h-4 w-4" aria-hidden />
                    Make report with AI
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
