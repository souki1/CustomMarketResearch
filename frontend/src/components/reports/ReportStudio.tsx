import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Eraser,
  FileText,
  Layers,
  Loader2,
  MousePointer2,
  Redo2,
  Sparkles,
  Stamp,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReportBlockEditor } from '@/components/reports/ReportBlockEditor'
import { ReportBlockFormatBar } from '@/components/reports/ReportBlockFormatBar'
import { FILL_TOOLS, buildFillBlock } from '@/components/reports/reportFillTools'
import type { FillToolId } from '@/components/reports/reportFillTools'
import { BTN_GHOST, BTN_ICON, BTN_PRIMARY, PAGE_SHADOW } from '@/components/reports/reportStudioStyles'
import { exportReportDocx, exportReportPdf } from '@/lib/api'
import { getCurrentUserName, getToken } from '@/lib/auth'
import type { ReportBlock, ReportBlockPdfMeta, ReportBlockType } from '@/lib/savedReports'

/* US Letter at 96 DPI, like a real PDF page. */
const PAGE_W = 816
const PAGE_H = 1056
const PAGE_PAD_X = 72
const PAGE_PAD_TOP = 72
const PAGE_PAD_BOTTOM = 88
/** Vertical space available for blocks on one page. */
const PAGE_CONTENT_H = PAGE_H - PAGE_PAD_TOP - PAGE_PAD_BOTTOM
/** Gap between blocks (must match the rendered margin between blocks). */
const BLOCK_GAP = 24
/** Height assumed for blocks that have not been measured yet. */
const UNMEASURED_BLOCK_H = 48

const ZOOM_LEVELS = [0.5, 0.65, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const

const HISTORY_LIMIT = 100

/** pdfFiller-style toolbar button: icon on top, tiny label underneath. */
function ToolStripButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
  title,
}: {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      className={`flex min-w-[50px] shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? 'bg-violet-100 text-violet-700' : 'text-slate-600 hover:bg-slate-100'
      }`}
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
    >
      <Icon className="h-4 w-4" />
      <span className="text-[10px] font-medium leading-none">{label}</span>
    </button>
  )
}

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
  /** Uploaded workspace PDF opened for fill/edit. */
  workspacePdfId?: number | null
  pdfUrl?: string | null
  readOnly?: boolean
  blocks: ReportBlock[]
  selectedId: string | null
  onSelectId: (id: string | null) => void
  onAddBlock: (type: ReportBlockType) => void
  /** Insert a fully-formed block (used by the fill toolbar: date, sign, check...). */
  onInsertBlock?: (block: ReportBlock) => void
  /** Replace the whole document — required for undo/redo. */
  onReplaceBlocks?: (blocks: ReportBlock[]) => void
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
  /** True while server analyzes PDF text/boxes. */
  pdfAnalyzing?: boolean
}

export function ReportStudio({
  docTitle,
  onDocTitleChange,
  onClose,
  onSave,
  saving = false,
  editingId,
  workspacePdfId = null,
  pdfUrl = null,
  readOnly = false,
  blocks,
  selectedId,
  onSelectId,
  onAddBlock,
  onInsertBlock,
  onReplaceBlocks,
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
  pdfAnalyzing = false,
}: ReportStudioProps) {
  const token = useMemo(() => getToken(), [])
  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null
  const isPdfMode = Boolean(pdfUrl)
  const canExport = editingId != null

  const draggableEnabled = typeof onMoveBlockToIndex === 'function'
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'docx' | 'pdf' | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pagesMenuOpen, setPagesMenuOpen] = useState(false)
  /** On-screen watermark shown on every page (display only, not exported). */
  const [watermark, setWatermark] = useState<string | null>(null)
  const [pendingFillTool, setPendingFillTool] = useState<FillToolId | null>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  /* ---- Undo / redo: snapshots of the blocks array (arrays are immutable upstream) ---- */
  const historyRef = useRef<{ undo: ReportBlock[][]; redo: ReportBlock[][] }>({ undo: [], redo: [] })
  const lastBlocksRef = useRef<ReportBlock[]>(blocks)
  const skipHistoryRef = useRef(false)
  const [, setHistoryVersion] = useState(0)

  useEffect(() => {
    if (blocks === lastBlocksRef.current) return
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false
    } else {
      historyRef.current.undo.push(lastBlocksRef.current)
      if (historyRef.current.undo.length > HISTORY_LIMIT) historyRef.current.undo.shift()
      historyRef.current.redo = []
    }
    lastBlocksRef.current = blocks
    setHistoryVersion((v) => v + 1)
  }, [blocks])

  const canUndo = historyRef.current.undo.length > 0
  const canRedo = historyRef.current.redo.length > 0

  const undo = useCallback(() => {
    const prev = historyRef.current.undo.pop()
    if (!prev || !onReplaceBlocks) return
    historyRef.current.redo.push(lastBlocksRef.current)
    skipHistoryRef.current = true
    onReplaceBlocks(prev)
    setHistoryVersion((v) => v + 1)
  }, [onReplaceBlocks])

  const redo = useCallback(() => {
    const next = historyRef.current.redo.pop()
    if (!next || !onReplaceBlocks) return
    historyRef.current.undo.push(lastBlocksRef.current)
    skipHistoryRef.current = true
    onReplaceBlocks(next)
    setHistoryVersion((v) => v + 1)
  }, [onReplaceBlocks])

  useEffect(() => {
    if (readOnly || !onReplaceBlocks) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [readOnly, onReplaceBlocks, undo, redo])

  const handleFillTool = useCallback(
    (id: FillToolId) => {
      if (isPdfMode) {
        if (pendingFillTool === id) {
          setPendingFillTool(null)
          return
        }
        setPendingFillTool(id)
        if (!onInsertBlock) return
        const block: ReportBlock = {
          ...buildFillBlock(id, getCurrentUserName()),
          pdf_x: PAGE_PAD_X + 32,
          pdf_y: PAGE_PAD_TOP + 32 + blocks.length * 48,
          pdf_page: 0,
        }
        onInsertBlock(block)
        onSelectId(block.id)
        return
      }
      const block = buildFillBlock(id, getCurrentUserName())
      if (onInsertBlock) onInsertBlock(block)
      else onAddBlock(block.type)
    },
    [isPdfMode, pendingFillTool, onInsertBlock, onAddBlock, blocks.length, onSelectId]
  )

  const placeFillBlockOnPdf = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, pageIdx: number) => {
      if (readOnly || !isPdfMode || !pendingFillTool || !onInsertBlock) return
      if (event.target !== event.currentTarget) return
      const x = Math.max(0, Math.round(event.nativeEvent.offsetX))
      const y = Math.max(0, Math.round(event.nativeEvent.offsetY))
      const block: ReportBlock = {
        ...buildFillBlock(pendingFillTool, getCurrentUserName()),
        pdf_x: x,
        pdf_y: y,
        pdf_page: pageIdx,
      }
      onInsertBlock(block)
      onSelectId(block.id)
    },
    [readOnly, isPdfMode, pendingFillTool, onInsertBlock, onSelectId]
  )

  const pdfViewerInteractive =
    isPdfMode && !readOnly && pendingFillTool === null && selectedId === null

  const dragBlockRef = useRef<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const onPdfBlockPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, block: ReportBlock) => {
      if (readOnly || !isPdfMode) return
      onSelectId(block.id)
      dragBlockRef.current = {
        id: block.id,
        startX: event.clientX,
        startY: event.clientY,
        origX: block.pdf_x ?? PAGE_PAD_X,
        origY: block.pdf_y ?? PAGE_PAD_TOP,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      event.preventDefault()
    },
    [readOnly, isPdfMode, onSelectId]
  )

  const onPdfBlockPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, block: ReportBlock) => {
      const drag = dragBlockRef.current
      if (!drag || drag.id !== block.id) return
      const dx = (event.clientX - drag.startX) / zoom
      const dy = (event.clientY - drag.startY) / zoom
      onUpdateBlock(block.id, {
        ...block,
        pdf_x: Math.max(8, Math.min(PAGE_W - 48, Math.round(drag.origX + dx))),
        pdf_y: Math.max(8, Math.min(PAGE_H - 48, Math.round(drag.origY + dy))),
      })
    },
    [onUpdateBlock, zoom]
  )

  const onPdfBlockPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    dragBlockRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  useEffect(() => {
    if (!isPdfMode || readOnly || !selectedId) return
    requestAnimationFrame(() => {
      const root = document.querySelector(`[data-pdf-block="${selectedId}"]`)
      const focusable = root?.querySelector('textarea, input') as HTMLElement | null
      focusable?.focus()
    })
  }, [selectedId, isPdfMode, readOnly, blocks])

  const toggleWatermark = useCallback(() => {
    setWatermark((prev) => {
      if (prev) return null
      const text = window.prompt('Watermark text (shown on every page):', 'CONFIDENTIAL')
      return text?.trim() ? text.trim().slice(0, 40) : null
    })
  }, [])

  const scrollToPage = useCallback((idx: number) => {
    pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setPagesMenuOpen(false)
  }, [])

  /* Measure rendered block heights so blocks flow across pages like a PDF. */
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({})
  const elToIdRef = useRef(new Map<Element, string>())
  const observerRef = useRef<ResizeObserver | null>(null)

  const getObserver = useCallback(() => {
    if (!observerRef.current) {
      observerRef.current = new ResizeObserver((entries) => {
        setBlockHeights((prev) => {
          let next: Record<string, number> | null = null
          for (const entry of entries) {
            const id = elToIdRef.current.get(entry.target)
            if (!id) continue
            const h = Math.ceil((entry.target as HTMLElement).offsetHeight)
            if (h > 0 && prev[id] !== h) {
              next = next ?? { ...prev }
              next[id] = h
            }
          }
          return next ?? prev
        })
      })
    }
    return observerRef.current
  }, [])

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

  const registerBlockEl = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      const observer = getObserver()
      for (const [element, mappedId] of elToIdRef.current) {
        if (mappedId === id && element !== el) {
          observer.unobserve(element)
          elToIdRef.current.delete(element)
        }
      }
      if (el) {
        elToIdRef.current.set(el, id)
        observer.observe(el)
      }
    },
    [getObserver]
  )

  /* Greedy pagination: fill each page until the next block would overflow. */
  const pages = useMemo(() => {
    if (isPdfMode) {
      const maxPage = blocks.reduce((m, b) => Math.max(m, b.pdf_page ?? 0), 0)
      const pageCount = Math.max(1, maxPage + 1)
      return Array.from({ length: pageCount }, (_, pageIdx) =>
        blocks
          .map((block, index) => ({ block, index }))
          .filter(({ block }) => (block.pdf_page ?? 0) === pageIdx)
      )
    }
    const out: { block: ReportBlock; index: number }[][] = [[]]
    let usedHeight = 0
    blocks.forEach((block, index) => {
      const h = blockHeights[block.id] ?? UNMEASURED_BLOCK_H
      const current = out[out.length - 1]
      const needed = current.length === 0 ? h : h + BLOCK_GAP
      if (current.length > 0 && usedHeight + needed > PAGE_CONTENT_H) {
        out.push([{ block, index }])
        usedHeight = h
      } else {
        current.push({ block, index })
        usedHeight += needed
      }
    })
    return out
  }, [blocks, blockHeights, isPdfMode])

  const pdfPageSrc = useCallback(
    (pageIdx: number) => (pdfUrl ? `${pdfUrl}#page=${pageIdx + 1}` : undefined),
    [pdfUrl]
  )

  const zoomBy = (dir: -1 | 1) => {
    setZoom((prev) => {
      const idx = ZOOM_LEVELS.findIndex((z) => Math.abs(z - prev) < 0.001)
      const nextIdx = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, (idx === -1 ? 4 : idx) + dir))
      return ZOOM_LEVELS[nextIdx]
    })
  }

  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!token || !editingId) return
    setExportError(null)
    setExporting(format)
    try {
      const blob = format === 'docx'
        ? await exportReportDocx(token, editingId)
        : await exportReportPdf(token, editingId)
      const ext = format === 'docx' ? '.docx' : '.pdf'
      const filename = `${(docTitle.trim() || 'report').slice(0, 80)}${ext}`
      triggerBlobDownload(blob, filename)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      if (format === 'pdf' && /libreoffice|soffice/i.test(message)) {
        setExportError(
          "PDF export isn't available yet. LibreOffice is required on the server. Install LibreOffice and make sure 'soffice' is on PATH."
        )
      } else {
        setExportError(message || 'Export failed')
      }
    } finally {
      setExporting(null)
    }
  }

  useEffect(() => {
    if (!downloadMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-studio-download-root]')) {
        setDownloadMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [downloadMenuOpen])

  useEffect(() => {
    if (!pagesMenuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-studio-pages-root]')) {
        setPagesMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [pagesMenuOpen])

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#e8eaed]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-3 sm:px-4">
        <button type="button" className={`${BTN_GHOST} gap-2 px-3`} onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">All reports</span>
        </button>
        <div className="h-6 w-px bg-slate-200" aria-hidden />
        <input
          type="text"
          className={`min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 text-sm font-semibold text-gray-900 placeholder:text-gray-400 transition-colors ${
            readOnly
              ? 'cursor-default bg-transparent'
              : 'bg-transparent hover:border-slate-200 hover:bg-slate-50 focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-400/30'
          }`}
          value={docTitle}
          onChange={(e) => onDocTitleChange(e.target.value)}
          onFocus={(e) => {
            if (!readOnly) e.target.select()
          }}
          readOnly={readOnly}
          placeholder="Untitled report"
          maxLength={200}
          aria-label="Report name (also used as export filename)"
          title="Click to rename — this is also the export filename"
        />
        {isPdfMode && workspacePdfId ? (
          <span className="hidden text-xs font-medium text-violet-700 sm:inline">PDF fill</span>
        ) : null}
        {canExport && (
          <div className="relative" data-studio-download-root>
            <button
              type="button"
              className={`${BTN_GHOST} gap-1.5 px-2.5`}
              onClick={() => setDownloadMenuOpen((o) => !o)}
              disabled={exporting !== null}
              title="Download"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="hidden sm:inline text-xs">Download</span>
            </button>
            {downloadMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setDownloadMenuOpen(false)
                    void handleExport('docx')
                  }}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Word (.docx)
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setDownloadMenuOpen(false)
                    void handleExport('pdf')
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF (.pdf)
                </button>
              </div>
            )}
          </div>
        )}
        {!readOnly && (
          <button type="button" className={BTN_PRIMARY} onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}
        {pdfUrl && (
          <a
            href={pdfUrl}
            download={`${(docTitle.trim() || 'document').slice(0, 80)}.pdf`}
            className={`${BTN_GHOST} gap-1.5 px-2.5`}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Download</span>
          </a>
        )}
      </header>

      {/* pdfFiller-style fill & edit tool strip */}
      {!readOnly && (
        <div className="flex h-[52px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-slate-200/80 bg-white px-2">
          {isPdfMode && pendingFillTool && (
            <p className="mr-2 shrink-0 text-xs font-medium text-violet-700">
              {FILL_TOOLS.find((t) => t.id === pendingFillTool)?.label ?? 'Field'} active — click the page to place
              another
            </p>
          )}
          <div className="relative" data-studio-pages-root>
            <ToolStripButton
              icon={Layers}
              label="Pages"
              active={pagesMenuOpen}
              onClick={() => setPagesMenuOpen((o) => !o)}
              title="Jump to page"
            />
            {pagesMenuOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 max-h-64 w-36 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-md">
                {pages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                    onClick={() => scrollToPage(i)}
                  >
                    Page {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToolStripButton icon={Undo2} label="Undo" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" />
          <ToolStripButton icon={Redo2} label="Redo" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" />
          <div className="mx-1 h-7 w-px shrink-0 bg-slate-200" aria-hidden />
          <ToolStripButton
            icon={MousePointer2}
            label="Select"
            active={selectedId === null && pendingFillTool === null}
            onClick={() => {
              setPendingFillTool(null)
              onSelectId(null)
            }}
            title="Deselect"
          />
          {FILL_TOOLS.slice(0, 3).map(({ id, label, icon }) => (
            <ToolStripButton
              key={id}
              icon={icon}
              label={label}
              active={pendingFillTool === id}
              onClick={() => handleFillTool(id)}
            />
          ))}
          <ToolStripButton
            icon={Eraser}
            label="Erase"
            disabled={!selectedId || (!isPdfMode && blocks.length <= 1)}
            onClick={() => {
              if (selectedId) onRemoveBlock(selectedId)
            }}
            title="Erase selected block"
          />
          {FILL_TOOLS.slice(3).map(({ id, label, icon }) => (
            <ToolStripButton
              key={id}
              icon={icon}
              label={label}
              active={pendingFillTool === id}
              onClick={() => handleFillTool(id)}
            />
          ))}
          <div className="mx-1 h-7 w-px shrink-0 bg-slate-200" aria-hidden />
          <ToolStripButton
            icon={Stamp}
            label="Watermark"
            active={watermark !== null}
            onClick={toggleWatermark}
            title="Watermark (on-screen only)"
          />
        </div>
      )}

      {readOnly && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">
          Read-only preview mode
        </div>
      )}
      {isPdfMode && !readOnly && (
        <div className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-xs leading-relaxed text-violet-900">
          <span className="font-semibold">Smart PDF edit:</span> text and form boxes are detected automatically
          (dashed outlines). Click any region to edit like Word. Use toolbar tools to add more fields, then{' '}
          <span className="font-semibold">Save</span>.
        </div>
      )}
      {pdfAnalyzing && (
        <div className="flex items-center gap-2 border-b border-violet-200 bg-violet-50 px-4 py-2 text-xs text-violet-800">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Analyzing PDF — detecting text and form fields…
        </div>
      )}
      {exportError && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {exportError}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-stretch overflow-hidden">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col self-stretch">
          <div className="min-h-0 flex-1 overflow-auto px-4 py-8 sm:px-8">
            {showAiComposer && (
              <div className="mx-auto mb-4 w-full max-w-[816px] rounded-xl border border-violet-200 bg-violet-50/70 p-3 sm:p-4">
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
            <div className="mx-auto flex w-fit flex-col items-center gap-6" style={{ zoom }}>
              {pages.map((pageBlocks, pageIdx) => (
                <div
                  key={pageIdx}
                  className="relative"
                  ref={(el) => {
                    pageRefs.current[pageIdx] = el
                  }}
                >
                  <div
                    className={`relative bg-white ${PAGE_SHADOW} rounded-sm ${
                      isPdfMode && pendingFillTool ? 'cursor-crosshair' : ''
                    }`}
                    style={{
                      width: PAGE_W,
                      height: PAGE_H,
                      ...(isPdfMode
                        ? {}
                        : {
                            paddingLeft: PAGE_PAD_X,
                            paddingRight: PAGE_PAD_X,
                            paddingTop: PAGE_PAD_TOP,
                            paddingBottom: PAGE_PAD_BOTTOM,
                          }),
                    }}
                    onClick={(e) => {
                      if (isPdfMode && pendingFillTool) {
                        placeFillBlockOnPdf(e, pageIdx)
                        return
                      }
                      onSelectId(null)
                    }}
                    role="presentation"
                  >
                    {isPdfMode && (
                      <iframe
                        src={pdfPageSrc(pageIdx)}
                        title={`${docTitle} — page ${pageIdx + 1}`}
                        className={`absolute inset-0 z-0 h-full w-full border-0 bg-white ${
                          pdfViewerInteractive ? '' : 'pointer-events-none'
                        }`}
                      />
                    )}
                    {watermark && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                        <span
                          className="select-none whitespace-nowrap text-7xl font-extrabold uppercase tracking-widest text-slate-900/5"
                          style={{ transform: 'rotate(-35deg)' }}
                        >
                          {watermark}
                        </span>
                      </div>
                    )}
                    <div
                      className={`relative z-10 ${
                        isPdfMode ? 'pointer-events-none absolute inset-0' : 'h-full space-y-6 overflow-hidden'
                      }`}
                      onClick={(e) => {
                        if (isPdfMode && pendingFillTool) return
                        e.stopPropagation()
                      }}
                    >
                      {pageBlocks.map(({ block: b, index: idx }) => {
                        const pdfMeta = b as ReportBlock & ReportBlockPdfMeta
                        const overlayStyle =
                          isPdfMode
                            ? {
                                position: 'absolute' as const,
                                left: pdfMeta.pdf_x ?? PAGE_PAD_X,
                                top: pdfMeta.pdf_y ?? PAGE_PAD_TOP + idx * 48,
                                width: pdfMeta.pdf_width ? `${pdfMeta.pdf_width}px` : undefined,
                                minHeight: pdfMeta.pdf_height ? `${pdfMeta.pdf_height}px` : undefined,
                                pointerEvents: 'auto' as const,
                                maxWidth: PAGE_W - 16,
                              }
                            : undefined
                        return (
                        <div
                          key={b.id}
                          data-pdf-block={b.id}
                          ref={registerBlockEl(b.id)}
                          style={overlayStyle}
                          className={`relative ${
                            isPdfMode && !readOnly ? 'cursor-move' : ''
                          } ${
                            readOnly
                              ? ''
                              : `rounded-[2px] outline-dashed outline-1 outline-offset-4 ${
                                  selectedId === b.id
                                    ? 'outline-violet-300'
                                    : 'outline-slate-200 hover:outline-slate-300'
                                }`
                          } ${dragOverId === b.id && draggingId !== b.id ? 'ring-2 ring-violet-200/80 ring-offset-2 ring-offset-white' : ''} ${
                            draggingId === b.id ? 'opacity-60' : ''
                          }`}
                          onPointerDown={(e) => onPdfBlockPointerDown(e, b)}
                          onPointerMove={(e) => onPdfBlockPointerMove(e, b)}
                          onPointerUp={onPdfBlockPointerUp}
                          onPointerCancel={onPdfBlockPointerUp}
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
                          {/* Floating toolbar — absolutely positioned so it never changes
                              the block's measured height (which would re-paginate). */}
                          {!readOnly && selectedId === b.id && (
                            <div className="absolute bottom-full left-0 z-30 mb-1.5 flex max-w-[672px] flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md">
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
                                disabled={!isPdfMode && blocks.length <= 1}
                                onClick={() => onRemoveBlock(b.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                              {selectedBlock && selectedBlock.id === b.id && (
                                <div className="border-l border-slate-200 pl-1">
                                  <ReportBlockFormatBar
                                    block={selectedBlock}
                                    onChange={(next) => onUpdateBlock(b.id, next)}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                          <fieldset disabled={readOnly} className={isPdfMode ? 'min-w-0 border-0 p-0' : undefined}>
                            <ReportBlockEditor
                              block={b}
                              selected={readOnly ? false : selectedId === b.id}
                              pdfOverlay={
                                isPdfMode
                                  ? {
                                      pdf_role: pdfMeta.pdf_role,
                                      pdf_width: pdfMeta.pdf_width,
                                      pdf_height: pdfMeta.pdf_height,
                                      pdf_auto: pdfMeta.pdf_auto,
                                      pdf_field_name: pdfMeta.pdf_field_name,
                                    }
                                  : undefined
                              }
                              onSelect={() => {
                                if (!readOnly) onSelectId(b.id)
                              }}
                              onChange={(next) => onUpdateBlock(b.id, next)}
                            />
                          </fieldset>
                        </div>
                        )
                      })}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-7 text-center text-[11px] tracking-wide text-slate-400">
                      {docTitle.trim() ? `${docTitle.trim()} — ` : ''}Page {pageIdx + 1} of {pages.length}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Zoom + page count, floating like a PDF viewer */}
          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-md">
            <span className="px-1.5 text-[11px] font-medium text-slate-500">
              {pages.length} page{pages.length !== 1 ? 's' : ''}
            </span>
            <div className="h-4 w-px bg-slate-200" aria-hidden />
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              title="Zoom out"
              disabled={zoom <= ZOOM_LEVELS[0]}
              onClick={() => zoomBy(-1)}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="min-w-[44px] rounded-md px-1 text-center text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
              title="Reset zoom"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              title="Zoom in"
              disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              onClick={() => zoomBy(1)}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
