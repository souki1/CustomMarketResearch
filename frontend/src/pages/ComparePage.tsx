import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getToken } from '@/lib/auth'
import { CompareFilePickerModal } from '@/components/compare/CompareFilePickerModal'
import { CompareSheetsSidebar } from '@/components/compare/CompareSheetsSidebar'
import { CompareWorkspaceSection } from '@/components/compare/CompareWorkspaceSection'
import type { CompareMode, CompareTab, CompareTabData, FileEntry, LoadedFile } from '@/components/compare/types'
import {
  getCompareState,
  getWorkspaceFileContent,
  listDataSheetSelections,
  listPortfolioItems,
  listResearchUrls,
  listWorkspaceItems,
  upsertCompareState,
} from '@/lib/api'
import type { PortfolioItem, ScrapedDataItem } from '@/lib/api'
import { useComparison, type ComparisonItem } from '@/contexts/ComparisonContext'

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
  return (
    /\.(jpg|jpeg|png|gif|webp|svg)(\?|\/|$)/i.test(s) ||
    /\/media\/|\/catalog\/|\/images?\//i.test(s) ||
    /imagedelivery\.net|cloudflare.*\/images?/i.test(s)
  )
}

function isImageKey(key: string): boolean {
  const k = key.toLowerCase().replace(/_/g, '')
  return /image|img|photo|picture|thumbnail/.test(k)
}

/** Flatten nested object keys for display (e.g. { a: { b: 1 } } -> ["a.b"]) */
function flattenObjectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      keys.push(...flattenObjectKeys(v as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

/** Extract domain from URL for vendor filtering (e.g. store.germanbliss.com) */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function shortenUrl(url: string, maxLen = 48): string {
  const s = String(url ?? '').trim()
  if (!s) return '—'
  if (s.length <= maxLen) return s
  return `${s.slice(0, Math.max(1, maxLen - 3))}...`
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const p of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[p]
  }
  return current
}

function newBlankCompareTab(): CompareTab {
  return {
    id: crypto.randomUUID(),
    name: 'New tab',
    data: {
      selectedFilesData: [],
      selectedFileRows: {},
      activeFileId: null,
      selectedRowForScraped: null,
    },
  }
}

const COMPARE_MODE_TABS: { id: CompareMode; label: string }[] = [
  { id: 'same-part', label: 'Same part across vendors' },
  { id: 'different-same-vendor', label: 'Different parts from same vendor' },
  { id: 'different-different-vendors', label: 'Different parts from different vendors' },
]

const COMPARE_SHEETS_SIDEBAR_KEY = 'ir-compare-sheets-open'
const COMPARE_PAGE_STATE_KEY = 'ir-compare-page-state-v1'

/** Fixed height matches `main` in MainLayout so the sheet sidebar does not stretch with content (avoids large-screen layout glitches). */
const COMPARE_PAGE_H = 'h-[calc(100vh-3.5rem)]'

function readPersistedCompareState(): {
  compareTabs?: CompareTab[]
  activeCompareTabId?: string | null
  compareMode?: CompareMode
} | null {
  try {
    const raw = localStorage.getItem(COMPARE_PAGE_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      compareTabs?: CompareTab[]
      activeCompareTabId?: string | null
      compareMode?: CompareMode
    }
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function ComparePage() {
  const { items, addItems, closeAndClear } = useComparison()
  const [compareTabs, setCompareTabs] = useState<CompareTab[]>(() => {
    const persisted = readPersistedCompareState()
    return Array.isArray(persisted?.compareTabs) && persisted.compareTabs.length > 0
      ? persisted.compareTabs
      : [newBlankCompareTab()]
  })
  const [activeCompareTabId, setActiveCompareTabId] = useState<string | null>(() => {
    const persisted = readPersistedCompareState()
    return typeof persisted?.activeCompareTabId === 'string' ? persisted.activeCompareTabId : null
  })
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false)
  const [sheetsSidebarOpen, setSheetsSidebarOpen] = useState(() => {
    try {
      return localStorage.getItem(COMPARE_SHEETS_SIDEBAR_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  const [filePickerFiles, setFilePickerFiles] = useState<FileEntry[]>([])
  const [filePickerLoading, setFilePickerLoading] = useState(false)
  const [filePickerError, setFilePickerError] = useState<string | null>(null)
  const [fileContentLoading, setFileContentLoading] = useState<Set<number>>(new Set())
  const comparisonSectionRef = useRef<HTMLDivElement>(null)
  const hasScrolledToComparisonRef = useRef(false)
  const [scrapedData, setScrapedData] = useState<ScrapedDataItem[] | null>(null)
  const [scrapedDataLoading, setScrapedDataLoading] = useState(false)
  /** Filter scraped data to same vendor only (for "different parts same vendor" step 3) */
  const [scrapedVendorFilter, setScrapedVendorFilter] = useState<string>('all')
  const [scrapedViewMode, setScrapedViewMode] = useState<'row' | 'column'>('row')
  const [scrapedSelectedFields, setScrapedSelectedFields] = useState<string[]>([])
  const [scrapedFieldPickerSearch, setScrapedFieldPickerSearch] = useState('')
  const [scrapedValueSearch, setScrapedValueSearch] = useState('')
  const [scrapedNonEmptyOnly, setScrapedNonEmptyOnly] = useState(false)
  const [scrapedDataByPart, setScrapedDataByPart] = useState<Record<string, ScrapedDataItem[]>>({})
  const [commonVendorsLoading, setCommonVendorsLoading] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [portfolioPartNumbers, setPortfolioPartNumbers] = useState<Set<string>>(new Set())
  const [compareMode, setCompareMode] = useState<CompareMode>(() => {
    const persisted = readPersistedCompareState()
    const mode = persisted?.compareMode
    return mode === 'same-part' || mode === 'different-same-vendor' || mode === 'different-different-vendors'
      ? mode
      : 'different-different-vendors'
  })
  const hasHydratedCompareStateRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restoredItemsOnceRef = useRef(false)

  const activeTab =
    compareTabs.find((t) => t.id === (activeCompareTabId ?? undefined)) ?? compareTabs[0] ?? null
  const selectedFilesData = activeTab?.data.selectedFilesData ?? []
  const selectedFileRows = activeTab?.data.selectedFileRows ?? {}
  const activeFileId = activeTab?.data.activeFileId ?? null
  const selectedRowForScraped = activeTab?.data.selectedRowForScraped ?? null

  useEffect(() => {
    const token = getToken()
    if (!token) {
      hasHydratedCompareStateRef.current = true
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const state = await getCompareState(token)
        if (cancelled || !state) {
          hasHydratedCompareStateRef.current = true
          return
        }
        if (Array.isArray(state.compare_tabs) && state.compare_tabs.length > 0) {
          const tabs = state.compare_tabs as CompareTab[]
          restoredItemsOnceRef.current = false
          setCompareTabs(tabs)
          setActiveCompareTabId(
            typeof state.active_compare_tab_id === 'string' ? state.active_compare_tab_id : tabs[0]?.id ?? null
          )
        }
        if (
          state.compare_mode === 'same-part' ||
          state.compare_mode === 'different-same-vendor' ||
          state.compare_mode === 'different-different-vendors'
        ) {
          setCompareMode(state.compare_mode)
        }
        setScrapedVendorFilter(state.scraped_vendor_filter || 'all')
        setScrapedViewMode(state.scraped_view_mode === 'column' ? 'column' : 'row')
        setScrapedSelectedFields(state.scraped_selected_fields ?? [])
        setScrapedValueSearch(state.scraped_value_search ?? '')
        setScrapedNonEmptyOnly(Boolean(state.scraped_non_empty_only))
        setScrapedDataByPart(state.scraped_data_by_part ?? {})
        setScrapedData(state.scraped_data ?? null)
      } catch {
        // fall back to local state
      } finally {
        if (!cancelled) hasHydratedCompareStateRef.current = true
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const updateActiveTabData = useCallback((updater: (d: CompareTabData) => CompareTabData) => {
    if (!activeTab) return
    setCompareTabs((prev) =>
      prev.map((t) =>
        t.id === activeTab.id ? { ...t, data: updater(t.data) } : t
      )
    )
  }, [activeTab?.id])

  // When "Different parts from same vendor" is selected, keep only one file
  useEffect(() => {
    if (compareMode === 'different-same-vendor' && selectedFilesData.length > 1) {
      updateActiveTabData((d) => {
        const first = d.selectedFilesData[0]!
        return {
          ...d,
          selectedFilesData: [first],
          activeFileId: first.fileId,
          selectedFileRows: { [first.fileId]: d.selectedFileRows[first.fileId] ?? [] },
          selectedRowForScraped: d.selectedRowForScraped?.fileId === first.fileId ? d.selectedRowForScraped : null,
        }
      })
    }
  }, [compareMode, selectedFilesData.length, updateActiveTabData])

  const addNewCompareTab = useCallback(() => {
    const tab = newBlankCompareTab()
    setCompareTabs((prev) => [...prev, tab])
    setActiveCompareTabId(tab.id)
    setNewTabMenuOpen(false)
  }, [])

  const closeCompareTab = useCallback((e: ReactMouseEvent, id: string) => {
    e.stopPropagation()
    const idx = compareTabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    const next = compareTabs.filter((t) => t.id !== id)
    const finalTabs = next.length === 0 ? [newBlankCompareTab()] : next
    setCompareTabs(finalTabs)
    const closedWasActive = activeCompareTabId === id
    if (closedWasActive) {
      const newIdx = Math.min(idx, finalTabs.length - 1)
      setActiveCompareTabId(finalTabs[newIdx].id)
    } else if (next.length > 0 && compareTabs.findIndex((t) => t.id === activeCompareTabId) >= next.length) {
      setActiveCompareTabId(finalTabs[finalTabs.length - 1].id)
    }
  }, [compareTabs, activeCompareTabId])

  const startRenaming = useCallback((tabId: string) => {
    const tab = compareTabs.find((t) => t.id === tabId)
    if (!tab) return
    setRenamingTabId(tabId)
    setRenameValue(tab.name)
    requestAnimationFrame(() => renameInputRef.current?.select())
  }, [compareTabs])

  const commitRename = useCallback(() => {
    if (!renamingTabId) return
    const trimmed = renameValue.trim()
    if (trimmed) {
      setCompareTabs((prev) =>
        prev.map((t) => (t.id === renamingTabId ? { ...t, name: trimmed } : t))
      )
    }
    setRenamingTabId(null)
    setRenameValue('')
  }, [renamingTabId, renameValue])

  const cancelRename = useCallback(() => {
    setRenamingTabId(null)
    setRenameValue('')
  }, [])

  useEffect(() => {
    if (compareTabs.length > 0 && (!activeCompareTabId || !compareTabs.some((t) => t.id === activeCompareTabId))) {
      setActiveCompareTabId(compareTabs[0].id)
    }
  }, [compareTabs, activeCompareTabId])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const selections = await listDataSheetSelections(token)
        if (cancelled || selections.length === 0) return
        const batches = await Promise.all(
          selections.map((s) => listPortfolioItems(token, s.id).catch(() => [] as PortfolioItem[]))
        )
        if (cancelled) return
        const nums = new Set<string>()
        for (const batch of batches) {
          for (const item of batch) {
            if (item.part_number) nums.add(item.part_number.trim().toLowerCase())
          }
        }
        setPortfolioPartNumbers(nums)
      } catch {
        // non-critical
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(COMPARE_SHEETS_SIDEBAR_KEY, sheetsSidebarOpen ? 'true' : 'false')
    } catch {
      // ignore
    }
    if (!sheetsSidebarOpen) setNewTabMenuOpen(false)
  }, [sheetsSidebarOpen])

  useEffect(() => {
    try {
      localStorage.setItem(
        COMPARE_PAGE_STATE_KEY,
        JSON.stringify({
          compareTabs,
          activeCompareTabId,
          compareMode,
        })
      )
    } catch {
      // ignore
    }
    if (!hasHydratedCompareStateRef.current) return
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      const token = getToken()
      if (!token) return
      void upsertCompareState(
        {
          compare_tabs: compareTabs as Array<Record<string, unknown>>,
          active_compare_tab_id: activeCompareTabId,
          compare_mode: compareMode,
          scraped_vendor_filter: scrapedVendorFilter,
          scraped_view_mode: scrapedViewMode,
          scraped_selected_fields: scrapedSelectedFields,
          scraped_value_search: scrapedValueSearch,
          scraped_non_empty_only: scrapedNonEmptyOnly,
          scraped_data_by_part: scrapedDataByPart as Record<string, Array<{ url: string; data: Record<string, unknown> }>>,
          scraped_data: (scrapedData ?? []) as Array<{ url: string; data: Record<string, unknown> }>,
        },
        token
      ).catch(() => {})
    }, 600)
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [
    compareTabs,
    activeCompareTabId,
    compareMode,
    scrapedVendorFilter,
    scrapedViewMode,
    scrapedSelectedFields,
    scrapedValueSearch,
    scrapedNonEmptyOnly,
    scrapedDataByPart,
    scrapedData,
  ])

  // When navigating from Research with items, scroll to comparison section
  useEffect(() => {
    if (items.length > 0 && !hasScrolledToComparisonRef.current) {
      hasScrolledToComparisonRef.current = true
      const t = setTimeout(() => {
        comparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
      return () => clearTimeout(t)
    }
  }, [items.length])

  // Fetch workspace files when file picker opens
  useEffect(() => {
    if (!filePickerOpen) return
    const token = getToken()
    if (!token) {
      setFilePickerError('Sign in to open files.')
      return
    }
    setFilePickerLoading(true)
    setFilePickerError(null)
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

  const handleFilePickerFileClick = useCallback(
    (file: FileEntry) => {
      const token = getToken()
      if (!token) return
      if (selectedFilesData.some((f: LoadedFile) => f.fileId === file.id)) return
      setFileContentLoading((prev) => new Set(prev).add(file.id))
      getWorkspaceFileContent(file.id, token)
        .then((text) => {
          const data = parseCsv(text)
          const newFile: LoadedFile = {
            fileId: file.id,
            name: file.name,
            content: data.length > 0 ? data : [['']],
            folderPath: file.folderPath,
          }
          updateActiveTabData((d) => ({
            ...d,
            selectedFilesData: [...d.selectedFilesData, newFile],
            activeFileId: file.id,
          }))
        })
        .catch(() => {})
        .finally(() => setFileContentLoading((prev) => {
          const next = new Set(prev)
          next.delete(file.id)
          return next
        }))
    },
    [selectedFilesData, updateActiveTabData]
  )

  const handleRemoveFile = useCallback((fileId: number) => {
    updateActiveTabData((d) => {
      const next = { ...d }
      next.selectedFilesData = d.selectedFilesData.filter((f: LoadedFile) => f.fileId !== fileId)
      const { [fileId]: _, ...rest } = d.selectedFileRows
      next.selectedFileRows = rest
      next.activeFileId = d.activeFileId === fileId ? null : d.activeFileId
      next.selectedRowForScraped = d.selectedRowForScraped?.fileId === fileId ? null : d.selectedRowForScraped
      return next
    })
  }, [updateActiveTabData])

  // Fetch scraped data when a part row is selected for comparison
  useEffect(() => {
    if (!selectedRowForScraped) {
      setScrapedData(null)
      setScrapedVendorFilter('all')
      return
    }
    const token = getToken()
    if (!token) {
      setScrapedData(null)
      return
    }
    setScrapedDataLoading(true)
    listResearchUrls(token, {
      fileId: selectedRowForScraped.fileId,
      tableRowIndex: selectedRowForScraped.rowIdx,
    })
      .then((res) => {
        const data = res[0]?.scraped_data ?? null
        setScrapedData(data)
      })
      .catch(() => setScrapedData(null))
      .finally(() => setScrapedDataLoading(false))
  }, [selectedRowForScraped])

  // For "different parts from same vendor", collect scraped sources for every selected part.
  useEffect(() => {
    if (compareMode !== 'different-same-vendor') {
      setScrapedDataByPart({})
      setCommonVendorsLoading(false)
      return
    }
    const token = getToken()
    if (!token || items.length === 0) {
      setScrapedDataByPart({})
      setCommonVendorsLoading(false)
      return
    }
    const partRefs = items
      .map((item) => ({ itemId: item.id, parsed: parseFileItemId(item.id) }))
      .filter((x): x is { itemId: string; parsed: { fileId: number; rowIdx: number } } => x.parsed != null)
    if (partRefs.length === 0) {
      setScrapedDataByPart({})
      setCommonVendorsLoading(false)
      return
    }

    let cancelled = false
    setCommonVendorsLoading(true)
    Promise.all(
      partRefs.map(async ({ itemId, parsed }) => {
        try {
          const res = await listResearchUrls(token, {
            fileId: parsed.fileId,
            tableRowIndex: parsed.rowIdx,
          })
          return { itemId, scraped: res[0]?.scraped_data ?? [] }
        } catch {
          return { itemId, scraped: [] as ScrapedDataItem[] }
        }
      })
    )
      .then((all) => {
        if (cancelled) return
        const map: Record<string, ScrapedDataItem[]> = {}
        for (const x of all) map[x.itemId] = x.scraped
        setScrapedDataByPart(map)
      })
      .finally(() => {
        if (!cancelled) setCommonVendorsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [compareMode, items])

  const commonVendorDomains = useMemo(() => {
    if (compareMode !== 'different-same-vendor') return []
    const partIds = items
      .map((item) => (parseFileItemId(item.id) ? item.id : null))
      .filter((id): id is string => id != null)
    if (partIds.length === 0) return []

    const domainSets = partIds.map((id) =>
      new Set((scrapedDataByPart[id] ?? []).map((d) => extractDomain(d.url)).filter(Boolean))
    )
    if (domainSets.some((s) => s.size === 0)) return []

    const intersection = new Set(domainSets[0]!)
    for (const s of domainSets.slice(1)) {
      for (const v of [...intersection]) {
        if (!s.has(v)) intersection.delete(v)
      }
    }
    return Array.from(intersection).sort()
  }, [compareMode, items, scrapedDataByPart])
  const comparedPartLabels = useMemo(() => {
    if (compareMode !== 'different-same-vendor') return []
    return Array.from(
      new Set(
        items.map((i) => {
          const label = (i.title ?? '').trim()
          return label || '—'
        })
      )
    )
  }, [compareMode, items])

  // If the chosen vendor no longer exists in the current scraped dataset, fall back to all.
  useEffect(() => {
    if (scrapedVendorFilter === 'all') return
    const domains =
      compareMode === 'different-same-vendor'
        ? new Set(commonVendorDomains)
        : new Set((scrapedData ?? []).map((d) => extractDomain(d.url)).filter(Boolean))
    if (!domains.has(scrapedVendorFilter)) setScrapedVendorFilter('all')
  }, [compareMode, scrapedData, commonVendorDomains, scrapedVendorFilter])

  /** Rows shown in the scraped comparison table (same filter as before, lifted for column reorder state). */
  const scrapedTableRows = useMemo(() => {
    if (!scrapedData?.length) return []
    const commonSet = new Set(commonVendorDomains)
    const baseRows =
      compareMode === 'different-same-vendor'
        ? scrapedData.filter((d) => commonSet.has(extractDomain(d.url)))
        : scrapedData
    const effectiveFilter = scrapedVendorFilter === 'all' ? null : scrapedVendorFilter
    return effectiveFilter
      ? baseRows.filter((d) => extractDomain(d.url) === effectiveFilter)
      : baseRows
  }, [scrapedData, compareMode, commonVendorDomains, scrapedVendorFilter])

  const scrapedTableSignature = useMemo(
    () => scrapedTableRows.map((d) => d.url).join('\n'),
    [scrapedTableRows]
  )
  const scrapedFieldKeys = useMemo(() => {
    const allKeys = new Set<string>()
    for (const item of scrapedTableRows) {
      if (item.data && typeof item.data === 'object') {
        flattenObjectKeys(item.data as Record<string, unknown>).forEach((k) => allKeys.add(k))
      }
    }
    return Array.from(allKeys).sort()
  }, [scrapedTableRows])
  const scrapedFieldSignature = useMemo(() => scrapedFieldKeys.join('\n'), [scrapedFieldKeys])

  const [scrapedColumnOrder, setScrapedColumnOrder] = useState<number[]>([])
  const [scrapedFieldOrder, setScrapedFieldOrder] = useState<number[]>([])
  const [scrapedRowFieldColWidth, setScrapedRowFieldColWidth] = useState(188)
  const [scrapedColumnViewSourceColWidth, setScrapedColumnViewSourceColWidth] = useState(220)
  const [scrapedSourceColWidths, setScrapedSourceColWidths] = useState<Record<string, number>>({})
  const [scrapedFieldColWidths, setScrapedFieldColWidths] = useState<Record<string, number>>({})

  useEffect(() => {
    setScrapedColumnOrder(scrapedTableRows.map((_, i) => i))
  }, [scrapedTableSignature])
  useEffect(() => {
    setScrapedFieldOrder(scrapedFieldKeys.map((_, i) => i))
  }, [scrapedFieldSignature])
  useEffect(() => {
    setScrapedSelectedFields((prev) => prev.filter((k) => scrapedFieldKeys.includes(k)))
  }, [scrapedFieldKeys])

  const handleScrapedSourceDragStart = useCallback(
    (e: DragEvent<HTMLTableCellElement>, displayIndex: number) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/scraped-source-index', String(displayIndex))
    },
    []
  )

  const handleScrapedDragOver = useCallback((e: DragEvent<HTMLTableCellElement | HTMLTableRowElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleScrapedSourceDrop = useCallback(
    (e: DragEvent<HTMLTableCellElement | HTMLTableRowElement>, toDisplayIndex: number) => {
      e.preventDefault()
      const from = Number(e.dataTransfer.getData('text/scraped-source-index'))
      if (Number.isNaN(from) || from === toDisplayIndex) return
      setScrapedColumnOrder((prev) => {
        if (prev.length !== scrapedTableRows.length) return prev
        const next = [...prev]
        const [removed] = next.splice(from, 1)
        next.splice(toDisplayIndex, 0, removed)
        return next
      })
    },
    [scrapedTableRows.length]
  )

  const handleScrapedFieldDragStart = useCallback(
    (e: DragEvent<HTMLTableCellElement>, displayIndex: number) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/scraped-field-index', String(displayIndex))
    },
    []
  )

  const handleScrapedFieldDrop = useCallback(
    (e: DragEvent<HTMLTableCellElement | HTMLTableRowElement>, toDisplayIndex: number) => {
      e.preventDefault()
      const from = Number(e.dataTransfer.getData('text/scraped-field-index'))
      if (Number.isNaN(from) || from === toDisplayIndex) return
      setScrapedFieldOrder((prev) => {
        if (prev.length !== scrapedFieldKeys.length) return prev
        const next = [...prev]
        const [removed] = next.splice(from, 1)
        next.splice(toDisplayIndex, 0, removed)
        return next
      })
    },
    [scrapedFieldKeys.length]
  )

  const startColumnResize = useCallback(
    (
      e: ReactMouseEvent<HTMLSpanElement>,
      kind: 'row-field' | 'row-source' | 'column-source' | 'column-field',
      key: string,
      startWidth: number
    ) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const MIN_W = 120
      const onMove = (ev: globalThis.MouseEvent) => {
        const next = Math.max(MIN_W, startWidth + (ev.clientX - startX))
        if (kind === 'row-field') setScrapedRowFieldColWidth(next)
        else if (kind === 'row-source')
          setScrapedSourceColWidths((prev) => ({ ...prev, [key]: next }))
        else if (kind === 'column-source') setScrapedColumnViewSourceColWidth(next)
        else setScrapedFieldColWidths((prev) => ({ ...prev, [key]: next }))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    []
  )

  // When scraped compare modes have items but no part selected, default to first part.
  useEffect(() => {
    if (
      (compareMode === 'same-part' || compareMode === 'different-same-vendor') &&
      items.length > 0 &&
      !selectedRowForScraped
    ) {
      const first = items[0]
      const parsed = first ? parseFileItemId(first.id) : null
      if (parsed && first) {
        updateActiveTabData((d) => ({
          ...d,
          selectedRowForScraped: {
            fileId: parsed.fileId,
            rowIdx: parsed.rowIdx,
            partLabel: first.title || '—',
          },
        }))
      }
    }
  }, [compareMode, items, selectedRowForScraped, updateActiveTabData])

  const buildItemsFromFileRows = useCallback(
    (fileData: LoadedFile, rowIndices: number[]): ComparisonItem[] => {
      const headers = fileData.content[0] ?? []
      return rowIndices
        .map((rowIdx) => {
          const row = fileData.content[rowIdx + 1]
          if (!row) return null
          const title = String(row[0] ?? '')
          const specs = headers.map((label, i) => ({
            label: (label || `Column ${i + 1}`).trim(),
            value: String(row[i] ?? '—'),
          }))
          const item: ComparisonItem = {
            id: `file-${fileData.fileId}-${rowIdx}`,
            title,
            imageUrl: null,
            specs,
            sourceName: fileData.name,
          }
          return item
        })
        .filter((x): x is ComparisonItem => x != null)
    },
    []
  )

  useEffect(() => {
    if (restoredItemsOnceRef.current) return
    if (!activeTab) return
    if (items.length > 0) {
      restoredItemsOnceRef.current = true
      return
    }
    const restored: ComparisonItem[] = []
    const rowsByFile = activeTab.data.selectedFileRows
    for (const fileData of activeTab.data.selectedFilesData) {
      const rows = rowsByFile[fileData.fileId] ?? []
      if (rows.length === 0) continue
      restored.push(...buildItemsFromFileRows(fileData, [...rows].sort((a, b) => a - b)))
    }
    if (restored.length > 0) addItems(restored)
    restoredItemsOnceRef.current = true
  }, [activeTab, items.length, buildItemsFromFileRows, addItems])

  const handleAddSelectedFileRows = useCallback(
    (fileId: number) => {
      const fileData = selectedFilesData.find((f: LoadedFile) => f.fileId === fileId)
      const rows = selectedFileRows[fileId] ?? []
      if (!fileData || rows.length === 0) return
      const newItems = buildItemsFromFileRows(fileData, [...rows].sort((a, b) => a - b))
      if (newItems.length > 0) {
        addItems(newItems)
        comparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    [selectedFilesData, selectedFileRows, buildItemsFromFileRows, addItems]
  )

  const totalSelectedAcrossFiles = selectedFilesData.reduce(
    (sum: number, f: LoadedFile) => sum + (selectedFileRows[f.fileId]?.length ?? 0),
    0
  )
  const filesWithSelection = selectedFilesData.filter(
    (f: LoadedFile) => (selectedFileRows[f.fileId]?.length ?? 0) > 0
  ).length

  const handleAddAllSelectedFromAllFiles = useCallback(() => {
    const allItems: ComparisonItem[] = []
    for (const fileData of selectedFilesData) {
      const rows = selectedFileRows[fileData.fileId] ?? []
      if (rows.length === 0) continue
      const items = buildItemsFromFileRows(
        fileData,
        [...rows].sort((a, b) => a - b)
      )
      allItems.push(...items)
    }
    if (allItems.length > 0) {
      addItems(allItems)
      comparisonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [selectedFilesData, selectedFileRows, buildItemsFromFileRows, addItems])

  const toggleFileRow = useCallback((fileId: number, rowIdx: number, checked: boolean) => {
    updateActiveTabData((d) => {
      const arr = d.selectedFileRows[fileId] ?? []
      const nextArr = checked
        ? (arr.includes(rowIdx) ? arr : [...arr, rowIdx])
        : arr.filter((i) => i !== rowIdx)
      return {
        ...d,
        selectedFileRows: { ...d.selectedFileRows, [fileId]: nextArr },
      }
    })
  }, [updateActiveTabData])

  /** Parse file-{fileId}-{rowIdx} to get fileId and rowIdx for scraped data lookup */
  function parseFileItemId(itemId: string): { fileId: number; rowIdx: number } | null {
    const match = itemId.match(/^file-(\d+)-(\d+)$/)
    if (!match) return null
    return { fileId: Number(match[1]), rowIdx: Number(match[2]) }
  }

  return (
    <div className={`flex ${COMPARE_PAGE_H} w-full min-w-0 bg-white text-slate-900`}>
        <CompareSheetsSidebar
          open={sheetsSidebarOpen}
          compareTabs={compareTabs}
          activeCompareTabId={activeCompareTabId}
          newTabMenuOpen={newTabMenuOpen}
          setNewTabMenuOpen={setNewTabMenuOpen}
          onOpenSidebar={() => setSheetsSidebarOpen(true)}
          onCloseSidebar={() => setSheetsSidebarOpen(false)}
          onAddNewTab={addNewCompareTab}
          onOpenFilePicker={() => setFilePickerOpen(true)}
          onSetActiveTab={setActiveCompareTabId}
          onCloseTab={closeCompareTab}
          renamingTabId={renamingTabId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          onStartRenaming={startRenaming}
          onCommitRename={commitRename}
          onCancelRename={cancelRename}
          renameInputRef={renameInputRef}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 lg:px-8">

      <CompareWorkspaceSection
        compareMode={compareMode}
        selectedFilesData={selectedFilesData}
        selectedFileRows={selectedFileRows}
        activeFileId={activeFileId}
        selectedRowForScraped={selectedRowForScraped}
        fileContentLoadingSize={fileContentLoading.size}
        portfolioPartNumbers={portfolioPartNumbers}
        totalSelectedAcrossFiles={totalSelectedAcrossFiles}
        filesWithSelection={filesWithSelection}
        onOpenFilePicker={() => setFilePickerOpen(true)}
        onSetActiveFile={(fileId) => updateActiveTabData((d) => ({ ...d, activeFileId: fileId }))}
        onRemoveFile={handleRemoveFile}
        onToggleFileRow={toggleFileRow}
        onAddSelectedFileRows={handleAddSelectedFileRows}
        onAddAllSelectedFromAllFiles={handleAddAllSelectedFromAllFiles}
        onCancelAllSelected={() => {
          closeAndClear()
          updateActiveTabData((d) => ({ ...d, selectedFileRows: {} }))
        }}
      />

      {/* Comparison matrix */}
      <div ref={comparisonSectionRef} className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Comparison matrix</h2>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">Specification table</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              Mode controls how workspace files behave. Same-part mode unlocks scraped vendor fields below the table.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Comparison type"
          className="mt-6 flex flex-wrap gap-1 rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/80"
        >
          {COMPARE_MODE_TABS.map(({ id, label }) => {
            const isActive = compareMode === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                id={`compare-mode-tab-${id}`}
                onClick={() => setCompareMode(id)}
                className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all sm:px-4 ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}

              >
                {label}
              </button>
            )
          })}
        </div>

     

        {items.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-6 py-14 text-center ring-1 ring-slate-950/[0.03]">
            <p className="text-sm font-medium text-slate-700">No items in comparison</p>
            <p className="mt-2 text-sm text-slate-500">
              Add rows from workspace files above or send parts from Research to populate this table.
            </p>
          </div>
        )}

        {/* Scraped vendor data */}
        {(compareMode === 'same-part' || compareMode === 'different-same-vendor') && (
          <div className={items.length > 0 ? 'mt-10' : 'mt-8'}>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Vendor scrape</h3>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {compareMode === 'different-same-vendor' ? 'Common vendor fields' : 'Structured fields'}
                  {compareMode !== 'different-same-vendor' && selectedRowForScraped ? (
                    <span className="font-normal text-slate-600"> — {selectedRowForScraped.partLabel}</span>
                  ) : null}
                </p>
                {compareMode === 'different-same-vendor' && (
                  <p className="mt-1 text-xs text-slate-500">
                    Parts: {comparedPartLabels.join(', ')} · {commonVendorDomains.length} common vendor
                    {commonVendorDomains.length === 1 ? '' : 's'}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {items.length > 0 && (
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="font-medium">Part</span>
                    <select
                      value={(() => {
                        const currentId = selectedRowForScraped
                          ? `file-${selectedRowForScraped.fileId}-${selectedRowForScraped.rowIdx}`
                          : null
                        const inItems = currentId && items.some((i) => i.id === currentId)
                        return inItems ? currentId : (items[0]?.id ?? '')
                      })()}
                      onChange={(e) => {
                        const id = e.target.value
                        const parsed = parseFileItemId(id)
                        const item = items.find((i) => i.id === id)
                        if (parsed && item) {
                          updateActiveTabData((d) => ({
                            ...d,
                            selectedRowForScraped: {
                              fileId: parsed.fileId,
                              rowIdx: parsed.rowIdx,
                              partLabel: item.title || '—',
                            },
                          }))
                        }
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                    >
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title || '—'}
                          {item.sourceName ? ` (${item.sourceName})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {scrapedData && scrapedData.length > 0 && (() => {
                  const domains =
                    compareMode === 'different-same-vendor'
                      ? commonVendorDomains
                      : [...new Set(scrapedData.map((d) => extractDomain(d.url)).filter(Boolean))].sort()
                  if (domains.length === 0) return null
                  return (
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="font-medium">Vendor</span>
                      <select
                        value={scrapedVendorFilter}
                        onChange={(e) => setScrapedVendorFilter(e.target.value)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                      >
                        <option value="all">All vendors</option>
                        {domains.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                })()}
                {scrapedData && scrapedData.length > 0 && (
                  <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
                    <button
                      type="button"
                      onClick={() => setScrapedViewMode('row')}
                      className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                        scrapedViewMode === 'row'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Row view
                    </button>
                    <button
                      type="button"
                      onClick={() => setScrapedViewMode('column')}
                      className={`border-l border-slate-300 px-3 py-1.5 text-xs font-medium transition-colors ${
                        scrapedViewMode === 'column'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Column view
                    </button>
                  </div>
                )}
                {scrapedData && scrapedData.length > 0 && (
                  <>
                    <details className="group relative">
                      <summary className="list-none cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
                        Fields {scrapedSelectedFields.length > 0 ? `(${scrapedSelectedFields.length})` : '(All)'}
                      </summary>
                      <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5">
                        <input
                          type="search"
                          value={scrapedFieldPickerSearch}
                          onChange={(e) => setScrapedFieldPickerSearch(e.target.value)}
                          placeholder="Search fields…"
                          className="mb-2 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                        />
                        <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-slate-500">
                          <button
                            type="button"
                            onClick={() => setScrapedSelectedFields(scrapedFieldKeys)}
                            className="hover:text-slate-700"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => setScrapedSelectedFields([])}
                            className="hover:text-slate-700"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
                          {scrapedFieldKeys
                            .filter((k) =>
                              scrapedFieldPickerSearch.trim()
                                ? k.toLowerCase().includes(scrapedFieldPickerSearch.trim().toLowerCase())
                                : true
                            )
                            .map((k) => {
                              const checked = scrapedSelectedFields.includes(k)
                              return (
                                <label key={k} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) =>
                                      setScrapedSelectedFields((prev) =>
                                        e.target.checked ? [...prev, k] : prev.filter((x) => x !== k)
                                      )
                                    }
                                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                                  />
                                  <span className="truncate text-slate-700" title={k}>
                                    {k}
                                  </span>
                                </label>
                              )
                            })}
                        </div>
                      </div>
                    </details>
                    <input
                      type="search"
                      value={scrapedValueSearch}
                      onChange={(e) => setScrapedValueSearch(e.target.value)}
                      placeholder="Filter values…"
                      className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                    />
                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 shadow-sm">
                      <input
                        type="checkbox"
                        checked={scrapedNonEmptyOnly}
                        onChange={(e) => setScrapedNonEmptyOnly(e.target.checked)}
                        className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                      />
                      Non-empty only
                    </label>
                  </>
                )}
              </div>
            </div>
            {!selectedRowForScraped ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-600 ring-1 ring-slate-950/5">
                Select a part row in the workspace list to load scraped vendor fields.
              </p>
            ) : scrapedDataLoading || (compareMode === 'different-same-vendor' && commonVendorsLoading) ? (
              <div className="flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-5 py-10 text-sm text-slate-600 ring-1 ring-slate-950/5">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 47" />
                </svg>
                <span>Loading scraped data…</span>
              </div>
            ) : compareMode === 'different-same-vendor' && commonVendorDomains.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-8 text-center text-sm text-amber-900 ring-1 ring-amber-100">
                No common vendors found across selected parts. Select different parts or run more Research to collect overlapping vendors.
              </p>
            ) : scrapedData && scrapedData.length > 0 ? (
              (() => {
                const colOrder =
                  scrapedColumnOrder.length === scrapedTableRows.length
                    ? scrapedColumnOrder
                    : scrapedTableRows.map((_, i) => i)
                const displayScrapedRows = colOrder.map((i) => scrapedTableRows[i]!)
                const fieldOrder =
                  scrapedFieldOrder.length === scrapedFieldKeys.length
                    ? scrapedFieldOrder
                    : scrapedFieldKeys.map((_, i) => i)
                const orderedFieldKeys = fieldOrder.map((i) => scrapedFieldKeys[i]!)
                const valueNeedle = scrapedValueSearch.trim().toLowerCase()
                const visibleFieldKeys = orderedFieldKeys.filter((key) => {
                  if (scrapedSelectedFields.length > 0 && !scrapedSelectedFields.includes(key)) return false
                  if (!valueNeedle && !scrapedNonEmptyOnly) return true
                  const hasMatch = displayScrapedRows.some((item) => {
                    const val = getNestedValue((item.data ?? {}) as Record<string, unknown>, key)
                    const printable =
                      val == null
                        ? ''
                        : typeof val === 'string'
                          ? val
                          : typeof val === 'object'
                            ? JSON.stringify(val)
                            : String(val)
                    if (scrapedNonEmptyOnly && !printable.trim()) return false
                    return valueNeedle ? printable.toLowerCase().includes(valueNeedle) : true
                  })
                  return hasMatch
                })
                const sourceWidth = (url: string) => scrapedSourceColWidths[url] ?? 188
                const fieldWidth = (key: string) => scrapedFieldColWidths[key] ?? 160
                const renderScrapedCell = (item: ScrapedDataItem, key: string) => {
                  const val = getNestedValue((item.data ?? {}) as Record<string, unknown>, key)
                  const imageUrls = Array.isArray(val)
                    ? (val as unknown[]).filter((v): v is string => typeof v === 'string' && isImageUrl(v))
                    : isImageUrl(val)
                      ? [String(val)]
                      : []
                  const showAsImage = (isImageKey(key) || imageUrls.length > 0) && imageUrls.length > 0
                  const strVal =
                    val == null
                      ? '—'
                      : typeof val === 'string'
                        ? val
                        : typeof val === 'object'
                          ? JSON.stringify(val)
                          : String(val)
                  if (showAsImage) {
                    return (
                      <span className="inline-flex flex-wrap gap-2">
                        {imageUrls.map((imgSrc, i) => (
                          <span key={i} className="relative">
                            <img
                              src={imgSrc}
                              alt={`${key.replace(/_/g, ' ')} ${i + 1}`}
                              className="max-h-24 rounded-lg border border-slate-200 object-contain"
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
                              className="hidden max-w-[200px] truncate text-xs text-sky-700 hover:underline"
                              title={imgSrc}
                            >
                              {imgSrc}
                            </a>
                          </span>
                        ))}
                      </span>
                    )
                  }
                  return typeof val === 'object' && val !== null ? strVal : String(val ?? '—')
                }
                return (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/5">
                    <div className="overflow-x-auto">
                      {visibleFieldKeys.length === 0 ? (
                        <div className="px-5 py-8 text-center text-sm text-slate-500">
                          No fields match the current filters.
                        </div>
                      ) : scrapedViewMode === 'row' ? (
                        <table className="min-w-full border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/95">
                              <th
                                className="sticky left-0 z-30 relative border-b border-r border-slate-200 bg-slate-50 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.08)]"
                                style={{ width: scrapedRowFieldColWidth, minWidth: scrapedRowFieldColWidth }}
                              >
                                Field
                                <span
                                  onMouseDown={(e) =>
                                    startColumnResize(e, 'row-field', 'field', scrapedRowFieldColWidth)
                                  }
                                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none"
                                  title="Resize column"
                                />
                              </th>
                              {displayScrapedRows.map((item, displayIdx) => (
                                <th
                                  key={item.url}
                                  draggable
                                  onDragStart={(e) => handleScrapedSourceDragStart(e, displayIdx)}
                                  onDragOver={handleScrapedDragOver}
                                  onDrop={(e) => handleScrapedSourceDrop(e, displayIdx)}
                                  className="relative cursor-move select-none border-b border-l border-slate-100 px-4 py-3.5 text-left"
                                  style={{ width: sourceWidth(item.url), minWidth: sourceWidth(item.url) }}
                                  title="Drag to reorder sources"
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    <span className="mt-0.5 shrink-0 text-slate-400 select-none" aria-hidden>
                                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
                                      </svg>
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Source {displayIdx + 1}
                                      </p>
                                      <a
                                        href={item.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        draggable={false}
                                        onDragStart={(e) => e.stopPropagation()}
                                        className="mt-1 block truncate text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
                                        title={item.url}
                                      >
                                        {shortenUrl(item.url)}
                                      </a>
                                    </div>
                                  </div>
                                  <span
                                    onMouseDown={(e) =>
                                      startColumnResize(e, 'row-source', item.url, sourceWidth(item.url))
                                    }
                                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none"
                                    title="Resize column"
                                  />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {visibleFieldKeys.map((key, displayFieldIdx) => (
                              <tr
                                key={key}
                                onDragOver={handleScrapedDragOver}
                                onDrop={(e) => handleScrapedFieldDrop(e, displayFieldIdx)}
                                className="group transition-colors hover:bg-slate-50/60"
                              >
                                <td
                                  draggable
                                  onDragStart={(e) => handleScrapedFieldDragStart(e, displayFieldIdx)}
                                  className="sticky left-0 z-10 cursor-move select-none border-r border-slate-100 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.06)] group-hover:bg-slate-50"
                                  style={{ width: scrapedRowFieldColWidth, minWidth: scrapedRowFieldColWidth }}
                                  title="Drag to reorder fields"
                                >
                                  {key.replace(/_/g, ' ').replace(/\./g, ' › ')}
                                </td>
                                {displayScrapedRows.map((item) => (
                                  <td
                                    key={`${item.url}-${key}`}
                                    className="border-l border-slate-100 px-4 py-2.5 text-sm text-slate-800 align-top"
                                    style={{ width: sourceWidth(item.url), minWidth: sourceWidth(item.url) }}
                                  >
                                    {renderScrapedCell(item, key)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="min-w-full border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/95">
                              <th
                                className="sticky left-0 z-30 relative border-b border-r border-slate-200 bg-slate-50 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.08)]"
                                style={{
                                  width: scrapedColumnViewSourceColWidth,
                                  minWidth: scrapedColumnViewSourceColWidth,
                                }}
                              >
                                Source
                                <span
                                  onMouseDown={(e) =>
                                    startColumnResize(
                                      e,
                                      'column-source',
                                      'source',
                                      scrapedColumnViewSourceColWidth
                                    )
                                  }
                                  className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none"
                                  title="Resize column"
                                />
                              </th>
                              {visibleFieldKeys.map((key, displayFieldIdx) => (
                                <th
                                  key={key}
                                  draggable
                                  onDragStart={(e) => handleScrapedFieldDragStart(e, displayFieldIdx)}
                                  onDragOver={handleScrapedDragOver}
                                  onDrop={(e) => handleScrapedFieldDrop(e, displayFieldIdx)}
                                  className="relative cursor-move select-none border-b border-l border-slate-100 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                                  style={{ width: fieldWidth(key), minWidth: fieldWidth(key) }}
                                  title="Drag to reorder fields"
                                >
                                  {key.replace(/_/g, ' ').replace(/\./g, ' › ')}
                                  <span
                                    onMouseDown={(e) =>
                                      startColumnResize(e, 'column-field', key, fieldWidth(key))
                                    }
                                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none"
                                    title="Resize column"
                                  />
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {displayScrapedRows.map((item, displayIdx) => (
                              <tr
                                key={item.url}
                                onDragOver={handleScrapedDragOver}
                                onDrop={(e) => handleScrapedSourceDrop(e, displayIdx)}
                                className="group transition-colors hover:bg-slate-50/60"
                              >
                                <td
                                  draggable
                                  onDragStart={(e) => handleScrapedSourceDragStart(e, displayIdx)}
                                  className="sticky left-0 z-10 cursor-move select-none border-r border-slate-100 bg-white px-4 py-2.5 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.06)] group-hover:bg-slate-50"
                                  style={{
                                    width: scrapedColumnViewSourceColWidth,
                                    minWidth: scrapedColumnViewSourceColWidth,
                                  }}
                                  title="Drag to reorder sources"
                                >
                                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Source {displayIdx + 1}
                                  </p>
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 block truncate text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
                                    title={item.url}
                                  >
                                    {shortenUrl(item.url)}
                                  </a>
                                </td>
                                {visibleFieldKeys.map((key) => (
                                  <td
                                    key={`${item.url}-${key}`}
                                    className="border-l border-slate-100 px-4 py-2.5 text-sm text-slate-800 align-top"
                                    style={{ width: fieldWidth(key), minWidth: fieldWidth(key) }}
                                  >
                                    {renderScrapedCell(item, key)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )
              })()
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-600 ring-1 ring-slate-950/5">
                No scraped data for this part. Run Research on the Research page to collect vendor data.
              </p>
            )}
          </div>
        )}
      </div>





      <CompareFilePickerModal
        open={filePickerOpen}
        filePickerLoading={filePickerLoading}
        filePickerError={filePickerError}
        filePickerFiles={filePickerFiles}
        selectedFilesData={selectedFilesData}
        fileContentLoading={fileContentLoading}
        onClose={() => setFilePickerOpen(false)}
        onFileClick={handleFilePickerFileClick}
      />
          </div>
        </div>
    </div>
  )
}
