import { useEffect, useMemo, useState } from 'react'
import { Download, FileText, LayoutTemplate, Loader2, PanelLeftClose, PanelLeftOpen, Plus, Sparkles, Trash2 } from 'lucide-react'
import { formatCreated } from '@/components/reports/reportBlockUtils'
import { BTN_GHOST, BTN_PRIMARY, PAGE_SHADOW } from '@/components/reports/reportStudioStyles'
import { exportReportDocx, exportReportPdf } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { blocksToPlainText, type SavedReport } from '@/lib/savedReports'

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const REPORTS_NAV_OPEN_KEY = 'ir-reports-nav-open'

const sidebarNavBtn = (active: boolean) =>
  `flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-left text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 sm:gap-2 sm:px-3 sm:py-2.5 sm:text-sm ${
    active
      ? 'bg-violet-100 text-violet-900 ring-1 ring-violet-200'
      : 'text-slate-700 hover:bg-white hover:shadow-sm'
  }`

const collapsedTabBtn = (active: boolean) =>
  `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all sm:h-9 sm:w-9 ${
    active
      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
      : 'text-slate-500 hover:bg-white/80 hover:text-slate-800 hover:shadow-sm'
  }`

export type ReportGalleryHomeProps = {
  tab: 'list' | 'create'
  onTabChange: (tab: 'list' | 'create') => void
  sorted: SavedReport[]
  loading?: boolean
  onOpenStudioNew: () => void
  onOpenStudioAi: () => void
  onOpenStudioEdit: (r: SavedReport) => void
  onOpenStudioPreview: (r: SavedReport) => void
  onDeleteReport: (id: number) => void
}

export function ReportGalleryHome({
  tab,
  onTabChange,
  sorted,
  loading = false,
  onOpenStudioNew,
  onOpenStudioAi,
  onOpenStudioEdit,
  onOpenStudioPreview,
  onDeleteReport,
}: ReportGalleryHomeProps) {
  const token = useMemo(() => getToken(), [])
  const [exportingId, setExportingId] = useState<number | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [downloadMenuId, setDownloadMenuId] = useState<number | null>(null)

  const handleExport = async (id: number, title: string, format: 'docx' | 'pdf') => {
    if (!token) return
    setExportError(null)
    setExportingId(id)
    try {
      const blob = format === 'docx'
        ? await exportReportDocx(token, id)
        : await exportReportPdf(token, id)
      const ext = format === 'docx' ? '.docx' : '.pdf'
      const filename = `${(title.trim() || 'report').slice(0, 80)}${ext}`
      triggerBlobDownload(blob, filename)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      if (format === 'pdf' && /libreoffice|soffice/i.test(message)) {
        setExportError(
          "PDF export isn't available yet. LibreOffice is required on the server. Install LibreOffice and make sure 'soffice' is on PATH."
        )
      } else {
        setExportError(message || 'Export failed')
      }
    } finally {
      setExportingId(null)
    }
  }
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

  useEffect(() => {
    if (downloadMenuId == null) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-download-menu-root]')) {
        setDownloadMenuId(null)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [downloadMenuId])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white text-slate-900">
      {/* Same shell as Compare: full-width row, secondary sidebar, then flex-1 scroll (no max-w wrapper) */}
      <div className="flex h-full min-h-0 w-full min-w-0">
        {!navOpen && (
          <div
            className="flex h-full w-10 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 sm:w-11"
            aria-label="Report navigation (collapsed)"
          >
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="flex h-10 w-full shrink-0 items-center justify-center border-b border-slate-200/80 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
              title="Expand report navigation"
              aria-label="Show report navigation"
              aria-expanded={false}
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
            <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden py-2">
              <button
                type="button"
                onClick={() => onTabChange('list')}
                title="My designs"
                aria-label="My designs"
                className={collapsedTabBtn(tab === 'list')}
              >
                <FileText className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onTabChange('create')}
                title="New design"
                aria-label="New design"
                className={collapsedTabBtn(tab === 'create')}
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {navOpen && (
          <aside
            className="flex h-full min-h-0 w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 md:w-56 lg:w-60"
            aria-label="Report navigation"
          >
            <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-2 sm:px-3 sm:py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <LayoutTemplate className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                <h2 className="truncate text-sm font-semibold text-slate-900">Reports</h2>
              </div>
              <button
                type="button"
                onClick={() => setNavOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                title="Collapse navigation"
                aria-label="Hide report navigation"
                aria-expanded={true}
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1.5 sm:p-2" aria-label="Report views">
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50">
          <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 lg:px-8">
            <header className="max-w-xl">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-400">
                {tab === 'list' ? 'Library' : 'Studio'}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-[2rem] sm:leading-tight">
                {tab === 'list' ? 'My designs' : 'New design'}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-500">
                {tab === 'list'
                  ? 'Build pages with text, metrics, images, and structured blocks. Export as DOCX or PDF.'
                  : 'Start from a blank canvas. Edit blocks, layout, and styling in the studio.'}
              </p>
            </header>

            {tab === 'list' && (
              <section className="mt-10 sm:mt-12" aria-label="Saved reports">
                {exportError && (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {exportError}
                  </div>
                )}
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                  </div>
                ) : sorted.length === 0 ? (
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
                  <ul className="flex flex-wrap justify-start gap-5 lg:gap-6">
                    {sorted.map((r) => {
                      return (
                        <li
                          key={r.id}
                          className="flex w-full flex-col overflow-visible rounded-2xl border border-zinc-200/90 bg-white transition-[border-color,box-shadow] duration-200 hover:border-zinc-300 hover:shadow-sm sm:w-[240px]"
                        >
                          <div className="aspect-4/3 overflow-hidden rounded-t-2xl bg-zinc-100 p-5">
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
                            <div className="mt-auto space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <button type="button" className={`${BTN_PRIMARY} rounded-lg`} onClick={() => onOpenStudioEdit(r)}>
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className={`${BTN_GHOST} rounded-lg`}
                                  onClick={() => onOpenStudioPreview(r)}
                                >
                                  Preview
                                </button>
                              </div>
                              <div className="flex items-center justify-end gap-2">
                                <div className="relative" data-download-menu-root>
                                  <button
                                    type="button"
                                    className={`${BTN_GHOST} rounded-lg`}
                                    onClick={() => setDownloadMenuId((cur) => (cur === r.id ? null : r.id))}
                                    disabled={exportingId !== null}
                                    title="Download"
                                  >
                                    {exportingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                  </button>
                                  {downloadMenuId === r.id && (
                                    <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-zinc-200 bg-white p-1 shadow-sm">
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                                        onClick={() => {
                                          setDownloadMenuId(null)
                                          void handleExport(r.id, r.title, 'docx')
                                        }}
                                      >
                                        <FileText className="h-3.5 w-3.5" />
                                        Word (.docx)
                                      </button>
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                                        onClick={() => {
                                          setDownloadMenuId(null)
                                          void handleExport(r.id, r.title, 'pdf')
                                        }}
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        PDF (.pdf)
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className={`${BTN_GHOST} rounded-lg text-red-600 hover:border-red-200 hover:bg-red-50`}
                                  onClick={() => onDeleteReport(r.id)}
                                  title="Delete"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
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
