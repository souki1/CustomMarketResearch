import { ChevronDown, Pencil, Plus, X } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
  /** Modal heading; defaults to "Open file" */
  filePickerTitle?: string
  filePickerBusy?: boolean
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
    filePickerTitle = 'Open file',
    filePickerBusy = false,
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

  const [tabMenuOpenId, setTabMenuOpenId] = useState<string | null>(null)
  const tabMenuRef = useRef<HTMLDivElement | null>(null)

  const newTabBtnRef = useRef<HTMLButtonElement | null>(null)
  const newTabMenuRef = useRef<HTMLDivElement | null>(null)
  const [newTabMenuPos, setNewTabMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => {
    // Keep dropdown attached to currently active tab.
    setTabMenuOpenId(null)
  }, [activeTabId])

  useEffect(() => {
    if (!tabMenuOpenId) return

    const onPointerDown = (e: PointerEvent) => {
      const el = tabMenuRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setTabMenuOpenId(null)
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [tabMenuOpenId])

  useEffect(() => {
    if (!newTabMenuOpen) return

    const updatePos = () => {
      const btn = newTabBtnRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      setNewTabMenuPos({
        top: r.bottom + 4,
        left: Math.min(r.left, window.innerWidth - 240),
        width: Math.max(160, Math.round(r.width)),
      })
    }

    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [newTabMenuOpen])

  useEffect(() => {
    if (!newTabMenuOpen) return

    const onPointerDown = (e: PointerEvent) => {
      const btn = newTabBtnRef.current
      const menu = newTabMenuRef.current
      if (!btn || !menu) return
      if (!(e.target instanceof Node)) return
      if (btn.contains(e.target) || menu.contains(e.target)) return
      onToggleNewTabMenu()
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [newTabMenuOpen, onToggleNewTabMenu])

  const newTabMenu = useMemo(() => {
    if (!newTabMenuOpen || !newTabMenuPos) return null
    return createPortal(
      <div
        ref={newTabMenuRef}
        style={{
          position: 'fixed',
          zIndex: 9999,
          top: newTabMenuPos.top,
          left: newTabMenuPos.left,
          minWidth: newTabMenuPos.width,
        }}
        className="rounded-md border border-app-separator bg-app-surface py-0.5 text-[13px] shadow-lg ring-1 ring-black/5"
        role="menu"
      >
        <button
          type="button"
          onClick={onNewSheet}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-app-secondary hover:bg-app-fill"
          role="menuitem"
        >
          <span className="text-app-tertiary">+</span>
          New sheet
        </button>
        <button
          type="button"
          onClick={onOpenFilePicker}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-app-secondary hover:bg-app-fill"
          role="menuitem"
        >
          <span className="text-app-tertiary">↺</span>
          Open file…
        </button>
      </div>,
      document.body
    )
  }, [newTabMenuOpen, newTabMenuPos, onNewSheet, onOpenFilePicker])

  return (
    <>
      {/* Tab bar */}
      <div className="flex flex-nowrap items-end gap-0 overflow-x-auto overflow-y-visible bg-app-surface px-5">
        {tabs.map((tab) => (
          <div key={tab.id} className="shrink-0">
            {editingTabId === tab.id ? (
              <div
                className={`flex items-center gap-1.5 rounded-t-md border px-3.5 py-1.5 text-xs font-medium ${
                  tab.id === activeTabId
                    ? 'border-app-separator border-b-white bg-app-bg text-app-label'
                    : 'border-transparent bg-app-surface text-app-secondary hover:text-app-secondary'
                }`}
              >
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onBlur={() => onRenameCommit(tab.id, editingName)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onRenameCommit(tab.id, editingName)
                    if (e.key === 'Escape') onRenameCancel()
                  }}
                  className="min-w-[80px] rounded border border-app-separator px-1.5 py-0.5 text-sm font-medium text-app-label focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  autoFocus
                  aria-label="Rename tab"
                />
              </div>
            ) : (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tab.id === activeTabId}
                onClick={() => onTabClick(tab.id)}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  onStartRename(tab)
                }}
                className={`flex items-center gap-1.5 rounded-t-md border px-3.5 py-1.5 text-xs font-medium ${
                  tab.id === activeTabId
                    ? 'border-app-separator border-b-white bg-app-bg text-app-label'
                    : 'border-transparent bg-app-surface text-app-secondary hover:text-app-secondary'
                }`}
                title={tab.name}
              >
                <span className="text-[11px] opacity-80" aria-hidden>
                  📄
                </span>
                <span className="max-w-[150px] truncate font-medium sm:max-w-[180px]">{tab.name}</span>

                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => onTabClose(tab.id, e)}
                    className="rounded p-0.5 text-app-tertiary hover:bg-app-fill hover:text-app-secondary"
                    aria-label="Close tab"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>

                  {/* Active-tab dropdown (Airtable-style) */}
                  {tab.id === activeTabId && (
                    <div className="relative" ref={tabMenuOpenId === tab.id ? tabMenuRef : undefined}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setTabMenuOpenId((prev) => (prev === tab.id ? null : tab.id))
                        }}
                        className="rounded p-0.5 text-app-secondary hover:bg-app-fill hover:text-app-secondary"
                        aria-label="Tab menu"
                        aria-haspopup="menu"
                        aria-expanded={tabMenuOpenId === tab.id}
                      >
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                      </button>

                      {tabMenuOpenId === tab.id && (
                        <div
                          role="menu"
                          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-app-separator bg-app-surface py-1 shadow-lg ring-1 ring-black/5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setTabMenuOpenId(null)
                              onStartRename(tab)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-app-secondary hover:bg-app-fill"
                          >
                            <Pencil className="h-4 w-4 text-app-tertiary" aria-hidden />
                            Rename
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              setTabMenuOpenId(null)
                              onTabClose(tab.id, e)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                          >
                            <X className="h-4 w-4 text-rose-400" aria-hidden />
                            Close tab
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </span>
              </button>
            )}
          </div>
        ))}
        <div className="relative">
          <button
            ref={newTabBtnRef}
            type="button"
            onClick={onToggleNewTabMenu}
            className={`shrink-0 flex items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 py-1.5 text-xs font-medium ${
              newTabMenuOpen
                ? 'border-app-separator bg-app-bg text-app-label'
                : 'border-transparent bg-app-surface text-app-secondary hover:text-app-secondary'
            }`}
            title="New tab"
            aria-haspopup="menu"
            aria-expanded={newTabMenuOpen}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New tab
            <ChevronDown className="h-3.5 w-3.5 opacity-80" aria-hidden />
          </button>
          {newTabMenu}
        </div>
      </div>

      {/* Open / transfer file picker — portaled so it isn't clipped by header overflow */}
      {filePickerOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
            onClick={() => {
              if (!filePickerBusy) onCloseFilePicker()
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-picker-title"
          >
            <div
              className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl border border-app-separator bg-app-surface shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-app-separator px-4 py-3">
                <h3 id="file-picker-title" className="text-base font-semibold text-app-label">
                  {filePickerTitle}
                </h3>
                <button
                  type="button"
                  onClick={onCloseFilePicker}
                  disabled={filePickerBusy}
                  className="rounded p-1.5 text-app-tertiary hover:bg-app-fill hover:text-app-secondary disabled:opacity-50"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {filePickerBusy && (
                  <p className="py-8 text-center text-sm text-app-secondary">Transferring…</p>
                )}
                {!filePickerBusy && filePickerLoading && (
                  <p className="py-8 text-center text-sm text-app-secondary">Loading files…</p>
                )}
                {!filePickerBusy && filePickerError && (
                  <p className="py-4 text-center text-sm text-red-600">{filePickerError}</p>
                )}
                {!filePickerBusy && !filePickerLoading && !filePickerError && filePickerFiles.length === 0 && (
                  <p className="py-8 text-center text-sm text-app-secondary">
                    No other spreadsheet files in workspace.
                  </p>
                )}
                {!filePickerBusy && !filePickerLoading && !filePickerError && filePickerFiles.length > 0 && (
                  <ul className="space-y-0.5">
                    {filePickerFiles.map((file) => (
                      <li key={file.id}>
                        <button
                          type="button"
                          disabled={filePickerBusy}
                          onClick={() => onFilePickerFileClick(file)}
                          className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm text-app-secondary hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-50"
                        >
                          <span className="truncate w-full font-medium">{file.name}</span>
                          {file.folderPath && (
                            <span className="truncate w-full text-xs text-app-secondary">{file.folderPath}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-app-separator px-4 py-2">
                <button
                  type="button"
                  onClick={onCloseFilePicker}
                  disabled={filePickerBusy}
                  className="w-full rounded-lg border border-app-separator bg-app-surface px-4 py-2 text-sm font-medium text-app-secondary hover:bg-app-fill disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}

