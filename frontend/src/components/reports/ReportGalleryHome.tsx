import { FileText, LayoutTemplate, Plus, Trash2 } from 'lucide-react'
import { formatCreated } from '@/components/reports/reportBlockUtils'
import {
  BTN_GHOST,
  BTN_PRIMARY,
  PAGE_SHADOW,
  TAB_ACTIVE,
  TAB_BTN,
  TAB_IDLE,
} from '@/components/reports/reportStudioStyles'
import { blocksToPlainText, type SavedReport } from '@/lib/savedReports'

export type ReportGalleryHomeProps = {
  tab: 'list' | 'create'
  onTabChange: (tab: 'list' | 'create') => void
  sorted: SavedReport[]
  previewId: string | null
  onPreviewIdChange: (id: string | null) => void
  onOpenStudioNew: () => void
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
  onOpenStudioEdit,
  onDeleteReport,
}: ReportGalleryHomeProps) {
  return (
    <div className="min-h-full bg-[#f8fafc]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:max-w-4xl lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Reports</h1>
          <p className="mt-1 text-sm text-gray-600">
            Build report pages with text, lists, metrics, images, code, alignment, and callout styles. Saved in this
            browser.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-2 rounded-xl bg-slate-100/80 p-1 ring-1 ring-slate-200/60">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'list'}
            className={`${TAB_BTN} ${tab === 'list' ? TAB_ACTIVE : TAB_IDLE}`}
            onClick={() => onTabChange('list')}
          >
            <FileText className="h-4 w-4 shrink-0 opacity-70" />
            My designs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'create'}
            className={`${TAB_BTN} ${tab === 'create' ? TAB_ACTIVE : TAB_IDLE}`}
            onClick={() => onTabChange('create')}
          >
            <Plus className="h-4 w-4 shrink-0 opacity-70" />
            New design
          </button>
        </div>

        {tab === 'list' && (
          <section className="mt-8" aria-label="Saved reports">
            {sorted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-6 py-14 text-center shadow-sm">
                <LayoutTemplate className="mx-auto h-10 w-10 text-slate-300" aria-hidden />
                <p className="mt-3 text-sm font-medium text-gray-900">No designs yet</p>
                <p className="mt-1 text-sm text-gray-500">Open the studio and build your first report page.</p>
                <button type="button" className={`${BTN_PRIMARY} mt-6`} onClick={onOpenStudioNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  Start designing
                </button>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2">
                {sorted.map((r) => {
                  const open = previewId === r.id
                  return (
                    <li
                      key={r.id}
                      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="aspect-4/3 bg-[#e8eaed] p-4">
                        <div
                          className={`mx-auto flex h-full max-h-full w-full max-w-[200px] flex-col overflow-hidden rounded-sm bg-white ${PAGE_SHADOW} px-3 py-3 text-[7px] leading-tight text-gray-800`}
                          aria-hidden
                        >
                          <div className="line-clamp-2 font-bold text-gray-900">{r.title}</div>
                          <div className="mt-1 line-clamp-6 whitespace-pre-wrap text-gray-600">
                            {blocksToPlainText(r.blocks)}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-3 border-t border-slate-100 p-4">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{r.title}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{formatCreated(r.createdAt)}</p>
                        </div>
                        <div className="mt-auto flex flex-wrap gap-2">
                          <button type="button" className={`${BTN_PRIMARY} flex-1`} onClick={() => onOpenStudioEdit(r)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className={BTN_GHOST}
                            onClick={() => onPreviewIdChange(open ? null : r.id)}
                          >
                            {open ? 'Hide' : 'Preview'}
                          </button>
                          <button
                            type="button"
                            className={`${BTN_GHOST} text-red-700 hover:border-red-200 hover:bg-red-50`}
                            onClick={() => onDeleteReport(r.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {open && (
                          <div className="max-h-48 overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-gray-800">
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
          <section className="mt-8" aria-label="Start a new design">
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500 to-blue-600 text-white shadow-md">
                <LayoutTemplate className="h-8 w-8" />
              </div>
              <h2 className="mt-6 text-lg font-semibold text-gray-900">Report studio</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                Add headings, lists, metrics, images, and code blocks. Use the format bar for alignment, callout colors,
                line style, and spacer height.
              </p>
              <button type="button" className={`${BTN_PRIMARY} mt-8 px-8`} onClick={onOpenStudioNew}>
                Open studio
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
