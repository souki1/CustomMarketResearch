import type { LoadedFile, CompareMode } from '@/components/compare/types'

type Props = {
  compareMode: CompareMode
  selectedFilesData: LoadedFile[]
  selectedFileRows: Record<number, number[]>
  activeFileId: number | null
  selectedRowForScraped: { fileId: number; rowIdx: number; partLabel: string } | null
  fileContentLoadingSize: number
  portfolioPartNumbers: Set<string>
  totalSelectedAcrossFiles: number
  filesWithSelection: number
  onOpenFilePicker: () => void
  onSetActiveFile: (fileId: number) => void
  onRemoveFile: (fileId: number) => void
  onToggleFileRow: (fileId: number, rowIdx: number, checked: boolean) => void
  onAddSelectedFileRows: (fileId: number) => void
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
  onAddSelectedFileRows,
  onAddAllSelectedFromAllFiles,
  onCancelAllSelected,
}: Props) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-950/5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Compare workspace</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Product comparison</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
            Align specifications across vendors and parts using workspace data and scraped research in one view.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onOpenFilePicker}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          Choose file…
        </button>
        {fileContentLoadingSize > 0 && <span className="text-sm text-slate-500">Loading file…</span>}
        {selectedFilesData.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {(compareMode === 'different-same-vendor' ? selectedFilesData.slice(0, 1) : selectedFilesData).map((file) => {
              const isActive = file.fileId === (activeFileId ?? selectedFilesData[0]?.fileId)
              return (
                <span
                  key={file.fileId}
                  onClick={() => onSetActiveFile(file.fileId)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <span className="font-medium">{file.name}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveFile(file.fileId)
                    }}
                    className={`rounded p-0.5 ${
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
            <div key={fileData.fileId} className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{fileData.name}</p>
              {fileData.content.length > 1 ? (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/5">
                  <p className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs font-medium text-slate-600">
                    Select parts · {fileData.content.length - 1} rows
                  </p>
                  <div className="max-h-52 overflow-y-auto px-2 py-2">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                      {fileData.content.slice(1).map((row, idx) => {
                        const rowIdx = idx
                        const label = String(row[0] ?? row[1] ?? `Row ${rowIdx + 1}`)
                        const isChecked = (selectedFileRows[fileData.fileId] ?? []).includes(rowIdx)
                        const isSelectedForScraped =
                          selectedRowForScraped?.fileId === fileData.fileId &&
                          selectedRowForScraped?.rowIdx === rowIdx
                        const inPortfolio = portfolioPartNumbers.has(label.trim().toLowerCase())
                        return (
                          <label
                            key={rowIdx}
                            title={inPortfolio ? `${label} — In Portfolio` : label}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                              inPortfolio
                                ? isSelectedForScraped
                                  ? 'border-emerald-500 bg-emerald-200 text-emerald-950'
                                  : isChecked
                                    ? 'border-emerald-400 bg-emerald-200 text-emerald-950'
                                    : 'border-emerald-300 bg-emerald-100 text-slate-900 hover:border-emerald-400 hover:bg-emerald-200'
                                : isSelectedForScraped
                                  ? 'border-sky-300 bg-sky-50 text-sky-900'
                                  : isChecked
                                    ? 'border-slate-300 bg-slate-100 text-slate-900'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => onToggleFileRow(fileData.fileId, rowIdx, e.target.checked)}
                              className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                            />
                            <span className="min-w-0 truncate font-medium">{label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => onAddSelectedFileRows(fileData.fileId)}
                      disabled={!(selectedFileRows[fileData.fileId]?.length ?? 0)}
                      className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {(selectedFileRows[fileData.fileId]?.length ?? 0) > 0
                        ? `Add ${selectedFileRows[fileData.fileId]?.length ?? 0} selected`
                        : 'Select parts above'}
                    </button>
                    <span className="text-[11px] text-slate-400">
                      {(selectedFileRows[fileData.fileId]?.length ?? 0)}/{fileData.content.length - 1} selected
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No data rows in this file.</p>
              )}
            </div>
          )
        })()}

      {compareMode !== 'different-same-vendor' && selectedFilesData.length > 1 && totalSelectedAcrossFiles > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 ring-1 ring-slate-950/5">
          <h4 className="text-sm font-semibold text-slate-900">Cross-vendor selection</h4>
          <p className="mt-1.5 text-sm text-slate-600">
            {totalSelectedAcrossFiles} row{totalSelectedAcrossFiles !== 1 ? 's' : ''} selected across {filesWithSelection}{' '}
            file{filesWithSelection !== 1 ? 's' : ''}. Add everything to the comparison table.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAddAllSelectedFromAllFiles}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              Add all selected to comparison
            </button>
            <button
              type="button"
              onClick={onCancelAllSelected}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
