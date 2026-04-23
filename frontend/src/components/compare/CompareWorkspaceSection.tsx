import { useState } from 'react'
import type { LoadedFile, CompareMode } from '@/components/compare/types'

type Props = {
  compareMode: CompareMode
  selectedFilesData: LoadedFile[]
  selectedFileRows: Record<number, number[]>
  activeFileId: number | null
  selectedRowForScraped: { fileId: number | null; tabId: string | null; rowIdx: number; partLabel: string } | null
  fileContentLoadingSize: number
  portfolioPartNumbers: Set<string>
  totalSelectedAcrossFiles: number
  filesWithSelection: number
  onOpenFilePicker: () => void
  onSetActiveFile: (fileId: number) => void
  onRemoveFile: (fileId: number) => void
  onToggleFileRow: (fileId: number, rowIdx: number, checked: boolean) => void
  onAddAllSelectedFromAllFiles: () => void
  onCancelAllSelected: () => void
}

export function CompareWorkspaceSection({
  compareMode,
  selectedFilesData,
  selectedFileRows,
  activeFileId,
  selectedRowForScraped,
  fileContentLoadingSize,
  portfolioPartNumbers,
  totalSelectedAcrossFiles,
  filesWithSelection,
  onOpenFilePicker,
  onSetActiveFile,
  onRemoveFile,
  onToggleFileRow,
  onAddAllSelectedFromAllFiles,
  onCancelAllSelected,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <section className="rounded-2xl bg-transparent p-2 sm:p-3">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {!collapsed && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Compare workspace</p>
          )}
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="mt-1 text-lg font-semibold tracking-tight text-slate-900 hover:text-slate-700 sm:text-xl"
              aria-label="Expand workspace section"
            >
              Product Comparison
            </button>
          ) : (
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Product Comparison</h1>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
              Files: {selectedFilesData.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
              Selected rows: {totalSelectedAcrossFiles}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand workspace section' : 'Collapse workspace section'}
        >
          {collapsed ? 'Expand' : 'Minimize'}
          <svg
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {collapsed ? null : (
        <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onOpenFilePicker}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Choose file…
        </button>
        {fileContentLoadingSize > 0 && <span className="text-sm text-slate-500">Loading file…</span>}
        {selectedFilesData.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(compareMode === 'different-same-vendor' ? selectedFilesData.slice(0, 1) : selectedFilesData).map((file) => {
              const isActive = file.fileId === (activeFileId ?? selectedFilesData[0]?.fileId)
              return (
                <span
                  key={file.fileId}
                  onClick={() => onSetActiveFile(file.fileId)}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-all ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <span className="max-w-[220px] truncate font-medium">{file.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveFile(file.fileId)
                    }}
                    className={`rounded p-0 ${
                      isActive
                        ? 'text-slate-300 hover:bg-white/15 hover:text-white'
                        : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
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
      </div>
      {selectedFilesData.length > 0 &&
        (() => {
          const filesToUse = compareMode === 'different-same-vendor' ? selectedFilesData.slice(0, 1) : selectedFilesData
          const fileData = filesToUse.find((f) => f.fileId === (activeFileId ?? filesToUse[0]?.fileId))
          if (!fileData) return null
          return (
            <div key={fileData.fileId} className="mt-4">
              <p className="mb-1 text-[11px] font-semibold text-slate-500 truncate">{fileData.name}</p>
              {fileData.content.length > 1 ? (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/5">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-2.5 py-1.5">
                    <span className="text-[11px] font-medium text-slate-600">
                      {fileData.content.length - 1} parts
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {(selectedFileRows[fileData.fileId]?.length ?? 0)} selected
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {fileData.content.slice(1).map((row, idx) => {
                        const rowIdx = idx
                        const label = String(row[0] ?? row[1] ?? `Row ${rowIdx + 1}`)
                        const isChecked = (selectedFileRows[fileData.fileId] ?? []).includes(rowIdx)
                        const isSelectedForScraped =
                          selectedRowForScraped?.fileId === fileData.fileId &&
                          selectedRowForScraped?.rowIdx === rowIdx
                        const inPortfolio = portfolioPartNumbers.has(label.trim().toLowerCase())
                        return (
                          <button
                            key={rowIdx}
                            type="button"
                            onClick={() => onToggleFileRow(fileData.fileId, rowIdx, !isChecked)}
                            title={inPortfolio ? `${label} — In Portfolio` : label}
                            className={`inline-flex max-w-[220px] items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-colors ${
                              inPortfolio
                                ? isSelectedForScraped
                                  ? 'border-emerald-500 bg-emerald-200 text-emerald-950'
                                  : isChecked
                                    ? 'border-emerald-400 bg-emerald-200 text-emerald-950'
                                    : 'border-emerald-300 bg-emerald-100 text-slate-900 hover:border-emerald-400 hover:bg-emerald-200'
                                : isSelectedForScraped
                                  ? 'border-blue-300 bg-blue-50 text-blue-900'
                                  : isChecked
                                    ? 'border-blue-200 bg-blue-50 text-blue-900'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span className="min-w-0 truncate">{label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No data rows in this file.</p>
              )}
            </div>
          )
        })()}

      {compareMode !== 'different-same-vendor' && selectedFilesData.length > 1 && totalSelectedAcrossFiles > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 ring-1 ring-slate-950/5">
          <h4 className="text-xs font-semibold text-slate-900">Cross-vendor selection</h4>
          <p className="mt-1 text-xs text-slate-600">
            {totalSelectedAcrossFiles} row{totalSelectedAcrossFiles !== 1 ? 's' : ''} selected across {filesWithSelection}{' '}
            file{filesWithSelection !== 1 ? 's' : ''}. Add everything to the comparison table.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onAddAllSelectedFromAllFiles}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Add all selected to comparison
            </button>
            <button
              type="button"
              onClick={onCancelAllSelected}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </section>
  )
}
