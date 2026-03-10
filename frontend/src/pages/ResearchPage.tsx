import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getToken } from '@/lib/auth'
import { getWorkspaceFileContent, listWorkspaceItems } from '@/lib/api'
import { useBucket } from '@/contexts/BucketContext'
import { useComparison } from '@/contexts/ComparisonContext'
import { useLayout } from '@/contexts/LayoutContext'

type TabState = {
  id: string
  name: string
  data: string[][]
  fileId: number | null
  folderPath?: string | null
}

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  return lines.map((line) => {
    const row: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') inQuotes = !inQuotes
      else if (c === ',' && !inQuotes) {
        row.push(cell.trim())
        cell = ''
      } else cell += c
    }
    row.push(cell.trim())
    return row
  })
}

function newBlankSheet(): TabState {
  const header = Array.from({ length: DEFAULT_SHEET_COLS }, () => '')
  const rows = Array.from({ length: DEFAULT_SHEET_ROWS }, () =>
    Array.from({ length: DEFAULT_SHEET_COLS }, () => '')
  )
  return {
    id: crypto.randomUUID(),
    name: 'New sheet',
    data: [header, ...rows],
    fileId: null,
    folderPath: null,
  }
}
const ROWS_PER_PAGE_OPTIONS: number[] = [10, 25, 50, 100]
const DEFAULT_SHEET_ROWS = 10
const DEFAULT_SHEET_COLS = 10

export function ResearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fileIdParam = searchParams.get('fileId')
  const nameFromUrl = searchParams.get('name')
  const folderFromUrl = searchParams.get('folder')
  const [tabs, setTabs] = useState<TabState[]>(() => [newBlankSheet()])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(new Set())
  const [rowsPerPage, setRowsPerPage] = useState(25)
  const [page, setPage] = useState(1)
  const [toolbarActive, setToolbarActive] = useState<'all' | 'selected' | 'deep' | null>('all')
  // Removed "Other options" menu
  // const [otherMenuOpen, setOtherMenuOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [filePickerFiles, setFilePickerFiles] = useState<{ id: number; name: string; folderPath: string | null }[]>([])
  const [filePickerLoading, setFilePickerLoading] = useState(false)
  const [filePickerError, setFilePickerError] = useState<string | null>(null)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)
  const [inspectorMaximized, setInspectorMaximized] = useState(false)
  const [inspectorMode, setInspectorMode] = useState<'single' | 'multi'>('single')
  const [inspectorMultiRowIndices, setInspectorMultiRowIndices] = useState<number[]>([])
  const [inspectorCompareSelection, setInspectorCompareSelection] = useState<Set<number>>(new Set())
  const [addRowPopover, setAddRowPopover] = useState<{
    open: boolean
    x: number
    y: number
  }>({ open: false, x: 0, y: 0 })
  const [addRowCountDraft, setAddRowCountDraft] = useState('1')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { setCollapseSidebarForInspector } = useLayout()
  const { addItem, showToast } = useBucket()
  const { openWithItems: openComparison, closeAndClear: clearComparison } = useComparison()
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const content = activeTab?.data ?? null
  const effectiveTabId = activeTab?.id ?? tabs[0]?.id ?? null

  useEffect(() => {
    if (tabs.length > 0 && (!activeTabId || !tabs.some((t) => t.id === activeTabId))) {
      setActiveTabId(tabs[0].id)
    }
  }, [tabs, activeTabId])

  // Fetch all workspace files when file picker opens
  useEffect(() => {
    if (!filePickerOpen) return
    const token = getToken()
    if (!token) {
      setFilePickerError('Sign in to open files.')
      return
    }
    setFilePickerLoading(true)
    setFilePickerError(null)
    type FileEntry = { id: number; name: string; folderPath: string | null }
    async function collectFiles(parentId: number | null, pathPrefix: string): Promise<FileEntry[]> {
      const items = await listWorkspaceItems(parentId, token!)
      const result: FileEntry[] = []
      for (const item of items) {
        if (item.is_folder) {
          const nextPrefix = pathPrefix ? `${pathPrefix} / ${item.name}` : item.name
          result.push(...(await collectFiles(item.id, nextPrefix)))
        } else {
          result.push({ id: item.id, name: item.name, folderPath: pathPrefix || null })
        }
      }
      return result
    }
    collectFiles(null, '')
      .then(setFilePickerFiles)
      .catch((err) => setFilePickerError(err instanceof Error ? err.message : 'Failed to load files'))
      .finally(() => setFilePickerLoading(false))
  }, [filePickerOpen])

  useEffect(() => {
    if (!fileIdParam) return
    const token = getToken()
    if (!token) {
      setError('Sign in to view file content.')
      return
    }
    const numericId = Number(fileIdParam)
    const existing = tabs.find((t) => t.fileId === numericId)
    if (existing) {
      setActiveTabId(existing.id)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    getWorkspaceFileContent(numericId, token)
      .then((text) => {
        const data = parseCsv(text)
        const name = nameFromUrl ?? `File ${fileIdParam}`
        const newTab: TabState = {
          id: crypto.randomUUID(),
          name,
          data: data.length > 0 ? data : [['']],
          fileId: numericId,
          folderPath: folderFromUrl,
        }
        setTabs((prev) => {
          // If a tab for this fileId was created while we were loading, reuse it.
          const existingTab = prev.find((t) => t.fileId === numericId)
          if (existingTab) {
            setActiveTabId(existingTab.id)
            return prev
          }
          setActiveTabId(newTab.id)
          return [...prev, newTab]
        })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load file')
      })
      .finally(() => setLoading(false))
  }, [fileIdParam, nameFromUrl, folderFromUrl, tabs])

  const addNewTab = useCallback(() => {
    const tab = newBlankSheet()
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setSearchParams({}, { replace: true })
    setError(null)
  }, [setSearchParams])

  const closeTab = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      if (tabs.length <= 1) return
      const idx = tabs.findIndex((t) => t.id === id)
      if (idx < 0) return
      const next = tabs.filter((t) => t.id !== id)
      setTabs(next)
      if (activeTabId === id) {
        const nextActive = next[idx] ?? next[idx - 1] ?? next[0]
        setActiveTabId(nextActive?.id ?? null)
      }
    },
    [tabs, activeTabId]
  )

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const renameTab = useCallback((id: string, name: string) => {
    const trimmed = name.trim() || 'Untitled'
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: trimmed } : t))
    )
    setEditingTabId(null)
    setEditingName('')
  }, [])

  const startEditingTab = useCallback((tab: TabState) => {
    setEditingTabId(tab.id)
    setEditingName(tab.name)
  }, [])

  const setActiveTabData = useCallback(
    (updater: (prev: string[][]) => string[][]) => {
      if (!effectiveTabId) return
      setTabs((prev) =>
        prev.map((t) => (t.id === effectiveTabId ? { ...t, data: updater(t.data) } : t))
      )
    },
    [effectiveTabId]
  )

  const updateCell = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      setActiveTabData((prev) => {
        if (!prev.length) return prev
        const next = prev.map((row) => [...row])
        if (!next[rowIndex]) return prev
        next[rowIndex] = [...next[rowIndex]]
        while (next[rowIndex].length <= colIndex) next[rowIndex].push('')
        next[rowIndex][colIndex] = value
        return next
      })
    },
    [setActiveTabData]
  )

  // addColumn UI removed with "Other options"

  const addRow = useCallback((count: number = 1) => {
    setActiveTabData((prev) => {
      if (!prev.length) return [['']]
      const numCols = prev[0]?.length ?? 1
      const safeCount = Number.isFinite(count) ? Math.max(1, Math.min(500, Math.floor(count))) : 1
      const rows = Array.from({ length: safeCount }, () => Array(numCols).fill(''))
      return [...prev, ...rows]
    })
  }, [setActiveTabData])

  const removeSelectedRows = useCallback(() => {
    if (!content || selectedRows.size === 0) return
    setDeleteConfirmOpen(true)
  }, [content, selectedRows.size])

  const confirmDeleteSelectedRows = useCallback(() => {
    if (!content || selectedRows.size === 0) {
      setDeleteConfirmOpen(false)
      return
    }

    // selectedRows are 0-based indices into data rows; content includes header row at index 0
    const toRemove = Array.from(selectedRows)
      .map((i) => i + 1)
      .sort((a, b) => b - a)

    setActiveTabData((prev) => {
      if (!prev.length) return prev
      const next = [...prev]
      for (const idx of toRemove) {
        if (idx > 0 && idx < next.length) next.splice(idx, 1)
      }
      return next
    })

    setSelectedRows(new Set())
    setSelectedRowIndex(null)
    setIsInspectorOpen(false)
    setInspectorMaximized(false)
    setInspectorMode('single')
    setInspectorMultiRowIndices([])
    setInspectorCompareSelection(new Set())
    setCollapseSidebarForInspector(false)
    setDeleteConfirmOpen(false)
  }, [
    content,
    selectedRows,
    setActiveTabData,
    setCollapseSidebarForInspector,
  ])

  const openAddRowPopover = (anchor: HTMLElement | null) => {
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setAddRowCountDraft('1')
    const POPOVER_H = 170
    const gap = 6
    const bottomY = rect.bottom + gap
    const topY = rect.top - gap - POPOVER_H
    const openUp = bottomY + POPOVER_H > window.innerHeight - 8 && topY >= 8
    setAddRowPopover({
      open: true,
      x: Math.max(8, rect.left),
      y: openUp ? topY : bottomY,
    })
  }

  const closeAddRowPopover = () => setAddRowPopover((p) => ({ ...p, open: false }))

  const commitAddRows = (n: number) => {
    if (!n || n < 1) return
    addRow(n)
    closeAddRowPopover()
  }

  useEffect(() => {
    if (!addRowPopover.open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAddRowPopover()
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-add-row-popover]')) return
      closeAddRowPopover()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [addRowPopover.open])

  const toggleRowSelection = (rowIndex: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowIndex)) next.delete(rowIndex)
      else next.add(rowIndex)
      return next
    })
  }

  // Cell click: open inspector for this row, or switch to this row, or close if same row
  const handleCellClick = useCallback(
    (dataRowIndex: number) => {
      if (selectedRowIndex === dataRowIndex) {
        setSelectedRowIndex(null)
        setIsInspectorOpen(false)
        setInspectorMaximized(false)
        setInspectorMode('single')
        setInspectorMultiRowIndices([])
        setInspectorCompareSelection(new Set())
        setCollapseSidebarForInspector(false)
      } else {
        setSelectedRowIndex(dataRowIndex)
        setIsInspectorOpen(true)
        setInspectorMode('single')
        setInspectorMultiRowIndices([])
        setInspectorCompareSelection(new Set([dataRowIndex]))
        setCollapseSidebarForInspector(true)
      }
    },
    [selectedRowIndex, setCollapseSidebarForInspector]
  )

  const toggleSelectAll = () => {
    if (!content || content.length <= 1) return
    if (selectedRows.size >= content.length - 1) setSelectedRows(new Set())
    else setSelectedRows(new Set(Array.from({ length: content.length - 1 }, (_, i) => i)))
  }

  const totalDataRows = content ? content.length - 1 : 0
  const totalPages = Math.max(1, Math.ceil(totalDataRows / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const startRow = (currentPage - 1) * rowsPerPage
  const endRow = Math.min(startRow + rowsPerPage, totalDataRows)
  const pageRows = content ? content.slice(1 + startRow, 1 + endRow) : []
  const rowIndices = pageRows.map((_, i) => startRow + i)

  if (!content && !loading && !error && tabs.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Data Research</h2>
        <p className="max-w-sm text-sm text-gray-500">
          Open a file from Home or start with a new sheet.
        </p>
        <div className="flex gap-2">
          <Link
            to="/"
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Go to Home
          </Link>
          <button
            type="button"
            onClick={addNewTab}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + New tab
          </button>
        </div>
      </div>
    )
  }

  if (!fileIdParam && tabs.length > 0 && !activeTab) {
    return null
  }

  const numCols = content?.[0]?.length ?? 0
  const activePathLabel =
    activeTab && activeTab.name
      ? ['All Files', activeTab.folderPath, activeTab.name].filter(Boolean).join(' / ')
      : ''
  const headers = content?.[0] ?? []
  const selectedRowData =
    selectedRowIndex != null && content
      ? content[1 + selectedRowIndex] ?? null
      : null

  const closeInspector = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation()
      setSelectedRowIndex(null)
      setIsInspectorOpen(false)
      setInspectorMaximized(false)
      setInspectorMode('single')
      setInspectorMultiRowIndices([])
      setInspectorCompareSelection(new Set())
      setCollapseSidebarForInspector(false)
    },
    [setCollapseSidebarForInspector]
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isInspectorOpen) closeInspector()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isInspectorOpen, closeInspector])

  // Restore inspector state (or checkbox selection) when returning from /compare via Cancel
  useEffect(() => {
    const st = location.state as
      | {
          restoreResearchSelection?: {
            selectedRows: number[]
            activeTabId: string | null
            page: number
            rowsPerPage: number
          }
          restoreInspector?: {
            mode: 'single' | 'multi'
            selectedRowIndex: number | null
            multiRowIndices: number[]
            compareSelection: number[]
          }
        }
      | undefined
    if (st?.restoreInspector) {
      const r = st.restoreInspector
      setInspectorMode(r.mode)
      setSelectedRowIndex(r.selectedRowIndex)
      setInspectorMultiRowIndices(r.multiRowIndices ?? [])
      setInspectorCompareSelection(new Set(r.compareSelection ?? []))
      setIsInspectorOpen(true)
      setCollapseSidebarForInspector(true)
      navigate(location.pathname + location.search, { replace: true })
      return
    }
    if (st?.restoreResearchSelection) {
      const r = st.restoreResearchSelection
      if (r.rowsPerPage) setRowsPerPage(r.rowsPerPage)
      if (r.page) setPage(r.page)
      if (r.activeTabId) setActiveTabId(r.activeTabId)
      setSelectedRows(new Set(r.selectedRows ?? []))
      // Do NOT open inspector in this path.
      navigate(location.pathname + location.search, { replace: true })
    }
  }, [location.pathname, location.search, location.state, navigate, setCollapseSidebarForInspector])

  return (
    <div className={`min-h-full bg-white ${isInspectorOpen ? 'flex' : ''}`}>
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-rows-title"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-rows-title" className="text-sm font-semibold text-gray-900">
              Delete selected row{selectedRows.size === 1 ? '' : 's'}?
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              You are about to delete {selectedRows.size} row{selectedRows.size === 1 ? '' : 's'}. This cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteSelectedRows}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {addRowPopover.open && (
        <div
          data-add-row-popover
          className="fixed z-50 w-[220px] rounded-xl border border-gray-200 bg-white p-2 shadow-sm"
          style={{ left: addRowPopover.x, top: addRowPopover.y }}
        >
          <p className="px-2 pb-1 text-xs font-semibold text-gray-700">Add rows</p>
          <div className="flex flex-wrap gap-1 px-1 pb-2">
            {[1, 5, 10, 25, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => commitAddRows(n)}
                className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 px-1">
            <input
              value={addRowCountDraft}
              onChange={(e) => setAddRowCountDraft(e.target.value)}
              className="h-8 w-full rounded-md border border-gray-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="Custom"
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={() => commitAddRows(Number(addRowCountDraft))}
              className="h-8 shrink-0 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Add
            </button>
          </div>
        </div>
      )}
      <div
        className={
          isInspectorOpen
            ? 'flex-1 min-w-0 overflow-auto px-6 py-6'
            : 'px-6 py-6'
        }
      >
      <h2 className="mb-2 text-lg font-semibold text-gray-900">Data Research</h2>

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
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={() => renameTab(tab.id, editingName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameTab(tab.id, editingName)
                  if (e.key === 'Escape') {
                    setEditingTabId(null)
                    setEditingName('')
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="min-w-[80px] rounded border border-gray-300 px-1.5 py-0.5 text-sm font-medium text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                autoFocus
                aria-label="Rename tab"
              />
            ) : (
              <button
                type="button"
                onClick={() => setActiveTabId(tab.id)}
                onDoubleClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  startEditingTab(tab)
                }}
                className="font-medium"
              >
                {tab.name}
              </button>
            )}
            <button
              type="button"
              onClick={(e) => closeTab(e, tab.id)}
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
            onClick={() => setNewTabMenuOpen((o) => !o)}
            className="rounded-t border border-transparent px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="New tab"
          >
            + New tab
          </button>
          {newTabMenuOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[200px] rounded-b border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setNewTabMenuOpen(false)
                  addNewTab()
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
              >
                <span className="text-gray-400">+</span>
                New sheet
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewTabMenuOpen(false)
                  setFilePickerOpen(true)
                }}
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
          onClick={() => setFilePickerOpen(false)}
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
                onClick={() => setFilePickerOpen(false)}
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
                        onClick={() => {
                          const params = new URLSearchParams()
                          params.set('fileId', String(file.id))
                          params.set('name', file.name)
                          if (file.folderPath) params.set('folder', file.folderPath)
                          setSearchParams(params, { replace: true })
                          setFilePickerOpen(false)
                        }}
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
                onClick={() => setFilePickerOpen(false)}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {activePathLabel && (
        <p className="mb-1 text-xs font-medium text-gray-500 truncate">
          {activePathLabel}
        </p>
      )}

      {loading && (
        <p className="mb-2 text-sm text-gray-500">Loading file…</p>
      )}
      {error && (
        <p className="mb-2 text-sm text-red-600">{error}</p>
      )}

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setToolbarActive('all')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            toolbarActive === 'all' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Research All
        </button>
        <button
          type="button"
          onClick={() => setToolbarActive('selected')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            toolbarActive === 'selected' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Research Selected
        </button>
        <button
          type="button"
          onClick={() => setToolbarActive('deep')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Deep Search Selected
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedRows.size === 0) return
            const first = Math.min(...selectedRows)
            setSelectedRowIndex(first)
            setIsInspectorOpen(true)
            setInspectorMode(selectedRows.size > 1 ? 'multi' : 'single')
            const all = Array.from(selectedRows).sort((a, b) => a - b)
            setInspectorMultiRowIndices(all)
            // Start unchecked so user explicitly chooses what to compare
            setInspectorCompareSelection(new Set())
            setCollapseSidebarForInspector(true)
          }}
          disabled={selectedRows.size === 0}
          title={selectedRows.size === 0 ? 'Select a row first' : 'Open inspector for selected row'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Preview Selected
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedRows.size === 0 || !content || !effectiveTabId) return
            clearComparison()
            const comparisonItems = Array.from(selectedRows)
              .map((rowIndex) => {
                const row = content[rowIndex + 1]
                if (!row) return null
                const title = String(row[0] ?? '')
                const specs = headers.map((label, i) => ({
                  label: (label || `Column ${i + 1}`).trim(),
                  value: String(row[i] ?? '—'),
                }))
                const imageUrl = null
                return {
                  id: `${effectiveTabId}-${rowIndex}`,
                  title,
                  imageUrl,
                  specs,
                }
              })
              .filter((x): x is NonNullable<typeof x> => x != null)
            openComparison(comparisonItems)
            showToast('Opened comparison')
            navigate('/compare', {
              state: {
                returnTo: '/research',
                restoreResearchSelection: {
                  selectedRows: Array.from(selectedRows),
                  activeTabId: effectiveTabId,
                  page: currentPage,
                  rowsPerPage,
                },
              },
            })
          }}
          disabled={selectedRows.size === 0}
          title={selectedRows.size === 0 ? 'Select rows first' : 'Open comparison with selected rows'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          Compare Selected
        </button>
        {/* Other options removed */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterOpen((f) => !f)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17m0 0h2m-2 0h-5m-9 0H3" />
            </svg>
            Filter
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Selected
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Filter options (placeholder). Configure filters per column.
        </div>
      )}

      {content && content.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-10 px-2 py-3 border-r border-gray-200">
                    <input
                      type="checkbox"
                      checked={totalDataRows > 0 && selectedRows.size >= totalDataRows}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </th>
                  {content[0].map((cell, i) => {
                    const columnHasData = content.some(
                      (row) => (row[i] ?? '').trim().length > 0
                    )
                    return (
                      <th key={i} scope="col" className="px-2 py-2 border-r border-gray-200 last:border-r-0">
                        <div className="flex items-center gap-2">
                          {columnHasData && (
                            <input
                              type="checkbox"
                              checked={selectedColumns.has(i)}
                              onChange={() =>
                                setSelectedColumns((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(i)) next.delete(i)
                                  else next.add(i)
                                  return next
                                })
                              }
                              className="mt-0.5 rounded border-gray-300"
                            />
                          )}
                          <input
                            value={cell}
                            onChange={(e) => updateCell(0, i, e.target.value)}
                            className="w-full min-w-[100px] border-0 bg-transparent px-2 py-1.5 font-medium text-gray-900 focus:ring-2 focus:ring-inset focus:ring-blue-500"
                          />
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pageRows.map((row, idx) => {
                  const dataRowIndex = rowIndices[idx]
                  const isSelectedRow = selectedRowIndex === dataRowIndex
                  return (
                    <tr
                      key={dataRowIndex}
                      className={`transition-colors ${isSelectedRow ? 'bg-sky-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="w-10 px-2 py-2 border-r border-gray-200">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(dataRowIndex)}
                          onChange={() => toggleRowSelection(dataRowIndex)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      {Array.from({ length: numCols }, (_, colIndex) => (
                        <td
                          key={colIndex}
                          className="cursor-pointer p-0 border-r border-gray-200 last:border-r-0"
                          onClick={() => handleCellClick(dataRowIndex)}
                        >
                          <input
                            value={row[colIndex] ?? ''}
                            onChange={(e) => updateCell(dataRowIndex + 1, colIndex, e.target.value)}
                            className="w-full min-w-[100px] border-0 bg-transparent px-4 py-3 text-gray-700 focus:ring-2 focus:ring-inset focus:ring-blue-500"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Footer: Add row + pagination */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 pt-3">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={(e) => openAddRowPopover(e.currentTarget)}
                data-add-row-footer-btn
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
              >
                + Add row
              </button>
              <button
                type="button"
                onClick={removeSelectedRows}
                disabled={selectedRows.size === 0}
                title={selectedRows.size === 0 ? 'Select row(s) to remove' : 'Remove selected rows'}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete row
              </button>
              <span className="text-sm text-gray-600">
                Showing {totalDataRows === 0 ? 0 : startRow + 1} to {endRow} of {totalDataRows} entries
              </span>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Rows per page
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                  className="rounded border border-gray-300 py-1 pl-2 pr-6 text-sm"
                >
                  {ROWS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={currentPage <= 1}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &laquo;
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &lsaquo;
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &rsaquo;
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="rounded border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
              >
                &raquo;
              </button>
            </div>
          </div>
        </>
      )}

      {content && content.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          No data. Use &quot;+ Add row&quot; to add rows.
        </div>
      )}

      {!content && !loading && tabs.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center text-sm text-gray-500">
          Select a tab or open a file from Home.
        </div>
      )}
      </div>

      {isInspectorOpen && (
        <aside
          className={
            inspectorMaximized
              ? 'fixed inset-0 z-50 flex flex-col bg-white shadow-xl'
              : 'flex w-3/4 min-w-[320px] max-w-[900px] shrink-0 flex-col border-l border-gray-200 bg-white animate-[slideInRight_0.2s_ease-out]'
          }
          style={
            inspectorMaximized
              ? undefined
              : { boxShadow: '-2px 0 10px rgba(0,0,0,0.08)' }
          }
          role="complementary"
          aria-label="Row preview"
        >
          <style>{`
            @keyframes slideInRight {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
          <header className="flex shrink-0 items-center justify-end gap-1 border-b border-gray-200 bg-gray-50/80 px-4 py-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setInspectorMaximized((m) => !m)
              }}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
              title={inspectorMaximized ? 'Restore panel' : 'Maximize panel'}
              aria-label={inspectorMaximized ? 'Restore panel' : 'Maximize panel'}
            >
              {inspectorMaximized ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={closeInspector}
              className="rounded-lg p-2 text-gray-600 hover:bg-gray-200 hover:text-gray-900"
              title="Close panel"
              aria-label="Close panel"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>
          <div className="flex-1 overflow-auto p-4">
            {selectedRowData || (inspectorMode === 'multi' && inspectorMultiRowIndices.length > 0) ? (
              <div className="space-y-4">
                {inspectorMode === 'multi' ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Selected rows</h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                          Pick which items to compare, then click Compare.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!content || !effectiveTabId) return
                          const chosen = Array.from(inspectorCompareSelection).sort((a, b) => a - b)
                          if (chosen.length === 0) {
                            showToast('Select at least one item to compare')
                            return
                          }
                          clearComparison()
                          const comparisonItems = chosen
                            .map((rowIndex) => {
                              const row = content[rowIndex + 1]
                              if (!row) return null
                              return {
                                id: `${effectiveTabId}-${rowIndex}`,
                                title: String(row[0] ?? ''),
                                imageUrl: null,
                                specs: headers.map((label, i) => ({
                                  label: (label || `Column ${i + 1}`).trim(),
                                  value: String(row[i] ?? '—'),
                                })),
                              }
                            })
                            .filter((x): x is NonNullable<typeof x> => x != null)
                          openComparison(comparisonItems)
                          navigate('/compare', {
                            state: {
                              returnTo: '/research',
                              restoreInspector: {
                                mode: 'multi',
                                selectedRowIndex,
                                multiRowIndices: inspectorMultiRowIndices,
                                compareSelection: chosen,
                              },
                            },
                          })
                        }}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                      >
                        Compare ({inspectorCompareSelection.size})
                      </button>
                    </div>

                    <div className="mt-4 space-y-2">
                      {inspectorMultiRowIndices.map((rowIndex) => {
                        const row = content?.[rowIndex + 1] ?? []
                        const title = String(row[0] ?? `Row ${rowIndex + 1}`)
                        const sub = String(row[1] ?? '').trim()
                        const checked = inspectorCompareSelection.has(rowIndex)
                        return (
                          <label
                            key={rowIndex}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-2 cursor-pointer ${
                              checked ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4"
                              checked={checked}
                              onChange={() => {
                                setInspectorCompareSelection((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(rowIndex)) next.delete(rowIndex)
                                  else next.add(rowIndex)
                                  return next
                                })
                              }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 truncate">{title || '—'}</p>
                              {sub && <p className="text-xs text-gray-600 truncate">{headers[1] ? `${headers[1]}: ${sub}` : sub}</p>}
                            </div>
                            <button
                              type="button"
                              className="ml-auto text-xs font-medium text-gray-600 hover:text-gray-900"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setSelectedRowIndex(rowIndex)
                              }}
                            >
                              View
                            </button>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                        Item
                      </h3>
                      <p className="text-lg font-semibold text-gray-900">
                        {headers[0] ? `${headers[0]}: ${selectedRowData?.[0] ?? '—'}` : selectedRowData?.[0] ?? 'Row ' + (selectedRowIndex != null ? selectedRowIndex + 1 : '')}
                      </p>
                    </div>
                    {selectedRowData?.[1] != null && String(selectedRowData?.[1]).trim() !== '' && (
                      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                          Description
                        </h3>
                        <p className="text-sm text-gray-700">
                          {headers[1] ? `${headers[1]}: ${selectedRowData?.[1]}` : String(selectedRowData?.[1])}
                        </p>
                      </div>
                    )}
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                        Key attributes
                      </h3>
                      <ul className="space-y-2">
                        {headers.map((label, i) => (
                          <li key={i} className="flex justify-between gap-2 text-sm">
                            <span className="text-gray-500">{label || `Column ${i + 1}`}</span>
                            <span className="min-w-0 truncate text-right font-medium text-gray-900">
                              {selectedRowData?.[i] ?? '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Metadata
                  </h3>
                  <p className="text-sm text-gray-600">
                    Row {selectedRowIndex != null ? selectedRowIndex + 1 : ''} of {content ? content.length - 1 : 0}
                  </p>
                </div>
                {inspectorMode !== 'multi' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedRowIndex == null || !effectiveTabId || !selectedRowData) return
                        clearComparison()
                        const title = String(selectedRowData[0] ?? '')
                        const specs = headers.map((label, i) => ({
                          label: (label || `Column ${i + 1}`).trim(),
                          value: String(selectedRowData[i] ?? '—'),
                        }))
                        openComparison([
                          {
                            id: `${effectiveTabId}-${selectedRowIndex}`,
                            title,
                            imageUrl: null,
                            specs,
                          },
                        ])
                        showToast('Opened comparison')
                        navigate('/compare', {
                          state: {
                            returnTo: '/research',
                            restoreInspector: {
                              mode: 'single',
                              selectedRowIndex,
                              multiRowIndices: [],
                              compareSelection: [],
                            },
                          },
                        })
                      }}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Compare
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedRowIndex == null || !effectiveTabId || !selectedRowData) return
                        const id = `${effectiveTabId}-${selectedRowIndex}`
                        const title = selectedRowData[0] ?? ''
                        const manufacturer = selectedRowData[1] ?? ''
                        const price = selectedRowData[2] ?? ''
                        const result = addItem({
                          id,
                          title: String(title),
                          manufacturer: String(manufacturer),
                          price: String(price),
                          rowIndex: selectedRowIndex,
                          tabId: effectiveTabId,
                        })
                        if (result.added) showToast('Item added to Bucket')
                        else showToast('Item already in Bucket')
                      }}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Add to Bucket
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    >
                      Copy row
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                Select a row in the table to preview its details here.
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
