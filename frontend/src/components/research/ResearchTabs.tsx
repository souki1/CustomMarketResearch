import type React from 'react'

type TabState = {
  id: string
  name: string
  fileId: number | null
  folderPath?: string | null
}

type FileEntry = { id: number; name: string; folderPath: string | null }

type Props = {
  tabs: TabState[]
  activeTabId: string | null
  editingTabId: string | null
  editingName: string
  newTabMenuOpen: boolean
  filePickerOpen: boolean
  filePickerFiles: FileEntry[]
  filePickerLoading: boolean
  filePickerError: string | null
  onTabClick: (id: string) => void
  onTabClose: (id: string, e: React.MouseEvent) => void
  onStartRename: (tab: TabState) => void
  onRenameChange: (name: string) => void
  onRenameCommit: (id: string, name: string) => void
  onRenameCancel: () => void
  onToggleNewTabMenu: () => void
  onNewSheet: () => void
  onOpenFilePicker: () => void
  onCloseFilePicker: () => void
  onFilePickerFileClick: (file: FileEntry) => void
}

export function ResearchTabs(props: Props) {
  const {
    tabs,
    activeTabId,
    editingTabId,
    editingName,
    newTabMenuOpen,
    filePickerOpen,
    filePickerFiles,
    filePickerLoading,
    filePickerError,
    onTabClick,
    onTabClose,
    onStartRename,
    onRenameChange,
    onRenameCommit,
    onRenameCancel,
    onToggleNewTabMenu,
    onNewSheet,
    onOpenFilePicker,
    onCloseFilePicker,
    onFilePickerFileClick,
  } = props

  return (
    <>
      {/* Tab bar */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`flex items-center gap-1.5 rounded-t border border-b-0 px-3 py-2 text-sm ${
              tab.id === activeTabId
                ? 'border-gray-300 bg-white text-gray-900'
                : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {editingTabId === tab.id ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={() => onRenameCommit(tab.id, editingName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onRenameCommit(tab.id, editingName)
                  if (e.key === 'Escape') onRenameCancel()
                }}
                onClick={(e) => e.stopPropagation()}
                className="min-w-[80px] rounded border border-gray-300 px-1.5 py-0.5 text-sm font-medium text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
                aria-label="Rename tab"
              />
            ) : (
              <button
                type="button"
                onClick={() => onTabClick(tab.id)}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onStartRename(tab)
                }}
                className="font-medium"
              >
                {tab.name}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => onTabClose(tab.id, e)}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-300 hover:text-gray-600"
              aria-label="Close tab"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <div className="relative">
          <button
            type="button"
            onClick={onToggleNewTabMenu}
            className="rounded-t border border-transparent px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="New tab"
          >
            + New tab
          </button>
          {newTabMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-b border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={onNewSheet}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <span className="text-gray-400">+</span>
                New sheet
              </button>
              <button
                type="button"
                onClick={onOpenFilePicker}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <span className="text-gray-400">↺</span>
                Open file…
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Open file picker modal */}
      {filePickerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={onCloseFilePicker}
          role="dialog"
          aria-modal="true"
          aria-labelledby="file-picker-title"
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 id="file-picker-title" className="text-base font-semibold text-gray-900">
                Open file
              </h3>
              <button
                type="button"
                onClick={onCloseFilePicker}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filePickerLoading && (
                <p className="py-8 text-center text-sm text-gray-500">Loading files…</p>
              )}
              {filePickerError && (
                <p className="py-4 text-center text-sm text-red-600">{filePickerError}</p>
              )}
              {!filePickerLoading && !filePickerError && filePickerFiles.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-500">No files in workspace.</p>
              )}
              {!filePickerLoading && !filePickerError && filePickerFiles.length > 0 && (
                <ul className="space-y-0.5">
                  {filePickerFiles.map((file) => (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => onFilePickerFileClick(file)}
                        className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        <span className="truncate w-full font-medium">{file.name}</span>
                        {file.folderPath && (
                          <span className="truncate w-full text-xs text-gray-500">{file.folderPath}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-gray-200 px-4 py-2">
              <button
                type="button"
                onClick={onCloseFilePicker}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

