import { ArrowLeft, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { ReportBlockEditor } from '@/components/reports/ReportBlockEditor'
import { ReportBlockFormatBar } from '@/components/reports/ReportBlockFormatBar'
import { ELEMENT_TOOLS } from '@/components/reports/reportElementTools'
import { BTN_GHOST, BTN_ICON, BTN_PRIMARY, PAGE_SHADOW } from '@/components/reports/reportStudioStyles'
import type { ReportBlock, ReportBlockType } from '@/lib/savedReports'

export type ReportStudioProps = {
  docTitle: string
  onDocTitleChange: (title: string) => void
  onClose: () => void
  onSave: () => void
  blocks: ReportBlock[]
  selectedId: string | null
  onSelectId: (id: string | null) => void
  onAddBlock: (type: ReportBlockType) => void
  onUpdateBlock: (id: string, next: ReportBlock) => void
  onRemoveBlock: (id: string) => void
  onMoveBlock: (id: string, dir: -1 | 1) => void
}

export function ReportStudio({
  docTitle,
  onDocTitleChange,
  onClose,
  onSave,
  blocks,
  selectedId,
  onSelectId,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
}: ReportStudioProps) {
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col bg-[#e8eaed]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-3 sm:px-4">
        <button type="button" className={`${BTN_GHOST} gap-2 px-3`} onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">All reports</span>
        </button>
        <div className="h-6 w-px bg-slate-200" aria-hidden />
        <input
          type="text"
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
          value={docTitle}
          onChange={(e) => onDocTitleChange(e.target.value)}
          placeholder="Untitled report"
          maxLength={200}
          aria-label="Report name"
        />
        <button type="button" className={BTN_PRIMARY} onClick={onSave}>
          Save
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className="hidden w-52 shrink-0 flex-col border-r border-slate-200/80 bg-white py-4 pl-3 pr-2 sm:flex"
          aria-label="Elements"
        >
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Elements</p>
          <p className="mt-1 px-2 text-[11px] leading-snug text-slate-400">Click to add to your page</p>
          <ul className="mt-4 max-h-[calc(100vh-12rem)] space-y-1 overflow-y-auto pr-1">
            {ELEMENT_TOOLS.map(({ type, label, icon: Icon }) => (
              <li key={type}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-gray-700 hover:bg-slate-100"
                  onClick={() => onAddBlock(type)}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
          <div className="flex-1 overflow-auto px-4 py-8 sm:px-8">
            <div
              className={`mx-auto min-h-[720px] w-full max-w-[560px] bg-white ${PAGE_SHADOW} rounded-sm px-10 py-12 sm:px-14 sm:py-16`}
              onClick={() => onSelectId(null)}
              role="presentation"
            >
              <div className="space-y-6" onClick={(e) => e.stopPropagation()}>
                {blocks.map((b, idx) => (
                  <div key={b.id} className="relative">
                    {selectedId === b.id && (
                      <>
                        <div className="mb-2 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            className={BTN_ICON}
                            title="Move up"
                            disabled={idx === 0}
                            onClick={() => onMoveBlock(b.id, -1)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={BTN_ICON}
                            title="Move down"
                            disabled={idx === blocks.length - 1}
                            onClick={() => onMoveBlock(b.id, 1)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={`${BTN_ICON} text-red-600 hover:border-red-200 hover:bg-red-50`}
                            title="Remove block"
                            disabled={blocks.length <= 1}
                            onClick={() => onRemoveBlock(b.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {selectedBlock && selectedBlock.id === b.id && (
                          <ReportBlockFormatBar block={selectedBlock} onChange={(next) => onUpdateBlock(b.id, next)} />
                        )}
                      </>
                    )}
                    <ReportBlockEditor
                      block={b}
                      selected={selectedId === b.id}
                      onSelect={() => onSelectId(b.id)}
                      onChange={(next) => onUpdateBlock(b.id, next)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="max-h-64 overflow-y-auto border-t border-slate-200/80 bg-white p-3 sm:max-h-none sm:border-l lg:w-52 lg:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick add</p>
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              {ELEMENT_TOOLS.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  title={label}
                  className="flex flex-col items-center gap-1 rounded-lg border border-slate-100 bg-slate-50 py-2 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                  onClick={() => onAddBlock(type)}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate px-0.5">{label}</span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
