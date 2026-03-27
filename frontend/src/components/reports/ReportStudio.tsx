import { ArrowLeft, ChevronDown, ChevronUp, Download, FileText, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ReportBlockEditor } from '@/components/reports/ReportBlockEditor'
import { ReportBlockFormatBar } from '@/components/reports/ReportBlockFormatBar'
import { ELEMENT_TOOLS } from '@/components/reports/reportElementTools'
import { BTN_GHOST, BTN_ICON, BTN_PRIMARY, PAGE_SHADOW } from '@/components/reports/reportStudioStyles'
import { exportReportDocx, exportReportPdf } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { ReportBlock, ReportBlockType } from '@/lib/savedReports'

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export type ReportStudioProps = {
  docTitle: string
  onDocTitleChange: (title: string) => void
  onClose: () => void
  onSave: () => void
  saving?: boolean
  editingId?: number | null
  blocks: ReportBlock[]
  selectedId: string | null
  onSelectId: (id: string | null) => void
  onAddBlock: (type: ReportBlockType) => void
  onUpdateBlock: (id: string, next: ReportBlock) => void
  onRemoveBlock: (id: string) => void
  onMoveBlock: (id: string, dir: -1 | 1) => void
  onMoveBlockToIndex?: (id: string, toIndex: number) => void
  showAiComposer?: boolean
  aiPrompt?: string
  aiGenerating?: boolean
  aiError?: string | null
  aiContextHint?: string | null
  onAiPromptChange?: (prompt: string) => void
  onGenerateWithAi?: () => void
}

export function ReportStudio({
  docTitle,
  onDocTitleChange,
  onClose,
  onSave,
  saving = false,
  editingId,
  blocks,
  selectedId,
  onSelectId,
  onAddBlock,
  onUpdateBlock,
  onRemoveBlock,
  onMoveBlock,
  onMoveBlockToIndex,
  showAiComposer = false,
  aiPrompt = '',
  aiGenerating = false,
  aiError = null,
  aiContextHint,
  onAiPromptChange,
  onGenerateWithAi,
}: ReportStudioProps) {
  const token = useMemo(() => getToken(), [])
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null
  const canExport = editingId != null

  const draggableEnabled = typeof onMoveBlockToIndex === 'function'
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null)

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!token || !editingId) return
    setExporting(format)
    try {
      const blob = format === 'docx'
        ? await exportReportDocx(token, editingId)
        : await exportReportPdf(token, editingId)
      const ext = format === 'docx' ? '.docx' : '.pdf'
      const filename = `${(docTitle.trim() || 'report').slice(0, 80)}${ext}`
      triggerBlobDownload(blob, filename)
    } catch {
      // export failed silently
    } finally {
      setExporting(null)
    }
  }

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
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-gray-900 placeholder:text-gray-400 transition-colors hover:border-slate-200 hover:bg-slate-50 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30"
          value={docTitle}
          onChange={(e) => onDocTitleChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="Untitled report"
          maxLength={200}
          aria-label="Report name (also used as export filename)"
          title="Click to rename — this is also the export filename"
        />
        {canExport && (
          <>
            <button
              type="button"
              className={`${BTN_GHOST} gap-1.5 px-2.5`}
              onClick={() => void handleExport('docx')}
              disabled={exporting !== null}
              title="Export as DOCX"
            >
              {exporting === 'docx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              <span className="hidden sm:inline text-xs">DOCX</span>
            </button>
            <button
              type="button"
              className={`${BTN_GHOST} gap-1.5 px-2.5`}
              onClick={() => void handleExport('pdf')}
              disabled={exporting !== null}
              title="Export as PDF"
            >
              {exporting === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline text-xs">PDF</span>
            </button>
          </>
        )}
        <button type="button" className={BTN_PRIMARY} onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          {saving ? 'Saving...' : 'Save'}
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
            {showAiComposer && (
              <div className="mx-auto mb-4 w-full max-w-[560px] rounded-xl border border-violet-200 bg-violet-50/70 p-3 sm:p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Make report with AI</p>
                {aiContextHint ? <p className="mt-2 text-xs text-violet-900/80">{aiContextHint}</p> : null}
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50"
                    value={aiPrompt}
                    onChange={(e) => onAiPromptChange?.(e.target.value)}
                    placeholder="Describe the report you want (topic, audience, sections...)"
                    maxLength={800}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (!aiGenerating) onGenerateWithAi?.()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={`${BTN_PRIMARY} shrink-0`}
                    onClick={() => onGenerateWithAi?.()}
                    disabled={aiGenerating || !aiPrompt.trim()}
                  >
                    {aiGenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {aiGenerating ? 'Generating...' : 'Generate'}
                  </button>
                </div>
                {aiError && <p className="mt-2 text-xs text-red-700">{aiError}</p>}
              </div>
            )}
            <div
              className={`mx-auto min-h-[720px] w-full max-w-[560px] bg-white ${PAGE_SHADOW} rounded-sm px-10 py-12 sm:px-14 sm:py-16`}
              onClick={() => onSelectId(null)}
              role="presentation"
            >
              <div className="space-y-6" onClick={(e) => e.stopPropagation()}>
                {blocks.map((b, idx) => (
                  <div
                    key={b.id}
                    className={`relative ${dragOverId === b.id && draggingId !== b.id ? 'ring-2 ring-violet-200/80 ring-offset-2 ring-offset-white' : ''} ${
                      draggingId === b.id ? 'opacity-60' : ''
                    }`}
                    onDragEnter={() => {
                      if (!draggableEnabled || !draggingId) return
                      setDragOverId(b.id)
                    }}
                    onDragOver={(e) => {
                      if (!draggableEnabled) return
                      e.preventDefault() // allow dropping
                      e.dataTransfer.dropEffect = 'move'
                    }}
                    onDrop={(e) => {
                      if (!draggableEnabled) return
                      e.preventDefault()
                      const fromId = e.dataTransfer.getData('text/plain')
                      if (!fromId || fromId === b.id) return
                      onMoveBlockToIndex?.(fromId, idx)
                      setDraggingId(null)
                      setDragOverId(null)
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDragOverId(null)
                    }}
                    role="listitem"
                    aria-roledescription="Draggable report block"
                  >
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
                    {selectedId === b.id ? (
                      <div className="flex items-start gap-2">
                        <div className="pt-2">
                          <button
                            type="button"
                            draggable={draggableEnabled}
                            onDragStart={(e) => {
                              if (!draggableEnabled) return
                              setDraggingId(b.id)
                              setDragOverId(null)
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', b.id)
                            }}
                            onDragEnd={() => {
                              setDraggingId(null)
                              setDragOverId(null)
                            }}
                            title="Drag to reorder"
                            aria-label="Drag to reorder"
                            className={`${BTN_ICON} cursor-move select-none`}
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                              <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
                            </svg>
                          </button>
                        </div>
                        <div className="min-w-0 flex-1">
                          <ReportBlockEditor
                            block={b}
                            selected={selectedId === b.id}
                            onSelect={() => onSelectId(b.id)}
                            onChange={(next) => onUpdateBlock(b.id, next)}
                          />
                        </div>
                      </div>
                    ) : (
                      <ReportBlockEditor
                        block={b}
                        selected={selectedId === b.id}
                        onSelect={() => onSelectId(b.id)}
                        onChange={(next) => onUpdateBlock(b.id, next)}
                      />
                    )}
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
