import { useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { primaryTextFromDataRow } from '@/components/compare/dataRow'
import type { LoadedFile } from '@/components/compare/types'

type Props = {
  selectedFilesData: LoadedFile[]
  selectedFileRows: Record<number, number[]>
  activeFileId: number | null
  selectedRowForScraped: { fileId: number | null; tabId: string | null; rowIdx: number; partLabel: string } | null
  fileContentLoadingSize: number
  portfolioPartNumbers: Set<string>
  totalSelectedAcrossFiles: number
  onOpenFilePicker: () => void
  onSetActiveFile: (fileId: number) => void
  onRemoveFile: (fileId: number) => void
  onToggleFileRow: (fileId: number, rowIdx: number, checked: boolean) => void
}

export function CompareWorkspaceSection({
  selectedFilesData,
  selectedFileRows,
  activeFileId,
  selectedRowForScraped,
  fileContentLoadingSize,
  portfolioPartNumbers,
  totalSelectedAcrossFiles,
  onOpenFilePicker,
  onSetActiveFile,
  onRemoveFile,
  onToggleFileRow,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [partQ, setPartQ] = useState('')

  const fileData = selectedFilesData.find((f) => f.fileId === (activeFileId ?? selectedFilesData[0]?.fileId))
  const visibleRows =
    fileData?.content
      .slice(1)
      .map((row, rowIdx) => ({ rowIdx, label: primaryTextFromDataRow(row) }))
      .filter((e): e is { rowIdx: number; label: string } => e.label != null) ?? []

  const filtRows = partQ.trim()
    ? visibleRows.filter((r) => r.label.toLowerCase().includes(partQ.trim().toLowerCase()))
    : visibleRows

  const selectedCount = fileData ? (selectedFileRows[fileData.fileId]?.length ?? 0) : 0

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Workspace files</span>
          <span className="text-[11px] text-slate-400">
            {selectedFilesData.length} file{selectedFilesData.length !== 1 ? 's' : ''} · {totalSelectedAcrossFiles} row
            {totalSelectedAcrossFiles !== 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFilePicker}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Choose file…
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
                Expand
              </>
            ) : (
              <>
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
                Collapse
              </>
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-3">
          {fileContentLoadingSize > 0 && (
            <p className="mb-2 text-xs text-slate-500">Loading file…</p>
          )}
          {selectedFilesData.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {selectedFilesData.map((file) => {
                const isActive = file.fileId === (activeFileId ?? selectedFilesData[0]?.fileId)
                return (
                  <span
                    key={file.fileId}
                    onClick={() => onSetActiveFile(file.fileId)}
                    className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <span className="max-w-[200px] truncate font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveFile(file.fileId)
                      }}
                      className={`rounded px-0.5 ${
                        isActive ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-slate-700'
                      }`}
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          {fileData && fileData.content.length > 1 && (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Select parts</span>
                <span className="text-[11px] text-slate-400">
                  {filtRows.length} parts · {selectedCount} selected
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                  <Search className="h-2.5 w-2.5 text-slate-400" strokeWidth={2} />
                  <input
                    value={partQ}
                    onChange={(e) => setPartQ(e.target.value)}
                    placeholder="Filter…"
                    className="w-20 border-0 bg-transparent text-xs outline-none"
                  />
                </div>
              </div>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {filtRows.length === 0 ? (
                  <p className="text-xs text-slate-500">No rows match filter.</p>
                ) : (
                  filtRows.map(({ rowIdx, label }) => {
                    const isChecked = (selectedFileRows[fileData.fileId] ?? []).includes(rowIdx)
                    const isActive =
                      selectedRowForScraped?.fileId === fileData.fileId && selectedRowForScraped?.rowIdx === rowIdx
                    const inPortfolio = portfolioPartNumbers.has(label.trim().toLowerCase())
                    return (
                      <button
                        key={rowIdx}
                        type="button"
                        onClick={() => onToggleFileRow(fileData.fileId, rowIdx, !isChecked)}
                        title={label}
                        className={`inline-flex max-w-[200px] items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] transition-colors ${
                          isActive
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : isChecked
                              ? 'border-slate-300 bg-slate-900 text-white'
                              : inPortfolio
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span className="truncate font-semibold">{label}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </>
          )}

          {selectedFilesData.length === 0 && (
            <p className="text-xs text-slate-500">Choose a workspace file to load parts for comparison.</p>
          )}
        </div>
      )}
    </section>
  )
}
