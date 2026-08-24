import type { FileEntry, LoadedFile } from '@/components/compare/types'

type Props = {
  open: boolean
  filePickerLoading: boolean
  filePickerError: string | null
  filePickerFiles: FileEntry[]
  selectedFilesData: LoadedFile[]
  fileContentLoading: Set<number>
  onClose: () => void
  onFileClick: (file: FileEntry) => void
}

export function CompareFilePickerModal({
  open,
  filePickerLoading,
  filePickerError,
  filePickerFiles,
  selectedFilesData,
  fileContentLoading,
  onClose,
  onFileClick,
}: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-file-picker-title"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-slate-950/5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <h3 id="compare-file-picker-title" className="text-base font-semibold text-slate-900">
            Workspace files
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {filePickerLoading && <p className="py-10 text-center text-sm text-slate-500">Loading files…</p>}
          {filePickerError && <p className="py-4 text-center text-sm text-red-600">{filePickerError}</p>}
          {!filePickerLoading && !filePickerError && filePickerFiles.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">No files in workspace. Upload from the Home page first.</p>
          )}
          {!filePickerLoading && !filePickerError && filePickerFiles.length > 0 && (
            <>
              <p className="mb-3 px-2 text-xs font-medium text-slate-500">Select a file to attach to this sheet.</p>
              <ul className="space-y-1">
                {filePickerFiles.map((file) => {
                  const isSelected = selectedFilesData.some((f) => f.fileId === file.id)
                  const isLoading = fileContentLoading.has(file.id)
                  return (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => onFileClick(file)}
                        disabled={isSelected || isLoading}
                        className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'cursor-default bg-slate-100 text-slate-500'
                            : isLoading
                              ? 'cursor-wait text-slate-500'
                              : 'text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate w-full font-medium">{file.name}</span>
                        {file.folderPath && <span className="truncate w-full text-xs text-slate-500">{file.folderPath}</span>}
                        {isSelected && <span className="text-xs font-medium text-slate-700">Attached</span>}
                        {isLoading && <span className="text-xs text-slate-500">Loading…</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
