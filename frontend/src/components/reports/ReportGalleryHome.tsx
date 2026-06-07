import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { formatCreated } from '@/components/reports/reportBlockUtils'
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

const REPORT_TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  Comparison: { bg: 'bg-blue-50', text: 'text-blue-700' },
  Vendor: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  Insights: { bg: 'bg-amber-50', text: 'text-amber-700' },
  Research: { bg: 'bg-violet-50', text: 'text-violet-700' },
  Spend: { bg: 'bg-red-50', text: 'text-red-600' },
  Design: { bg: 'bg-slate-100', text: 'text-slate-600' },
}

function inferReportType(title: string, index: number): string {
  const t = title.toLowerCase()
  if (t.includes('comparison') || t.includes('compare')) return 'Comparison'
  if (t.includes('vendor') || t.includes('scorecard')) return 'Vendor'
  if (t.includes('insight') || t.includes('intelligence')) return 'Insights'
  if (t.includes('research') || t.includes('coverage')) return 'Research'
  if (t.includes('spend') || t.includes('procurement')) return 'Spend'
  const cycle = ['Comparison', 'Vendor', 'Insights', 'Research', 'Design']
  return cycle[index % cycle.length] ?? 'Design'
}

function reportDescription(report: SavedReport): string {
  const plain = blocksToPlainText(report.blocks).replace(/\s+/g, ' ').trim()
  if (!plain) return 'Custom report design with structured blocks.'
  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain
}

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
  sorted,
  loading = false,
  onOpenStudioNew,
  onOpenStudioAi,
  onOpenStudioPreview,
  onDeleteReport,
}: ReportGalleryHomeProps) {
  const token = useMemo(() => getToken(), [])
  const [exportingId, setExportingId] = useState<number | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleExport = async (id: number, title: string, format: 'docx' | 'pdf') => {
    if (!token) return
    setExportError(null)
    setExportingId(id)
    try {
      const blob =
        format === 'docx' ? await exportReportDocx(token, id) : await exportReportPdf(token, id)
      const ext = format === 'docx' ? '.docx' : '.pdf'
      const filename = `${(title.trim() || 'report').slice(0, 80)}${ext}`
      triggerBlobDownload(blob, filename)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      if (format === 'pdf' && /libreoffice|soffice/i.test(message)) {
        setExportError(
          "PDF export isn't available yet. LibreOffice is required on the server."
        )
      } else {
        setExportError(message || 'Export failed')
      }
    } finally {
      setExportingId(null)
    }
  }

  useEffect(() => {
    if (!exportError) return
    const t = setTimeout(() => setExportError(null), 8000)
    return () => clearTimeout(t)
  }, [exportError])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-slate-50 text-slate-900">
      <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="m-0 text-lg font-bold tracking-tight text-slate-900">Reports</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              Generated reports and exports for your procurement data.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={onOpenStudioAi}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-slate-200 bg-white px-2.5 py-[5px] text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} />
              AI report
            </button>
            <button
              type="button"
              onClick={onOpenStudioNew}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-blue-600 px-2.5 py-[5px] text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New report
            </button>
          </div>
        </div>

        {exportError && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {exportError}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2.5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-8 py-16 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                <FileText className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">No reports yet</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
                Create your first report from a blank canvas or generate one with AI.
              </p>
              <button
                type="button"
                onClick={onOpenStudioAi}
                className="mt-5 inline-flex items-center gap-1.5 rounded-[5px] bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Make report with AI
              </button>
            </div>
          ) : (
            sorted.map((report, index) => {
              const type = inferReportType(report.title, index)
              const typeStyle = REPORT_TYPE_STYLES[type] ?? REPORT_TYPE_STYLES.Design!
              const isExporting = exportingId === report.id
              return (
                <div
                  key={report.id}
                  className="flex flex-wrap items-center gap-3.5 rounded-lg border border-slate-200 bg-white px-4 py-3.5 sm:flex-nowrap"
                >
                  <div
                    className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg ${typeStyle.bg}`}
                  >
                    <FileText className={`h-4 w-4 ${typeStyle.text}`} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{report.title}</span>
                      <span
                        className={`rounded px-1.5 py-px text-[11px] font-medium ${typeStyle.bg} ${typeStyle.text}`}
                      >
                        {type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">{reportDescription(report)}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{formatCreated(report.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenStudioPreview(report)}
                      className="inline-flex items-center gap-1 rounded-[5px] border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Eye className="h-3 w-3" strokeWidth={1.75} />
                      View
                    </button>
                    <button
                      type="button"
                      disabled={isExporting}
                      onClick={() => void handleExport(report.id, report.title, 'docx')}
                      className="inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {isExporting ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" strokeWidth={1.75} />
                      )}
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteReport(report.id)}
                      className="inline-flex items-center rounded-[5px] p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete report"
                      aria-label={`Delete ${report.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
