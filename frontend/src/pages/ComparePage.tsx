import type { DragEvent, MouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layers, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { getToken } from '@/lib/auth'
import {
  getWorkspaceFileContent,
  listDataSheetSelections,
  listPortfolioItems,
  listResearchUrls,
  listWorkspaceItems,
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

type FileEntry = { id: number; name: string; folderPath: string | null }

type LoadedFile = {
  fileId: number
  name: string
  content: string[][]
  folderPath: string | null
}

type CompareTabData = {
  selectedFilesData: LoadedFile[]
  selectedFileRows: Record<number, number[]>
  activeFileId: number | null
  selectedRowForScraped: { fileId: number; rowIdx: number; partLabel: string } | null
}

type CompareTab = {
  id: string
  name: string
  data: CompareTabData
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

type CompareMode = 'same-part' | 'different-same-vendor' | 'different-different-vendors'

const COMPARE_MODE_TABS: { id: CompareMode; label: string }[] = [
  { id: 'same-part', label: 'Same part across vendors' },
  { id: 'different-same-vendor', label: 'Different parts from same vendor' },
  { id: 'different-different-vendors', label: 'Different parts from different vendors' },
]

const COMPARE_SHEETS_SIDEBAR_KEY = 'ir-compare-sheets-open'

/** Fixed height matches `main` in MainLayout so the sheet sidebar does not stretch with content (avoids large-screen layout glitches). */
const COMPARE_PAGE_H = 'h-[calc(100vh-3.5rem)]'

export function ComparePage() {
  const { items, addItems, closeAndClear } = useComparison()
  const [compareTabs, setCompareTabs] = useState<CompareTab[]>(() => [newBlankCompareTab()])
  const [activeCompareTabId, setActiveCompareTabId] = useState<string | null>(null)
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
  const [scrapedDataByPart, setScrapedDataByPart] = useState<Record<string, ScrapedDataItem[]>>({})
  const [commonVendorsLoading, setCommonVendorsLoading] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [portfolioPartNumbers, setPortfolioPartNumbers] = useState<Set<string>>(new Set())
  const [compareMode, setCompareMode] = useState<CompareMode>('different-different-vendors')

  const activeTab =
    compareTabs.find((t) => t.id === (activeCompareTabId ?? undefined)) ?? compareTabs[0] ?? null
  const selectedFilesData = activeTab?.data.selectedFilesData ?? []
  const selectedFileRows = activeTab?.data.selectedFileRows ?? {}
  const activeFileId = activeTab?.data.activeFileId ?? null
  const selectedRowForScraped = activeTab?.data.selectedRowForScraped ?? null

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

  const closeCompareTab = useCallback((e: MouseEvent, id: string) => {
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

  useEffect(() => {
    setScrapedColumnOrder(scrapedTableRows.map((_, i) => i))
  }, [scrapedTableSignature])
  useEffect(() => {
    setScrapedFieldOrder(scrapedFieldKeys.map((_, i) => i))
  }, [scrapedFieldSignature])

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
        {!sheetsSidebarOpen && (
          <div
            className="flex h-full w-10 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 sm:w-11"
            aria-label="Compare sheets (collapsed)"
          >
            <button
              type="button"
              onClick={() => setSheetsSidebarOpen(true)}
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
                const abbr = words.length >= 2
                  ? (words[0]![0]! + words[1]![0]!).toUpperCase()
                  : words[0]!.slice(0, 2).toUpperCase()
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCompareTabId(tab.id)}
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
              onClick={addNewCompareTab}
              className="flex h-10 w-full shrink-0 items-center justify-center border-t border-slate-200/80 text-slate-400 transition-colors hover:bg-white hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400/50"
              title="New sheet"
              aria-label="Add new sheet"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}

        {sheetsSidebarOpen && (
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
                onClick={() => setSheetsSidebarOpen(false)}
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
                    onClick={addNewCompareTab}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="text-slate-400">+</span>
                    Blank sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewTabMenuOpen(false)
                      setFilePickerOpen(true)
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
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') cancelRename()
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-violet-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-inner outline-none ring-2 ring-violet-400/30 sm:px-3 sm:py-2"
                          aria-label={`Rename sheet ${tab.name}`}
                        />
                      ) : (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setActiveCompareTabId(tab.id)}
                          onDoubleClick={() => startRenaming(tab.id)}
                          className="min-w-0 flex-1 truncate px-2 py-2 text-left sm:px-3 sm:py-2.5"
                          title="Double-click to rename"
                        >
                          <span className="line-clamp-2 wrap-break-word">{tab.name}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => closeCompareTab(e, tab.id)}
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
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6 lg:px-8">

      {/* Data source — heading merged in */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm ring-1 ring-slate-950/5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Compare workspace</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Product comparison</h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">
              Align specifications across vendors and parts using workspace data and scraped research in one view.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFilePickerOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Choose file…
          </button>
          {fileContentLoading.size > 0 && (
            <span className="text-sm text-slate-500">Loading file…</span>
          )}
          {selectedFilesData.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {(compareMode === 'different-same-vendor'
                ? selectedFilesData.slice(0, 1)
                : selectedFilesData
              ).map((file: LoadedFile) => {
                const isActive = file.fileId === (activeFileId ?? selectedFilesData[0]?.fileId)
                return (
                  <span
                    key={file.fileId}
                    onClick={() => updateActiveTabData((d) => ({ ...d, activeFileId: file.fileId }))}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <span className="font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFile(file.fileId)
                      }}
                      className={`rounded p-0.5 ${
                        isActive
                          ? 'text-slate-300 hover:bg-white/15 hover:text-white'
                          : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                      }`}
                      aria-label={`Remove ${file.name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}
        </div>
        {selectedFilesData.length > 0 && (() => {
          const filesToUse = compareMode === 'different-same-vendor' ? selectedFilesData.slice(0, 1) : selectedFilesData
          const fileData = filesToUse.find(
            (f: LoadedFile) => f.fileId === (activeFileId ?? filesToUse[0]?.fileId)
          )
          if (!fileData) return null
          return (
          <div key={fileData.fileId} className="mt-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{fileData.name}</p>
            {fileData.content.length > 1 ? (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/5">
                <p className="border-b border-slate-100 bg-slate-50/80 px-4 py-2 text-xs font-medium text-slate-600">
                  Select parts · {fileData.content.length - 1} rows
                </p>
                <div className="max-h-52 overflow-y-auto px-2 py-2">
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {fileData.content.slice(1).map((row: string[], idx: number) => {
                      const rowIdx = idx
                      const label = String(row[0] ?? row[1] ?? `Row ${rowIdx + 1}`)
                      const isChecked = (selectedFileRows[fileData.fileId] ?? []).includes(rowIdx)
                      const isSelectedForScraped =
                        selectedRowForScraped?.fileId === fileData.fileId &&
                        selectedRowForScraped?.rowIdx === rowIdx
                      const inPortfolio = portfolioPartNumbers.has(label.trim().toLowerCase())
                      return (
                        <label
                          key={rowIdx}
                          title={inPortfolio ? `${label} — In Portfolio` : label}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                            inPortfolio
                              ? isSelectedForScraped
                                ? 'border-emerald-500 bg-emerald-200 text-emerald-950'
                                : isChecked
                                  ? 'border-emerald-400 bg-emerald-200 text-emerald-950'
                                  : 'border-emerald-300 bg-emerald-100 text-slate-900 hover:border-emerald-400 hover:bg-emerald-200'
                              : isSelectedForScraped
                                ? 'border-sky-300 bg-sky-50 text-sky-900'
                                : isChecked
                                  ? 'border-slate-300 bg-slate-100 text-slate-900'
                                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => toggleFileRow(fileData.fileId, rowIdx, e.target.checked)}
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                          <span className="min-w-0 truncate font-medium">{label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/50 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => handleAddSelectedFileRows(fileData.fileId)}
                    disabled={!(selectedFileRows[fileData.fileId]?.length ?? 0)}
                    className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {(selectedFileRows[fileData.fileId]?.length ?? 0) > 0
                      ? `Add ${selectedFileRows[fileData.fileId]?.length ?? 0} selected`
                      : 'Select parts above'}
                  </button>
                  <span className="text-[11px] text-slate-400">
                    {(selectedFileRows[fileData.fileId]?.length ?? 0)}/{fileData.content.length - 1} selected
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No data rows in this file.</p>
            )}
          </div>
          )
        })()}
      
        {compareMode !== 'different-same-vendor' && selectedFilesData.length > 1 && totalSelectedAcrossFiles > 0 && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 ring-1 ring-slate-950/5">
            <h4 className="text-sm font-semibold text-slate-900">Cross-vendor selection</h4>
            <p className="mt-1.5 text-sm text-slate-600">
              {totalSelectedAcrossFiles} row{totalSelectedAcrossFiles !== 1 ? 's' : ''} selected across{' '}
              {filesWithSelection} file{filesWithSelection !== 1 ? 's' : ''}. Add everything to the comparison table.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddAllSelectedFromAllFiles}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Add all selected to comparison
              </button>
              <button
                type="button"
                onClick={() => {
                  closeAndClear()
                  updateActiveTabData((d) => ({ ...d, selectedFileRows: {} }))
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

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
                  {selectedRowForScraped ? (
                    <span className="font-normal text-slate-600"> — {selectedRowForScraped.partLabel}</span>
                  ) : null}
                </p>
                {compareMode === 'different-same-vendor' && (
                  <p className="mt-1 text-xs text-slate-500">
                    Comparing {items.length} part{items.length === 1 ? '' : 's'} · {commonVendorDomains.length} common vendor
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
                      {scrapedViewMode === 'row' ? (
                        <table className="min-w-full border-separate border-spacing-0 text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/95">
                              <th className="sticky left-0 z-30 min-w-[120px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.08)] sm:min-w-[168px]">
                                Field
                              </th>
                              {displayScrapedRows.map((item, displayIdx) => (
                                <th
                                  key={item.url}
                                  draggable
                                  onDragStart={(e) => handleScrapedSourceDragStart(e, displayIdx)}
                                  onDragOver={handleScrapedDragOver}
                                  onDrop={(e) => handleScrapedSourceDrop(e, displayIdx)}
                                  className="min-w-[140px] cursor-grab border-b border-l border-slate-100 px-4 py-3.5 text-left active:cursor-grabbing sm:min-w-[188px]"
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
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {orderedFieldKeys.map((key, displayFieldIdx) => (
                              <tr
                                key={key}
                                onDragOver={handleScrapedDragOver}
                                onDrop={(e) => handleScrapedFieldDrop(e, displayFieldIdx)}
                                className="group transition-colors hover:bg-slate-50/60"
                              >
                                <td
                                  draggable
                                  onDragStart={(e) => handleScrapedFieldDragStart(e, displayFieldIdx)}
                                  className="sticky left-0 z-10 min-w-[120px] cursor-grab border-r border-slate-100 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.06)] group-hover:bg-slate-50 active:cursor-grabbing sm:min-w-[168px]"
                                  title="Drag to reorder fields"
                                >
                                  {key.replace(/_/g, ' ').replace(/\./g, ' › ')}
                                </td>
                                {displayScrapedRows.map((item) => (
                                  <td
                                    key={`${item.url}-${key}`}
                                    className="border-l border-slate-100 px-4 py-2.5 text-sm text-slate-800 align-top"
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
                              <th className="sticky left-0 z-30 min-w-[220px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.08)]">
                                Source
                              </th>
                              {orderedFieldKeys.map((key, displayFieldIdx) => (
                                <th
                                  key={key}
                                  draggable
                                  onDragStart={(e) => handleScrapedFieldDragStart(e, displayFieldIdx)}
                                  onDragOver={handleScrapedDragOver}
                                  onDrop={(e) => handleScrapedFieldDrop(e, displayFieldIdx)}
                                  className="min-w-[160px] cursor-grab border-b border-l border-slate-100 px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 active:cursor-grabbing"
                                  title="Drag to reorder fields"
                                >
                                  {key.replace(/_/g, ' ').replace(/\./g, ' › ')}
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
                                  className="sticky left-0 z-10 min-w-[220px] cursor-grab border-r border-slate-100 bg-white px-4 py-2.5 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.06)] group-hover:bg-slate-50 active:cursor-grabbing"
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
                                {orderedFieldKeys.map((key) => (
                                  <td
                                    key={`${item.url}-${key}`}
                                    className="border-l border-slate-100 px-4 py-2.5 text-sm text-slate-800 align-top"
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





      {/* File picker modal */}
      {filePickerOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          onClick={() => setFilePickerOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-file-picker-title"
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-slate-950/5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4">
              <h3 id="compare-file-picker-title" className="text-base font-semibold text-slate-900">
                Workspace files
              </h3>
              <button
                type="button"
                onClick={() => setFilePickerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {filePickerLoading && (
                <p className="py-10 text-center text-sm text-slate-500">Loading files…</p>
              )}
              {filePickerError && (
                <p className="py-4 text-center text-sm text-red-600">{filePickerError}</p>
              )}
              {!filePickerLoading && !filePickerError && filePickerFiles.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">
                  No files in workspace. Upload from the Home page first.
                </p>
              )}
              {!filePickerLoading && !filePickerError && filePickerFiles.length > 0 && (
                <>
                  <p className="mb-3 px-2 text-xs font-medium text-slate-500">Select a file to attach to this sheet.</p>
                  <ul className="space-y-1">
                  {filePickerFiles.map((file: FileEntry) => {
                    const isSelected = selectedFilesData.some((f: LoadedFile) => f.fileId === file.id)
                    const isLoading = fileContentLoading.has(file.id)
                    return (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => handleFilePickerFileClick(file)}
                        disabled={isSelected || isLoading}
                        className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          isSelected
                            ? 'cursor-default bg-slate-100 text-slate-500'
                            : isLoading
                              ? 'cursor-wait text-slate-500'
                              : 'text-slate-800 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate w-full font-medium">{file.name}</span>
                        {file.folderPath && (
                          <span className="truncate w-full text-xs text-slate-500">{file.folderPath}</span>
                        )}
                        {isSelected && (
                          <span className="text-xs font-medium text-slate-700">Attached</span>
                        )}
                      </button>
                    </li>
                  )
                  })}
                </ul>
                </>
              )}
            </div>
            <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
              <button
                type="button"
                onClick={() => setFilePickerOpen(false)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
          </div>
        </div>
    </div>
  )
}
