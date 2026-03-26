import type { MouseEvent as ReactMouseEvent, RefObject } from 'react'
import { Layers, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import type { CompareTab } from '@/components/compare/types'

type Props = {
  open: boolean
  compareTabs: CompareTab[]
  activeCompareTabId: string | null
  newTabMenuOpen: boolean
  setNewTabMenuOpen: (updater: (open: boolean) => boolean) => void
  onOpenSidebar: () => void
  onCloseSidebar: () => void
  onAddNewTab: () => void
  onOpenFilePicker: () => void
  onSetActiveTab: (tabId: string) => void
  onCloseTab: (e: ReactMouseEvent, tabId: string) => void
  renamingTabId: string | null
  renameValue: string
  setRenameValue: (value: string) => void
  onStartRenaming: (tabId: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  renameInputRef: RefObject<HTMLInputElement | null>
}

export function CompareSheetsSidebar({
  open,
  compareTabs,
  activeCompareTabId,
  newTabMenuOpen,
  setNewTabMenuOpen,
  onOpenSidebar,
  onCloseSidebar,
  onAddNewTab,
  onOpenFilePicker,
  onSetActiveTab,
  onCloseTab,
  renamingTabId,
  renameValue,
  setRenameValue,
  onStartRenaming,
  onCommitRename,
  onCancelRename,
  renameInputRef,
}: Props) {
  if (!open) {
    return (
      <div
        className="flex h-full w-10 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 sm:w-11"
        aria-label="Compare sheets (collapsed)"
      >
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex h-10 w-full shrink-0 items-center justify-center border-b border-slate-200/80 text-slate-500 transition-colors hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
          title="Expand sheets panel"
          aria-label="Show compare sheets"
          aria-expanded={false}
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden />
        </button>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto overflow-x-hidden py-2">
          {compareTabs.map((tab) => {
            const active = tab.id === activeCompareTabId
            const words = (tab.name || 'S').trim().split(/\s+/)
            const abbr =
              words.length >= 2
                ? (words[0]![0]! + words[1]![0]!).toUpperCase()
                : words[0]!.slice(0, 2).toUpperCase()
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSetActiveTab(tab.id)}
                title={tab.name}
                aria-label={tab.name}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tracking-tight transition-all sm:h-9 sm:w-9 ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-500 hover:bg-white/80 hover:text-slate-800 hover:shadow-sm'
                }`}
              >
                {abbr}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onAddNewTab}
          className="flex h-10 w-full shrink-0 items-center justify-center border-t border-slate-200/80 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
          title="New sheet"
          aria-label="Add new sheet"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <aside
      className="flex h-full min-h-0 w-52 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 md:w-56 lg:w-60"
      aria-label="Compare sheets"
    >
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-2 sm:px-3 sm:py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <h2 className="truncate text-sm font-semibold text-slate-900">Sheets</h2>
        </div>
        <button
          type="button"
          onClick={onCloseSidebar}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
          title="Hide sheets"
          aria-label="Hide compare sheets"
          aria-expanded
        >
          <PanelLeftClose className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="relative border-b border-slate-200/80 p-1.5 sm:p-2">
        <button
          type="button"
          onClick={() => setNewTabMenuOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 sm:px-3 sm:py-2.5 sm:text-sm"
        >
          <span className="text-slate-400" aria-hidden>
            +
          </span>
          <span className="min-w-0 leading-snug">New sheet</span>
        </button>
        {newTabMenuOpen && (
          <div className="absolute left-1.5 right-1.5 top-full z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-950/5 sm:left-2 sm:right-2">
            <button
              type="button"
              onClick={onAddNewTab}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="text-slate-400">+</span>
              Blank sheet
            </button>
            <button
              type="button"
              onClick={() => {
                setNewTabMenuOpen(() => false)
                onOpenFilePicker()
              }}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="text-slate-400">↺</span>
              Open file…
            </button>
          </div>
        )}
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-1.5 pb-3 pt-1 sm:px-2" role="list">
        {compareTabs.map((tab) => {
          const active = tab.id === activeCompareTabId
          const isRenaming = renamingTabId === tab.id
          return (
            <li key={tab.id}>
              <div
                className={`flex items-stretch gap-0.5 rounded-xl text-left text-xs transition-colors sm:text-sm ${
                  active
                    ? 'bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-700 hover:bg-white/80 hover:shadow-sm'
                }`}
              >
                {isRenaming ? (
                  <input
                    ref={renameInputRef}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={onCommitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onCommitRename()
                      if (e.key === 'Escape') onCancelRename()
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none ring-2 ring-violet-400/30 sm:px-3 sm:py-2"
                    aria-label={`Rename sheet ${tab.name}`}
                  />
                ) : (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => onSetActiveTab(tab.id)}
                    onDoubleClick={() => onStartRenaming(tab.id)}
                    className="min-w-0 flex-1 truncate px-2 py-2 text-left sm:px-3 sm:py-2.5"
                    title="Double-click to rename"
                  >
                    <span className="line-clamp-2 wrap-break-word">{tab.name}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => onCloseTab(e, tab.id)}
                  className={`flex shrink-0 items-center justify-center rounded-lg px-1.5 transition-colors ${
                    active
                      ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                      : 'text-slate-400 hover:bg-slate-200/80 hover:text-slate-700'
                  }`}
                  aria-label={`Close ${tab.name}`}
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
