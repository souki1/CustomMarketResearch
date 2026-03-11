import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getToken } from '@/lib/auth'
import {
  getWorkspaceFileContent,
  listResearchUrls,
  listWorkspaceItems,
  saveDataSheetSelection,
  searchSelectionAndStoreUrls,
} from '@/lib/api'
import { useBucket } from '@/contexts/BucketContext'
import { useComparison } from '@/contexts/ComparisonContext'
import { useLayout } from '@/contexts/LayoutContext'
import { ResearchTabs } from '@/components/research/ResearchTabs'

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

function isImageUrl(val: unknown): boolean {
  if (typeof val !== 'string' || !val.trim()) return false
  const s = val.trim().toLowerCase()
  if (!s.startsWith('http://') && !s.startsWith('https://')) return false
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(s) || /\/media\/|\/catalog\/|\/images?\//i.test(s)
}

function isImageKey(key: string): boolean {
  const k = key.toLowerCase().replace(/_/g, '')
  return /image|img|photo|picture|thumbnail/.test(k)
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
const RESEARCH_PAGE_STATE_KEY = 'research-page-state'

const INSPECTOR_MIN_WIDTH = 280
const INSPECTOR_MAX_WIDTH = 900
const INSPECTOR_DEFAULT_WIDTH = 450

type PersistedResearchState = {
  activeTabId: string | null
  selectedRows: number[]
  selectedColumns: number[]
  rowsPerPage: number
  page: number
  selectedRowIndex: number | null
  isInspectorOpen: boolean
  inspectorMaximized: boolean
  inspectorWidth: number
  inspectorMode: 'single' | 'multi'
  inspectorMultiRowIndices: number[]
  inspectorCompareSelection: number[]
}

export function ResearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const fileIdParam = searchParams.get('fileId')
  const nameFromUrl = searchParams.get('name')
  const folderFromUrl = searchParams.get('folder')
  const [tabs, setTabs] = useState<TabState[]>(() => {
    try {
      const raw = localStorage.getItem('research-tabs')
      if (!raw) return [newBlankSheet()]
      const parsed = JSON.parse(raw) as TabState[]
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : [newBlankSheet()]
    } catch {
      return [newBlankSheet()]
    }
  })
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
  const [inspectorWidth, setInspectorWidth] = useState(INSPECTOR_DEFAULT_WIDTH)
  const inspectorResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
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
  const [researchFieldsPopupOpen, setResearchFieldsPopupOpen] = useState(false)
  const [researchAiQueryInput, setResearchAiQueryInput] = useState('')
  const [storeSelectionLoading, setStoreSelectionLoading] = useState(false)
  const [researchVersion, setResearchVersion] = useState(0)
  const [previewScrapedData, setPreviewScrapedData] = useState<
    Array<{ url: string; data: Record<string, unknown> }> | null
  >(null)
  const [previewResultsLoading, setPreviewResultsLoading] = useState(false)
  const [structuredDataViewType, setStructuredDataViewType] = useState<'row' | 'column'>('row')
  const navigate = useNavigate()
  const location = useLocation()
  const { setCollapseSidebarForInspector } = useLayout()
  const { addItem, showToast } = useBucket()
  const { openWithItems: openComparison, closeAndClear: clearComparison } = useComparison()
  const lastClosedFileIdRef = useRef<number | null>(null)
  const hasRestoredPageStateRef = useRef(false)
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const content = activeTab?.data ?? null
  const effectiveTabId = activeTab?.id ?? tabs[0]?.id ?? null

  // Persist tabs in localStorage so they survive route changes and reloads
  useEffect(() => {
    try {
      localStorage.setItem('research-tabs', JSON.stringify(tabs))
    } catch {
      // ignore quota or serialization errors
    }
  }, [tabs])

  // Restore Research page state when returning from another page (skip if returning from Compare with restore state)
  useEffect(() => {
    if (hasRestoredPageStateRef.current) return
    const st = location.state as { restoreResearchSelection?: unknown; restoreInspector?: unknown } | undefined
    if (st?.restoreResearchSelection || st?.restoreInspector) return

    hasRestoredPageStateRef.current = true
    try {
      const raw = localStorage.getItem(RESEARCH_PAGE_STATE_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as Partial<PersistedResearchState>
      if (data.activeTabId && tabs.some((t) => t.id === data.activeTabId)) {
        setActiveTabId(data.activeTabId)
      }
      if (Array.isArray(data.selectedRows)) setSelectedRows(new Set(data.selectedRows))
      if (Array.isArray(data.selectedColumns)) setSelectedColumns(new Set(data.selectedColumns))
      if (typeof data.rowsPerPage === 'number') setRowsPerPage(data.rowsPerPage)
      if (typeof data.page === 'number') setPage(data.page)
      if (data.selectedRowIndex !== undefined) setSelectedRowIndex(data.selectedRowIndex)
      if (typeof data.isInspectorOpen === 'boolean') {
        setIsInspectorOpen(data.isInspectorOpen)
        if (data.isInspectorOpen) setCollapseSidebarForInspector(true)
      }
      if (typeof data.inspectorMaximized === 'boolean') setInspectorMaximized(data.inspectorMaximized)
      if (
        typeof data.inspectorWidth === 'number' &&
        data.inspectorWidth >= INSPECTOR_MIN_WIDTH &&
        data.inspectorWidth <= INSPECTOR_MAX_WIDTH
      ) {
        setInspectorWidth(data.inspectorWidth)
      }
      if (data.inspectorMode === 'single' || data.inspectorMode === 'multi') setInspectorMode(data.inspectorMode)
      if (Array.isArray(data.inspectorMultiRowIndices)) setInspectorMultiRowIndices(data.inspectorMultiRowIndices)
      if (Array.isArray(data.inspectorCompareSelection)) {
        setInspectorCompareSelection(new Set(data.inspectorCompareSelection))
      }
    } catch {
      // ignore parse errors
    }
  }, [location.state, tabs])

  // Persist Research page state so it survives navigation to other pages
  useEffect(() => {
    try {
      const data: PersistedResearchState = {
        activeTabId,
        selectedRows: Array.from(selectedRows),
        selectedColumns: Array.from(selectedColumns),
        rowsPerPage,
        page,
        selectedRowIndex,
        isInspectorOpen,
        inspectorMaximized,
        inspectorWidth,
        inspectorMode,
        inspectorMultiRowIndices,
        inspectorCompareSelection: Array.from(inspectorCompareSelection),
      }
      localStorage.setItem(RESEARCH_PAGE_STATE_KEY, JSON.stringify(data))
    } catch {
      // ignore quota or serialization errors
    }
  }, [
    activeTabId,
    selectedRows,
    selectedColumns,
    rowsPerPage,
    page,
    selectedRowIndex,
    isInspectorOpen,
    inspectorMaximized,
    inspectorWidth,
    inspectorMode,
    inspectorMultiRowIndices,
    inspectorCompareSelection,
  ])

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

  // Fetch research URLs for the selected row from MongoDB when preview is open
  useEffect(() => {
    if (selectedRowIndex == null || !isInspectorOpen) {
      setPreviewScrapedData(null)
      setPreviewResultsLoading(false)
      return
    }
    const token = getToken()
    if (!token) {
      setPreviewScrapedData(null)
      setPreviewResultsLoading(false)
      return
    }
    const fileId = activeTab?.fileId ?? null
    const tabId = effectiveTabId ?? null
    if (!fileId && !tabId) {
      setPreviewScrapedData(null)
      setPreviewResultsLoading(false)
      return
    }
    setPreviewResultsLoading(true)
    listResearchUrls(token, {
      fileId: fileId ?? undefined,
      tabId: fileId ? undefined : tabId ?? undefined,
      tableRowIndex: selectedRowIndex,
    })
      .then((items) => {
        const item = items[0]
        setPreviewScrapedData(item?.scraped_data ?? null)
      })
      .catch(() => setPreviewScrapedData(null))
      .finally(() => setPreviewResultsLoading(false))
  }, [selectedRowIndex, effectiveTabId, activeTab?.fileId, researchVersion, isInspectorOpen])

  // Show loading in preview while research is running (until all rows scraped)
  useEffect(() => {
    if (storeSelectionLoading && isInspectorOpen && selectedRowIndex != null) {
      setPreviewResultsLoading(true)
    }
  }, [storeSelectionLoading, isInspectorOpen, selectedRowIndex])

  useEffect(() => {
    if (!fileIdParam) return
    const token = getToken()
    if (!token) {
      setError('Sign in to view file content.')
      return
    }
    const numericId = Number(fileIdParam)

    // If this fileId was just closed, ignore once and clear params
    if (lastClosedFileIdRef.current != null && lastClosedFileIdRef.current === numericId) {
      lastClosedFileIdRef.current = null
      setSearchParams({}, { replace: true })
      return
    }

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
  }, [fileIdParam, nameFromUrl, folderFromUrl, tabs, setSearchParams])

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
      const idx = tabs.findIndex((t) => t.id === id)
      if (idx < 0) return

      const tab = tabs[idx]
      const next = tabs.filter((t) => t.id !== id)
      setTabs(next)

      // If this tab was backed by a workspace file, clear any file-related URL params
      if (tab.fileId != null) {
        lastClosedFileIdRef.current = tab.fileId
        setSearchParams({}, { replace: true })
      }

      if (activeTabId === id) {
        const nextActive = next[idx] ?? next[idx - 1] ?? next[0]
        setActiveTabId(nextActive?.id ?? null)
      }
    },
    [tabs, activeTabId, setSearchParams]
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
  const numCols = content?.[0]?.length ?? 0
  const headers = content?.[0] ?? []

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

  // Keep comparison context in sync with currently selected rows
  useEffect(() => {
    if (!content || !effectiveTabId || selectedRows.size === 0) return
    const items = Array.from(selectedRows)
      .map((rowIndex) => {
        const row = content[rowIndex + 1]
        if (!row) return null
        const title = String(row[0] ?? '')
        const specs = headers.map((label, i) => ({
          label: (label || `Column ${i + 1}`).trim(),
          value: String(row[i] ?? '—'),
        }))
        return {
          id: `${effectiveTabId}-${rowIndex}`,
          title,
          imageUrl: null,
          specs,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
    if (items.length) openComparison(items)
  }, [content, effectiveTabId, headers, selectedRows, openComparison])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isInspectorOpen) closeInspector()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isInspectorOpen, closeInspector])

  // Inspector resize drag
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const res = inspectorResizeRef.current
      if (!res) return
      const delta = res.startX - e.clientX
      const next = Math.min(
        INSPECTOR_MAX_WIDTH,
        Math.max(INSPECTOR_MIN_WIDTH, res.startWidth + delta)
      )
      setInspectorWidth(next)
    }
    const onMouseUp = () => {
      inspectorResizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Restore inspector state when returning from /compare
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
      navigate(location.pathname + location.search, { replace: true })
    }
  }, [location.pathname, location.search, location.state, navigate, setCollapseSidebarForInspector])

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

  const activePathLabel =
    activeTab && activeTab.name
      ? ['All Files', activeTab.folderPath, activeTab.name].filter(Boolean).join(' / ')
      : ''
  const selectedRowData =
    selectedRowIndex != null && content
      ? content[1 + selectedRowIndex] ?? null
      : null

  return (
    <div
      className={`bg-white ${isInspectorOpen ? 'flex h-[calc(100vh-3.5rem)] overflow-hidden' : 'min-h-full'}`}
    >
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
      {researchFieldsPopupOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="research-fields-title"
          onClick={(e) => e.target === e.currentTarget && setResearchFieldsPopupOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="research-fields-title" className="text-sm font-semibold text-gray-900">
              AI extraction query
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Describe in natural language what you want to extract from each search result.
            </p>
            <textarea
              value={researchAiQueryInput}
              onChange={(e) => setResearchAiQueryInput(e.target.value)}
              placeholder="e.g. Extract product name, price, sku, and availability from this page"
              rows={3}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResearchFieldsPopupOpen(false)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={storeSelectionLoading || !researchAiQueryInput.trim()}
                onClick={async () => {
                  if (!content || selectedColumns.size === 0) return
                  const token = getToken()
                  if (!token) {
                    showToast('Sign in to research selected')
                    return
                  }
                  const aiQuery = researchAiQueryInput.trim()
                  if (!aiQuery) {
                    showToast('Enter an AI extraction query')
                    return
                  }
                  const colIndices = Array.from(selectedColumns).sort((a, b) => a - b)
                  const headers = colIndices.map((i) => String(content[0]?.[i] ?? `Column ${i + 1}`).trim())
                  const rowIndices =
                    selectedRows.size > 0
                      ? Array.from(selectedRows).sort((a, b) => a - b)
                      : Array.from({ length: Math.max(0, content.length - 1) }, (_, i) => i)
                  const rows = rowIndices.map((rowIdx) => {
                    const row = content[rowIdx + 1] ?? []
                    return colIndices.map((colIdx) => String(row[colIdx] ?? ''))
                  })
                  setStoreSelectionLoading(true)
                  setResearchFieldsPopupOpen(false)
                  try {
                    const saved = await saveDataSheetSelection(
                      {
                        headers,
                        rows,
                        row_indices: rowIndices,
                        sheet_name: activeTab?.name ?? null,
                        file_id: activeTab?.fileId ?? null,
                        tab_id: effectiveTabId ?? null,
                      },
                      token
                    )
                    const searchResult = await searchSelectionAndStoreUrls(saved.id, token, aiQuery)
                    setResearchVersion((v) => v + 1)
                    showToast(
                      `Saved ${rows.length} row${rows.length !== 1 ? 's' : ''}. Searched and scraped ${searchResult.total_urls} URLs.`
                    )
                  } catch (e) {
                    showToast(e instanceof Error ? e.message : 'Failed to save or search')
                  } finally {
                    setStoreSelectionLoading(false)
                  }
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {storeSelectionLoading ? 'Researching…' : 'Start Research'}
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
            ? 'flex-1 min-w-0 overflow-hidden px-4 py-3 flex flex-col h-[calc(100vh-3.5rem)]'
            : 'px-4 py-3 overflow-hidden flex flex-col h-[calc(100vh-3.5rem)]'
        }
      >
      <div className="shrink-0">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Data Research</h2>

        <ResearchTabs
          tabs={tabs.map((t) => ({ id: t.id, name: t.name, fileId: t.fileId, folderPath: t.folderPath ?? null }))}
          activeTabId={activeTabId}
          editingTabId={editingTabId}
          editingName={editingName}
          newTabMenuOpen={newTabMenuOpen}
          filePickerOpen={filePickerOpen}
          filePickerFiles={filePickerFiles}
          filePickerLoading={filePickerLoading}
          filePickerError={filePickerError}
          onTabClick={(id) => setActiveTabId(id)}
          onTabClose={(id, e) => closeTab(e, id)}
          onStartRename={(tab) => startEditingTab({ id: tab.id, name: tab.name, data: [[]], fileId: tab.fileId, folderPath: tab.folderPath ?? null })}
          onRenameChange={setEditingName}
          onRenameCommit={(id, name) => renameTab(id, name)}
          onRenameCancel={() => {
            setEditingTabId(null)
            setEditingName('')
          }}
          onToggleNewTabMenu={() => setNewTabMenuOpen((o) => !o)}
          onNewSheet={() => {
            setNewTabMenuOpen(false)
            addNewTab()
          }}
          onOpenFilePicker={() => {
            setNewTabMenuOpen(false)
            setFilePickerOpen(true)
          }}
          onCloseFilePicker={() => setFilePickerOpen(false)}
          onFilePickerFileClick={(file) => {
            const params = new URLSearchParams()
            params.set('fileId', String(file.id))
            params.set('name', file.name)
            if (file.folderPath) params.set('folder', file.folderPath)
            setSearchParams(params, { replace: true })
            setFilePickerOpen(false)
          }}
        />

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
          onClick={() => {
            setToolbarActive('selected')
            if (!content || selectedColumns.size === 0) {
              showToast('Select at least one column first')
              return
            }
            const colIndices = Array.from(selectedColumns).sort((a, b) => a - b)
            const headers = colIndices.map((i) => String(content[0]?.[i] ?? `Column ${i + 1}`).trim())
            setResearchAiQueryInput(
              headers.length > 0
                ? `Extract ${headers.join(', ')} from this page`
                : ''
            )
            setResearchFieldsPopupOpen(true)
          }}
          disabled={!content || selectedColumns.size === 0 || storeSelectionLoading}
          title={
            selectedColumns.size === 0
              ? 'Select column(s) first'
              : 'Research selected headers and rows'
          }
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${
            toolbarActive === 'selected' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {storeSelectionLoading ? 'Researching…' : 'Research Selected'}
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
      </div>

      {content && content.length > 0 && (
        <>
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className="h-full overflow-auto rounded-lg border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50">
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
          </div>

          {/* Footer: Add row + pagination */}
          <div className="shrink-0 mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-2">
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
        <>
          {!inspectorMaximized && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize preview panel"
              title="Drag to resize"
              className="shrink-0 w-1.5 cursor-col-resize border-l border-gray-200 bg-gray-100 hover:bg-blue-100 active:bg-blue-200 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault()
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
                inspectorResizeRef.current = { startX: e.clientX, startWidth: inspectorWidth }
              }}
            />
          )}
          <aside
            className={
              inspectorMaximized
                ? 'fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden bg-white shadow-xl'
                : 'flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white animate-[slideInRight_0.2s_ease-out]'
            }
            style={
              inspectorMaximized
                ? undefined
                : {
                    width: inspectorWidth,
                    minWidth: inspectorWidth,
                    boxShadow: '-2px 0 10px rgba(0,0,0,0.08)',
                  }
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
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-4">
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
                                setInspectorMode('single')
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
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Structured data
                        </h3>
                        {previewScrapedData && previewScrapedData.length > 0 && (
                          <div className="flex rounded-lg border border-gray-200 p-0.5">
                            <button
                              type="button"
                              onClick={() => setStructuredDataViewType('row')}
                              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                structuredDataViewType === 'row'
                                  ? 'bg-gray-200 text-gray-900'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              Row
                            </button>
                            <button
                              type="button"
                              onClick={() => setStructuredDataViewType('column')}
                              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                structuredDataViewType === 'column'
                                  ? 'bg-gray-200 text-gray-900'
                                  : 'text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              Column
                            </button>
                          </div>
                        )}
                      </div>
                      {previewResultsLoading ? (
                        <p className="text-sm text-gray-500">Loading…</p>
                      ) : previewScrapedData && previewScrapedData.length > 0 ? (
                        <div className="space-y-4">
                          {previewScrapedData.map((item, idx) => (
                            <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                              {item.url && (
                                <p className="mb-2 truncate text-xs text-gray-500" title={item.url}>
                                  Source {idx + 1}: {item.url}
                                </p>
                              )}
                              <div className="overflow-x-auto">
                                {structuredDataViewType === 'row' ? (
                                  <table className="min-w-full text-sm">
                                    <tbody className="divide-y divide-gray-200">
                                      {Object.entries(item.data).map(([key, val]) => {
                                        const strVal = typeof val === 'string' ? val : (typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? ''))
                                        const imageUrls = Array.isArray(val)
                                          ? val.filter((v): v is string => typeof v === 'string' && isImageUrl(v))
                                          : isImageUrl(val)
                                            ? [String(val)]
                                            : []
                                        const showAsImage = (isImageKey(key) || imageUrls.length > 0) && imageUrls.length > 0
                                        return (
                                          <tr key={key}>
                                            <td className="py-1 pr-4 font-medium text-gray-500 align-top">
                                              {key.replace(/_/g, ' ')}
                                            </td>
                                            <td className="py-1 text-gray-900">
                                              {showAsImage ? (
                                                <span className="inline-flex flex-wrap gap-2">
                                                  {imageUrls.map((imgSrc, i) => (
                                                    <span key={i} className="relative">
                                                      <img
                                                        src={imgSrc}
                                                        alt={`${key.replace(/_/g, ' ')} ${i + 1}`}
                                                        className="max-h-24 rounded border border-gray-200 object-contain"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                          const el = e.currentTarget
                                                          el.style.display = 'none'
                                                          const fallback = el.nextElementSibling
                                                          if (fallback) (fallback as HTMLElement).classList.remove('hidden')
                                                        }}
                                                      />
                                                      <a
                                                        href={imgSrc}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hidden text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                                                        title={imgSrc}
                                                      >
                                                        {imgSrc}
                                                      </a>
                                                    </span>
                                                  ))}
                                                </span>
                                              ) : (
                                                typeof val === 'object' && val !== null
                                                  ? strVal
                                                  : String(val ?? '')
                                              )}
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                ) : (
                                  <table className="min-w-full text-sm">
                                    <thead>
                                      <tr className="divide-x divide-gray-200">
                                        {Object.keys(item.data).map((key) => (
                                          <th key={key} className="px-3 py-1.5 text-left font-medium text-gray-500">
                                            {key.replace(/_/g, ' ')}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr className="divide-x divide-gray-200">
                                        {Object.entries(item.data).map(([key, val]) => {
                                          const strVal = typeof val === 'string' ? val : (typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? ''))
                                          const imageUrls = Array.isArray(val)
                                            ? val.filter((v): v is string => typeof v === 'string' && isImageUrl(v))
                                            : isImageUrl(val)
                                              ? [String(val)]
                                              : []
                                          const showAsImage = (isImageKey(key) || imageUrls.length > 0) && imageUrls.length > 0
                                          return (
                                            <td key={key} className="px-3 py-1.5 text-gray-900 align-top">
                                              {showAsImage ? (
                                                <span className="inline-flex flex-wrap gap-2">
                                                  {imageUrls.map((imgSrc, i) => (
                                                    <span key={i} className="relative">
                                                      <img
                                                        src={imgSrc}
                                                        alt={`${key.replace(/_/g, ' ')} ${i + 1}`}
                                                        className="max-h-24 rounded border border-gray-200 object-contain"
                                                        loading="lazy"
                                                        onError={(e) => {
                                                          const el = e.currentTarget
                                                          el.style.display = 'none'
                                                          const fallback = el.nextElementSibling
                                                          if (fallback) (fallback as HTMLElement).classList.remove('hidden')
                                                        }}
                                                      />
                                                      <a
                                                        href={imgSrc}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hidden text-xs text-blue-600 hover:underline truncate max-w-[200px]"
                                                        title={imgSrc}
                                                      >
                                                        {imgSrc}
                                                      </a>
                                                    </span>
                                                  ))}
                                                </span>
                                              ) : (
                                                typeof val === 'object' && val !== null
                                                  ? strVal
                                                  : String(val ?? '')
                                              )}
                                            </td>
                                          )
                                        })}
                                      </tr>
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">
                          No data yet. Run &quot;Research Selected&quot; first.
                        </p>
                      )}
                    </div>
                  </>
                )}
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
        </>
      )}
    </div>
  )
}
