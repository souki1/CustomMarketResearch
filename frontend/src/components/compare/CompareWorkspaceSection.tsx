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
    <section className="rounded-lg border border-app-separator bg-app-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-separator px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-app-tertiary">Workspace files</span>
          <span className="text-[11px] text-app-tertiary">
            {selectedFilesData.length} file{selectedFilesData.length !== 1 ? 's' : ''} · {totalSelectedAcrossFiles} row
            {totalSelectedAcrossFiles !== 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFilePicker}
            className="rounded-md border border-app-separator bg-app-surface px-2.5 py-1.5 text-xs font-medium text-app-secondary hover:bg-app-fill"
          >
            Choose file…
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-app-separator px-2.5 py-1.5 text-xs font-medium text-app-secondary hover:bg-app-fill"
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
            <p className="mb-2 text-xs text-app-secondary">Loading file…</p>
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
                        : 'border-app-separator bg-app-surface text-app-secondary hover:border-app-separator'
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
                        isActive ? 'text-app-tertiary hover:text-white' : 'text-app-tertiary hover:text-app-secondary'
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
                <span className="text-[11px] font-semibold uppercase tracking-wider text-app-tertiary">Select parts</span>
                <span className="text-[11px] text-app-tertiary">
                  {filtRows.length} parts · {selectedCount} selected
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-1 rounded-md border border-app-separator bg-app-fill px-2 py-1">
                  <Search className="h-2.5 w-2.5 text-app-tertiary" strokeWidth={2} />
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
                  <p className="text-xs text-app-secondary">No rows match filter.</p>
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
                            ? 'border-app-accent bg-app-accent text-white'
                            : isChecked
                              ? 'border-app-separator bg-slate-900 text-white'
                              : inPortfolio
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                : 'border-app-separator bg-app-surface text-app-secondary hover:border-app-separator'
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
            <p className="text-xs text-app-secondary">Choose a workspace file to load parts for comparison.</p>
          )}
        </div>
      )}
    </section>
  )
}
