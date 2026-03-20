import type React from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { THEME_MODAL, THEME_RESEARCH } from '@/lib/uiTheme'

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

  const { theme } = useTheme()
  const tr = THEME_RESEARCH[theme]
  const modalPanel = THEME_MODAL[theme].panel
  const tabBarBorder =
    theme === 'dark' ? 'border-slate-700' : theme === 'purple' ? 'border-violet-200/55' : 'border-white/40'
  const tabActive =
    theme === 'dark'
      ? 'border-slate-600 border-b-0 bg-[#161b26] text-slate-50 shadow-sm ring-1 ring-slate-600/50'
      : theme === 'purple'
        ? 'border-violet-200/85 border-b-0 bg-white text-violet-950 shadow-sm shadow-violet-500/10'
        : 'border-white/60 border-b-0 bg-white/60 text-slate-900 shadow-sm shadow-sky-900/10 ring-1 ring-white/35 backdrop-blur-md'
  const tabInactive =
    theme === 'dark'
      ? 'border-transparent border-b-0 bg-slate-900/40 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
      : theme === 'purple'
        ? 'border-transparent border-b-0 bg-violet-100/45 text-violet-800 hover:bg-violet-100/75'
        : 'border-transparent border-b-0 bg-slate-100/55 text-slate-600 hover:bg-slate-200/65'
  const newTabBtn =
    theme === 'dark'
      ? 'rounded-t border border-transparent px-3 py-2 text-sm text-slate-500 hover:bg-slate-800/70 hover:text-slate-200'
      : theme === 'purple'
        ? 'rounded-t border border-transparent px-3 py-2 text-sm text-violet-700 hover:bg-violet-100/60 hover:text-violet-950'
        : 'rounded-t border border-transparent px-3 py-2 text-sm text-slate-500 hover:bg-white/40 hover:text-slate-800 hover:backdrop-blur-sm'
  const dropdownPanel = `${modalPanel} absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-b-xl py-1 shadow-lg`
  const dropdownItem =
    theme === 'dark'
      ? 'flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/90'
      : theme === 'purple'
        ? 'flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-violet-950 hover:bg-violet-50/90'
        : 'flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-white/50'
  const renameFocus =
    theme === 'dark'
      ? 'focus:border-[#c65dfb] focus:outline-none focus:ring-1 focus:ring-[#c65dfb]'
      : theme === 'purple'
        ? 'focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500'
        : 'focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500'
  const modalSectionBorder = theme === 'dark' ? 'border-slate-700' : theme === 'purple' ? 'border-violet-200/60' : 'border-white/40'
  const modalFooterBorderClass = theme === 'dark' ? 'border-slate-700' : theme === 'purple' ? 'border-violet-200/55' : 'border-white/40'

  return (
    <>
      {/* Tab bar */}
      <div className={`mb-3 flex flex-wrap items-center gap-1 border-b ${tabBarBorder}`}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`flex items-center gap-1.5 rounded-t border px-3 py-2 text-sm ${
              tab.id === activeTabId ? tabActive : tabInactive
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
                className={`min-w-[80px] rounded border border-gray-300 px-1.5 py-0.5 text-sm font-medium text-gray-900 ${renameFocus}`}
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
            className={newTabBtn}
            title="New tab"
          >
            + New tab
          </button>
          {newTabMenuOpen && (
            <div className={dropdownPanel}>
              <button
                type="button"
                onClick={onNewSheet}
                className={dropdownItem}
              >
                <span className="text-gray-400">+</span>
                New sheet
              </button>
              <button
                type="button"
                onClick={onOpenFilePicker}
                className={dropdownItem}
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
            className={`flex max-h-[80vh] w-full max-w-md flex-col rounded-xl shadow-xl ${modalPanel}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center justify-between border-b px-4 py-3 ${modalSectionBorder}`}
            >
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
                        className={tr.filePickerRow}
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
            <div
              className={`border-t px-4 py-2 ${modalFooterBorderClass}`}
            >
              <button
                type="button"
                onClick={onCloseFilePicker}
                className={`flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium ${tr.segmentInactive}`}
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

