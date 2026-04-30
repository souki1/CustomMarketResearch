import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { getToken } from '@/lib/auth'
import { CompareFilePickerModal } from '@/components/compare/CompareFilePickerModal'
import { CompareDecisionWorkspace, type CompareDecisionRow } from '@/components/compare/CompareDecisionWorkspace'
import { CompareSheetsSidebar } from '@/components/compare/CompareSheetsSidebar'
import { CompareVendorMindMap } from '@/components/compare/CompareVendorMindMap'
import { CompareVendorOverview, collectPricesFromScrapedData } from '@/components/compare/CompareVendorOverview'
import { CompareWorkspaceSection } from '@/components/compare/CompareWorkspaceSection'
import { primaryTextFromDataRow } from '@/components/compare/dataRow'
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
import { useBucket } from '@/contexts/BucketContext'

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

function compactSourceUrlLabel(url: string): string {
  const s = String(url ?? '').trim()
  if (!s) return '—'
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\./, '')
    const hasPath = Boolean(u.pathname && u.pathname !== '/')
    return hasPath ? `${host}/...` : host
  } catch {
    return shortenUrl(s, 28)
  }
}

function formatValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (val == null) return '—'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function collectScalarSpecs(obj: Record<string, unknown>, prefix = ''): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = []
  for (const [k, v] of Object.entries(obj)) {
    const label = prefix ? `${prefix}.${k}` : k
    if (v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out.push(...collectScalarSpecs(v as Record<string, unknown>, label))
    } else {
      out.push({ label, value: formatValue(v) })
    }
  }
  return out
}

function isPartNumberKey(key: string): boolean {
  const k = key.toLowerCase().replace(/\s+/g, '').replace(/-/g, '_')
  return (k.includes('part') && (k.includes('number') || k.endsWith('part_no') || k.includes('part_no'))) || k === 'partno'
}

function getFirstPartNumber(obj: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(obj)) {
    if (!isPartNumberKey(k)) continue
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
    if (Array.isArray(v)) {
      const first = v.find((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')
      if (first != null) return String(first)
    }
  }
  return null
}

function getVendorNameFromSourceData(data: Record<string, unknown>, url: string): string {
  const preferredKeys = [
    'vendor_name',
    'vendor',
    'seller',
    'store_name',
    'manufacturer',
    'brand',
    'company',
    'supplier',
  ]
  for (const key of preferredKeys) {
    const val = data[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  for (const [key, val] of Object.entries(data)) {
    if (!/(vendor|seller|store|manufacturer|brand|company|supplier)/i.test(key)) continue
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return extractDomain(url)
}

function formatFieldLabel(key: string): string {
  const toTitle = (s: string) =>
    s
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (w.length ? `${w[0]!.toUpperCase()}${w.slice(1).toLowerCase()}` : w))
      .join(' ')

  return key
    .split('.')
    .map((segment) => toTitle(segment.replace(/_/g, ' ')))
    .join(' › ')
}

function pickFirstFieldValue(data: Record<string, unknown>, candidates: RegExp[]): string | null {
  for (const [k, v] of Object.entries(data)) {
    if (!candidates.some((rx) => rx.test(k))) continue
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      const s = String(v).trim()
      if (s) return s
    }
  }
  return null
}

function parseMoneyValue(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
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

function serializeCompareTabsForPersistence(tabs: CompareTab[]): Array<Record<string, unknown>> {
  return tabs.map((t) => ({
    id: t.id,
    name: t.name,
    data: {
      selectedFilesData: t.data.selectedFilesData.map((f) => ({
        fileId: f.fileId,
        name: f.name,
        folderPath: f.folderPath,
      })),
      selectedFileRows: t.data.selectedFileRows,
      activeFileId: t.data.activeFileId,
      selectedRowForScraped: t.data.selectedRowForScraped,
    },
  }))
}

function coercePersistedTabs(raw: unknown): CompareTab[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((t): CompareTab | null => {
      if (!t || typeof t !== 'object') return null
      const obj = t as Record<string, unknown>
      const id = typeof obj.id === 'string' && obj.id ? obj.id : crypto.randomUUID()
      const name = typeof obj.name === 'string' && obj.name ? obj.name : 'New tab'
      const data = (obj.data && typeof obj.data === 'object' ? obj.data : {}) as Record<string, unknown>
      const selectedFilesDataRaw = Array.isArray(data.selectedFilesData) ? data.selectedFilesData : []
      const selectedFilesData: LoadedFile[] = selectedFilesDataRaw
        .map((f): LoadedFile | null => {
          if (!f || typeof f !== 'object') return null
          const fo = f as Record<string, unknown>
          const fileId = Number(fo.fileId)
          if (!Number.isFinite(fileId)) return null
          return {
            fileId,
            name: String(fo.name ?? ''),
            folderPath: fo.folderPath == null ? null : String(fo.folderPath),
            content: Array.isArray(fo.content) ? (fo.content as string[][]) : [],
          }
        })
        .filter((x): x is LoadedFile => x != null)
      const selectedFileRows =
        data.selectedFileRows && typeof data.selectedFileRows === 'object'
          ? (data.selectedFileRows as Record<number, number[]>)
          : {}
      const activeFileId = data.activeFileId == null ? null : Number(data.activeFileId)
      const selectedRowForScraped =
        data.selectedRowForScraped && typeof data.selectedRowForScraped === 'object'
          ? (data.selectedRowForScraped as {
              fileId: number | null
              tabId: string | null
              rowIdx: number
              partLabel: string
            })
          : null
      return {
        id,
        name,
        data: {
          selectedFilesData,
          selectedFileRows,
          activeFileId: Number.isFinite(activeFileId) ? activeFileId : null,
          selectedRowForScraped,
        },
      }
    })
    .filter((x): x is CompareTab => x != null)
}

function coerceRouteComparisonItems(raw: unknown): ComparisonItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): ComparisonItem | null => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const id = typeof obj.id === 'string' ? obj.id : ''
      const title = typeof obj.title === 'string' ? obj.title : ''
      const sourceName = typeof obj.sourceName === 'string' ? obj.sourceName : null
      const imageUrl = typeof obj.imageUrl === 'string' ? obj.imageUrl : null
      const specsRaw = Array.isArray(obj.specs) ? obj.specs : []
      const specs = specsRaw
        .map((spec) => {
          if (!spec || typeof spec !== 'object') return null
          const s = spec as Record<string, unknown>
          return {
            label: String(s.label ?? ''),
            value: String(s.value ?? '—'),
          }
        })
        .filter((x): x is { label: string; value: string } => x != null)
      if (!id || !title || specs.length === 0) return null
      return {
        id,
        title,
        specs,
        sourceName,
        imageUrl,
      }
    })
    .filter((x): x is ComparisonItem => x != null)
}

type ResearchCompareRequestState = {
  fileId: number | null
  tabId: string | null
  rowIndex: number
  sourceIndices: number[]
}

type StructuredScrapedRow = ScrapedDataItem & {
  sourceKey: string
  partId: string
  partLabel: string
}

export function ComparePage() {
  const location = useLocation()
  const { items, closeAndClear, openWithItems } = useComparison()
  const { addItem: addBucketItem, showToast: showBucketToast } = useBucket()
  const [compareTabs, setCompareTabs] = useState<CompareTab[]>(() => {
    const persisted = readPersistedCompareState()
    const tabs = coercePersistedTabs(persisted?.compareTabs)
    return tabs.length > 0
      ? tabs
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
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false)
  const fieldPickerBtnRef = useRef<HTMLButtonElement>(null)
  const fieldPickerDropRef = useRef<HTMLDivElement>(null)
  const [scrapedValueSearch, setScrapedValueSearch] = useState('')
  const [scrapedNonEmptyOnly, setScrapedNonEmptyOnly] = useState(false)
  const [scrapedDataByPart, setScrapedDataByPart] = useState<Record<string, ScrapedDataItem[]>>({})
  const [commonVendorsLoading, setCommonVendorsLoading] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [portfolioPartNumbers, setPortfolioPartNumbers] = useState<Set<string>>(new Set())
  const [vendorCoverageView, setVendorCoverageView] = useState<'map' | 'overview'>(() => {
    try {
      const v = localStorage.getItem('ir-compare-vendor-coverage-view')
      return v === 'overview' ? 'overview' : 'map'
    } catch {
      return 'map'
    }
  })
  const hasHydratedCompareStateRef = useRef(false)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [externalItemsByTab, setExternalItemsByTab] = useState<Record<string, ComparisonItem[]>>({})
  const consumedRouteItemsRef = useRef(false)
  const consumedResearchRequestRef = useRef(false)
  const routeComparisonItems = useMemo(() => {
    const st = location.state as { initialComparisonItems?: unknown } | null
    return coerceRouteComparisonItems(st?.initialComparisonItems)
  }, [location.state])
  const routeResearchRequest = useMemo(() => {
    const st = location.state as { researchCompareRequest?: unknown } | null
    const raw = st?.researchCompareRequest as Partial<ResearchCompareRequestState> | undefined
    if (!raw || typeof raw !== 'object') return null
    const rowIndex = Number(raw.rowIndex)
    if (!Number.isFinite(rowIndex) || rowIndex < 0) return null
    const sourceIndices = Array.isArray(raw.sourceIndices)
      ? raw.sourceIndices.filter((v): v is number => Number.isInteger(v) && v >= 0)
      : []
    if (sourceIndices.length === 0) return null
    return {
      fileId: raw.fileId == null ? null : Number(raw.fileId),
      tabId: typeof raw.tabId === 'string' ? raw.tabId : null,
      rowIndex,
      sourceIndices,
    } satisfies ResearchCompareRequestState
  }, [location.state])

  const activeTab =
    compareTabs.find((t) => t.id === (activeCompareTabId ?? undefined)) ?? compareTabs[0] ?? null
  const selectedFilesData = activeTab?.data.selectedFilesData ?? []
  const selectedFileRows = activeTab?.data.selectedFileRows ?? {}
  const activeFileId = activeTab?.data.activeFileId ?? null
  const selectedRowForScraped = activeTab?.data.selectedRowForScraped ?? null
  const fileBackedItems = useMemo(
    () => items.filter((item) => parseFileItemId(item.id) != null),
    [items]
  )
  const compareMode: CompareMode = fileBackedItems.length > 1 ? 'different-same-vendor' : 'same-part'
  const [structuredPartView, setStructuredPartView] = useState<'all' | string>('all')

  useEffect(() => {
    if (consumedRouteItemsRef.current) return
    if (!activeTab?.id) return
    if (routeComparisonItems.length === 0) return
    setExternalItemsByTab((prev) => ({ ...prev, [activeTab.id]: routeComparisonItems }))
    openWithItems(routeComparisonItems)
    consumedRouteItemsRef.current = true
  }, [routeComparisonItems, activeTab?.id, openWithItems])

  useEffect(() => {
    if (consumedResearchRequestRef.current) return
    if (!activeTab?.id) return
    if (!routeResearchRequest) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listResearchUrls(token, {
          fileId: routeResearchRequest.fileId ?? undefined,
          tabId: routeResearchRequest.tabId ?? undefined,
          tableRowIndex: routeResearchRequest.rowIndex,
        })
        if (cancelled) return
        const scraped = rows[0]?.scraped_data ?? []
        const mapped = routeResearchRequest.sourceIndices
          .filter((idx) => idx >= 0 && idx < scraped.length)
          .map((idx) => {
            const source = scraped[idx]!
            return {
              id: `research-api-${routeResearchRequest.tabId ?? routeResearchRequest.fileId ?? 'row'}-${routeResearchRequest.rowIndex}-${idx}`,
              title: getFirstPartNumber(source.data) ?? `Source ${idx + 1}`,
              imageUrl: null,
              specs: collectScalarSpecs(source.data),
              sourceName: source.url ? extractDomain(source.url) : '—',
            } satisfies ComparisonItem
          })
        if (mapped.length === 0) return
        setExternalItemsByTab((prev) => ({ ...prev, [activeTab.id]: mapped }))
        openWithItems(mapped)
        consumedResearchRequestRef.current = true
      } catch {
        // no-op: keep existing compare state if API fails
      }
    })()
    return () => {
      cancelled = true
    }
  }, [routeResearchRequest, activeTab?.id, openWithItems])

  useEffect(() => {
    if (!fieldPickerOpen) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (fieldPickerDropRef.current?.contains(target)) return
      if (fieldPickerBtnRef.current?.contains(target)) return
      setFieldPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [fieldPickerOpen])

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
          const tabs = coercePersistedTabs(state.compare_tabs)
          if (tabs.length > 0) {
          setCompareTabs(tabs)
          setActiveCompareTabId(
            typeof state.active_compare_tab_id === 'string' ? state.active_compare_tab_id : tabs[0]?.id ?? null
          )
          }
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

  const addNewCompareTab = useCallback(() => {
    const tab = newBlankCompareTab()
    setCompareTabs((prev) => [...prev, tab])
    setActiveCompareTabId(tab.id)
    setNewTabMenuOpen(false)
    // "New sheet" should start completely clean.
    closeAndClear()
    setScrapedData(null)
    setScrapedDataByPart({})
    setScrapedDataLoading(false)
    setCommonVendorsLoading(false)
    setScrapedVendorFilter('all')
    setScrapedViewMode('row')
    setScrapedSelectedFields([])
    setScrapedFieldPickerSearch('')
    setScrapedValueSearch('')
    setScrapedNonEmptyOnly(false)
    setScrapedColumnOrder([])
    setScrapedFieldOrder([])
    setScrapedSourceColWidths({})
    setScrapedFieldColWidths({})
    setScrapedRowFieldColWidth(188)
    setScrapedColumnViewSourceColWidth(220)
  }, [closeAndClear])

  const closeCompareTab = useCallback((e: ReactMouseEvent, id: string) => {
    e.stopPropagation()
    const idx = compareTabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    const next = compareTabs.filter((t) => t.id !== id)
    setCompareTabs(next)
    const closedWasActive = activeCompareTabId === id
    if (closedWasActive) {
      const newIdx = Math.min(idx, next.length - 1)
      setActiveCompareTabId(next[newIdx]?.id ?? null)
    } else if (next.length > 0 && compareTabs.findIndex((t) => t.id === activeCompareTabId) >= next.length) {
      setActiveCompareTabId(next[next.length - 1].id)
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
          selections.map((s) =>
            listPortfolioItems(token, { selectionId: s.id }).catch(() => [] as PortfolioItem[])
          )
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
          compareTabs: serializeCompareTabsForPersistence(compareTabs),
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
          compare_tabs: serializeCompareTabsForPersistence(compareTabs),
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

  useEffect(() => {
    try {
      localStorage.setItem('ir-compare-vendor-coverage-view', vendorCoverageView)
    } catch {
      // ignore
    }
  }, [vendorCoverageView])

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

  useEffect(() => {
    const token = getToken()
    if (!token) return
    const missing = compareTabs.flatMap((t) =>
      t.data.selectedFilesData
        .filter((f) => !Array.isArray(f.content) || f.content.length === 0)
        .map((f) => ({ tabId: t.id, file: f }))
    )
    if (missing.length === 0) return

    let cancelled = false
    ;(async () => {
      const cache = new Map<number, string[][]>()
      for (const { file } of missing) {
        if (cache.has(file.fileId)) continue
        try {
          const text = await getWorkspaceFileContent(file.fileId, token)
          const parsed = parseCsv(text)
          cache.set(file.fileId, parsed.length > 0 ? parsed : [['']])
        } catch {
          cache.set(file.fileId, [['']])
        }
      }
      if (cancelled) return
      setCompareTabs((prev) =>
        prev.map((tab) => ({
          ...tab,
          data: {
            ...tab.data,
            selectedFilesData: tab.data.selectedFilesData.map((f) =>
              !Array.isArray(f.content) || f.content.length === 0
                ? { ...f, content: cache.get(f.fileId) ?? [['']] }
                : f
            ),
          },
        }))
      )
    })()

    return () => {
      cancelled = true
    }
  }, [compareTabs])

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
    if (fileBackedItems.length === 0) {
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
    const partRefs = fileBackedItems
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
  }, [compareMode, fileBackedItems])

  /**
   * Vendor-driven part filtering for "different-same-vendor".
   * When a specific vendor is selected, only parts that contain that vendor stay in the Part dropdown and
   * downstream shared-vendor computations.
   */
  const effectiveVendorFilteredParts = useMemo(() => {
    if (compareMode !== 'different-same-vendor') return fileBackedItems
    if (scrapedVendorFilter === 'all') return fileBackedItems

    // Avoid aggressive filtering while scraped-by-part data is still loading.
    const hasScrapedByPart = Object.keys(scrapedDataByPart).length > 0
    if (!hasScrapedByPart) return fileBackedItems

    const wantedDomain = scrapedVendorFilter
    const filtered = fileBackedItems.filter((part) =>
      (scrapedDataByPart[part.id] ?? []).some((d) => extractDomain(d.url) === wantedDomain),
    )
    return filtered.length > 0 ? filtered : fileBackedItems
  }, [compareMode, scrapedVendorFilter, fileBackedItems, scrapedDataByPart])
  const selectedPartItemId = selectedRowForScraped
    ? `file-${selectedRowForScraped.fileId}-${selectedRowForScraped.rowIdx}`
    : null
  const structuredPartSelectValue =
    compareMode === 'different-same-vendor'
      ? structuredPartView === 'all'
        ? 'all'
        : structuredPartView
      : (selectedPartItemId ?? '')
  const showingAllStructuredParts =
    compareMode === 'different-same-vendor' &&
    structuredPartSelectValue === 'all' &&
    effectiveVendorFilteredParts.length > 1
  const currentComparedPartLabel = showingAllStructuredParts
    ? `All selected parts (${effectiveVendorFilteredParts.length})`
    : (selectedRowForScraped?.partLabel ?? effectiveVendorFilteredParts[0]?.title ?? 'Selected part')

  const handleStructuredPartViewChange = useCallback((id: string) => {
    if (compareMode === 'different-same-vendor' && id === 'all') {
      setStructuredPartView('all')
      return
    }
    const parsed = parseFileItemId(id)
    const item = effectiveVendorFilteredParts.find((i) => i.id === id)
    if (parsed && item) {
      setStructuredPartView(id)
      updateActiveTabData((d) => ({
        ...d,
        selectedRowForScraped: {
          fileId: parsed.fileId,
          tabId: null,
          rowIdx: parsed.rowIdx,
          partLabel: item.title || '—',
        },
      }))
    }
  }, [compareMode, effectiveVendorFilteredParts, updateActiveTabData])

  useEffect(() => {
    if (compareMode !== 'different-same-vendor') {
      setStructuredPartView(selectedPartItemId ?? 'all')
      return
    }
    if (effectiveVendorFilteredParts.length <= 1) {
      setStructuredPartView(selectedPartItemId ?? effectiveVendorFilteredParts[0]?.id ?? 'all')
      return
    }
    if (structuredPartView === 'all') return
    const exists = effectiveVendorFilteredParts.some((item) => item.id === structuredPartView)
    if (!exists) setStructuredPartView('all')
  }, [compareMode, effectiveVendorFilteredParts, selectedPartItemId, structuredPartView])

  /** Domains that count as "common": on ≥2 parts when comparing multiple parts; all domains when only one part. */
  const commonVendorDomains = useMemo(() => {
    if (compareMode !== 'different-same-vendor') return []
    const partIds = effectiveVendorFilteredParts
      .map((item) => (parseFileItemId(item.id) ? item.id : null))
      .filter((id): id is string => id != null)
    if (partIds.length === 0) return []

    const domainSets = partIds.map((id) =>
      new Set((scrapedDataByPart[id] ?? []).map((d) => extractDomain(d.url)).filter(Boolean))
    )

    if (partIds.length === 1) {
      return Array.from(domainSets[0] ?? []).sort()
    }

    const domainPartCount = new Map<string, number>()
    for (const s of domainSets) {
      for (const d of s) {
        domainPartCount.set(d, (domainPartCount.get(d) ?? 0) + 1)
      }
    }
    return [...domainPartCount.entries()]
      .filter(([, count]) => count >= 2)
      .map(([d]) => d)
      .sort()
  }, [compareMode, effectiveVendorFilteredParts, scrapedDataByPart])
  const comparedPartLabels = useMemo(() => {
    if (compareMode !== 'different-same-vendor') return []
    return Array.from(
      new Set(
        effectiveVendorFilteredParts.map((i) => {
          const label = (i.title ?? '').trim()
          return label || '—'
        })
      )
    )
  }, [compareMode, effectiveVendorFilteredParts])

  /** Bar + table summary + mind map: vendors per part, overlap, prices from scraped numeric/price fields */
  const vendorOverviewPayload = useMemo(() => {
    if (!selectedRowForScraped) return null
    const MAX_MAP_VENDORS = 32
    const fmtUsd = (n: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

    function vendorsForMindMap(
      partKey: string,
      list: ScrapedDataItem[],
      commonDomainSet: Set<string> | null
    ) {
      const byDomain = new Map<string, number | null>()
      for (const d of list) {
        const dom = extractDomain(d.url)
        if (!dom) continue
        const nums = collectPricesFromScrapedData(d.data as Record<string, unknown>)
        const p = nums.length ? Math.min(...nums) : null
        const prev = byDomain.get(dom)
        if (prev === undefined) byDomain.set(dom, p)
        else {
          const next = p != null && (prev == null || p < prev) ? p : prev
          byDomain.set(dom, next)
        }
      }
      const sorted = Array.from(byDomain.entries()).sort(([a], [b]) => a.localeCompare(b))
      const slice = sorted.slice(0, MAX_MAP_VENDORS)
      const vendors = slice.map(([domain, price]) => ({
        key: `${partKey}:${domain}`,
        domain,
        priceLabel: price != null ? fmtUsd(price) : null,
        isCommon: commonDomainSet ? commonDomainSet.has(domain) : false,
      }))
      if (sorted.length > MAX_MAP_VENDORS) {
        vendors.push({
          key: `${partKey}:+more`,
          domain: `+${sorted.length - MAX_MAP_VENDORS} more vendors`,
          priceLabel: null,
          isCommon: false,
        })
      }
      return vendors
    }

    if (compareMode === 'different-same-vendor') {
      if (effectiveVendorFilteredParts.length === 0 || commonVendorsLoading) return null
      const partRows = effectiveVendorFilteredParts.map((item) => {
        const list = scrapedDataByPart[item.id] ?? []
        const domains = new Set(list.map((d) => extractDomain(d.url)).filter(Boolean))
        const prices: number[] = []
        for (const d of list) {
          prices.push(...collectPricesFromScrapedData(d.data as Record<string, unknown>))
        }
        const minP = prices.length ? Math.min(...prices) : null
        const maxP = prices.length ? Math.max(...prices) : null
        const avgP = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null
        return {
          id: item.id,
          label: (item.title || '—').trim() || '—',
          vendorCount: domains.size,
          sourceCount: list.length,
          minPrice: minP,
          maxPrice: maxP,
          avgPrice: avgP,
        }
      })
      const maxVendorCount = Math.max(1, ...partRows.map((r) => r.vendorCount))
      const commonVendorRows =
        effectiveVendorFilteredParts.length > 1 && commonVendorDomains.length > 0
          ? commonVendorDomains.map((domain) => {
              const priceByPartId: Record<string, string> = {}
              const urlByPartId: Record<string, string | null> = {}
              for (const item of effectiveVendorFilteredParts) {
                const list = scrapedDataByPart[item.id] ?? []
                const match = list.find((d) => extractDomain(d.url) === domain)
                const nums = match ? collectPricesFromScrapedData(match.data as Record<string, unknown>) : []
                const p = nums.length ? Math.min(...nums) : null
                priceByPartId[item.id] =
                  p != null
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(p)
                    : '—'
                urlByPartId[item.id] = match?.url ? String(match.url) : null
              }
              return { domain, priceByPartId, urlByPartId }
            })
          : null
      const commonDomainSetForMap = effectiveVendorFilteredParts.length > 1 ? new Set(commonVendorDomains) : null
      const mindMap = {
        rootLabel:
          effectiveVendorFilteredParts.length > 1
            ? 'Compare parts'
            : ((effectiveVendorFilteredParts[0]?.title || '—').trim() || 'Compare'),
        parts: effectiveVendorFilteredParts.map((item, idx) => ({
          id: item.id,
          label: (item.title || '—').trim() || '—',
          colorIndex: idx,
          vendors: vendorsForMindMap(item.id, scrapedDataByPart[item.id] ?? [], commonDomainSetForMap),
        })),
      }
      return {
        partRows,
        maxVendorCount,
        commonVendorCount:
          effectiveVendorFilteredParts.length > 1 ? commonVendorDomains.length : null,
        commonVendorRows,
        mindMap,
      }
    }
    if (compareMode === 'same-part') {
      if (scrapedDataLoading || !scrapedData?.length) return null
      const list = scrapedData
      const domains = new Set(list.map((d) => extractDomain(d.url)).filter(Boolean))
      const prices: number[] = []
      for (const d of list) {
        prices.push(...collectPricesFromScrapedData(d.data as Record<string, unknown>))
      }
      const minP = prices.length ? Math.min(...prices) : null
      const maxP = prices.length ? Math.max(...prices) : null
      const avgP = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null
      const partLabel = (selectedRowForScraped.partLabel || 'Selected part').trim() || 'Selected part'
      const mindMap = {
        rootLabel: partLabel,
        parts: [
          {
            id: 'vendor-offers',
            label: 'Vendor offers',
            colorIndex: 0,
            vendors: vendorsForMindMap('vendor-offers', list, null),
          },
        ],
      }
      return {
        partRows: [
          {
            id: 'same-part',
            label: partLabel,
            vendorCount: domains.size,
            sourceCount: list.length,
            minPrice: minP,
            maxPrice: maxP,
            avgPrice: avgP,
          },
        ],
        maxVendorCount: Math.max(1, domains.size),
        commonVendorCount: null,
        commonVendorRows: null,
        mindMap,
      }
    }
    return null
  }, [
    selectedRowForScraped,
    compareMode,
    effectiveVendorFilteredParts,
    scrapedDataByPart,
    commonVendorDomains,
    commonVendorsLoading,
    scrapedData,
    scrapedDataLoading,
  ])

  // If the chosen vendor no longer exists in the current scraped dataset, fall back to all.
  useEffect(() => {
    if (scrapedVendorFilter === 'all') return
    if (compareMode === 'different-same-vendor' && commonVendorsLoading) return
    const domains =
      compareMode === 'different-same-vendor'
        ? new Set(commonVendorDomains)
        : new Set((scrapedData ?? []).map((d) => extractDomain(d.url)).filter(Boolean))
    if (!domains.has(scrapedVendorFilter)) setScrapedVendorFilter('all')
  }, [compareMode, scrapedData, commonVendorDomains, scrapedVendorFilter])

  // In "different-same-vendor", keep the selected part aligned with the currently selected vendor.
  useEffect(() => {
    if (compareMode !== 'different-same-vendor') return
    if (scrapedVendorFilter === 'all') return
    if (!selectedRowForScraped) return
    if (effectiveVendorFilteredParts.length === 0) return

    const currentId = `file-${selectedRowForScraped.fileId}-${selectedRowForScraped.rowIdx}`
    const currentInEffective = effectiveVendorFilteredParts.some((p) => p.id === currentId)
    if (currentInEffective) return

    const nextPart = effectiveVendorFilteredParts[0]
    const parsed = nextPart ? parseFileItemId(nextPart.id) : null
    if (!parsed) return

    updateActiveTabData((d) => ({
      ...d,
          selectedRowForScraped: {
            fileId: parsed.fileId,
            tabId: null,
            rowIdx: parsed.rowIdx,
            partLabel: nextPart.title || '—',
          },
    }))
  }, [
    compareMode,
    scrapedVendorFilter,
    selectedRowForScraped,
    effectiveVendorFilteredParts,
    updateActiveTabData,
  ])

  /** Rows shown in the scraped comparison table (same filter as before, lifted for column reorder state). */
  const scrapedTableRows = useMemo<StructuredScrapedRow[]>(() => {
    const effectiveFilter = scrapedVendorFilter === 'all' ? null : scrapedVendorFilter

    if (compareMode === 'different-same-vendor') {
      const commonSet = new Set(commonVendorDomains)
      const sourceParts = showingAllStructuredParts
        ? effectiveVendorFilteredParts
        : effectiveVendorFilteredParts.filter((item) => item.id === structuredPartSelectValue)

      const rows = sourceParts.flatMap((part) =>
        (scrapedDataByPart[part.id] ?? []).map((item, idx) => ({
          ...item,
          sourceKey: `${part.id}::${item.url}::${idx}`,
          partId: part.id,
          partLabel: (part.title || '—').trim() || '—',
        }))
      )

      const baseRows = rows.filter((row) => commonSet.has(extractDomain(row.url)))
      return effectiveFilter
        ? baseRows.filter((row) => extractDomain(row.url) === effectiveFilter)
        : baseRows
    }

    if (!scrapedData?.length) return []
    const partLabel = (selectedRowForScraped?.partLabel || 'Selected part').trim() || 'Selected part'
    const baseRows = scrapedData.map((item, idx) => ({
      ...item,
      sourceKey: `single::${item.url}::${idx}`,
      partId: selectedPartItemId ?? 'selected-part',
      partLabel,
    }))
    return effectiveFilter
      ? baseRows.filter((row) => extractDomain(row.url) === effectiveFilter)
      : baseRows
  }, [
    scrapedVendorFilter,
    compareMode,
    commonVendorDomains,
    showingAllStructuredParts,
    effectiveVendorFilteredParts,
    structuredPartSelectValue,
    scrapedDataByPart,
    scrapedData,
    selectedRowForScraped,
    selectedPartItemId,
  ])

  const scrapedTableSignature = useMemo(
    () => scrapedTableRows.map((d) => d.sourceKey).join('\n'),
    [scrapedTableRows]
  )

  const decisionRows = useMemo<CompareDecisionRow[]>(() => {
    return scrapedTableRows.map((item, idx) => {
      const data = (item.data ?? {}) as Record<string, unknown>
      const vendor = getVendorNameFromSourceData(data, item.url)
      const priceRaw = pickFirstFieldValue(data, [/^price$/i, /price/i, /cost/i, /amount/i, /msrp/i])
      const shippingRaw = pickFirstFieldValue(data, [/shipping/i, /delivery.?cost/i, /freight/i])
      const availabilityRaw = pickFirstFieldValue(data, [/availability/i, /stock/i, /status/i]) ?? 'Unknown'
      const ratingRaw = pickFirstFieldValue(data, [/rating/i, /score/i, /stars?/i])
      const delivery = pickFirstFieldValue(data, [/delivery/i, /eta/i, /lead.?time/i]) ?? '—'
      const location = pickFirstFieldValue(data, [/location/i, /country/i, /city/i, /region/i]) ?? '—'
      const contact = pickFirstFieldValue(data, [/contact/i, /phone/i, /email/i, /support/i]) ?? '—'
      const priceNumber = parseMoneyValue(priceRaw)
      const shippingNumber = parseMoneyValue(shippingRaw)
      const ratingNumber = ratingRaw ? Number(ratingRaw.replace(/[^\d.]/g, '')) : null
      return {
        id: `${item.url}-${idx}`,
        url: item.url,
        vendor,
        price: priceNumber,
        priceLabel: priceRaw ?? '—',
        shipping: shippingNumber,
        shippingLabel: shippingRaw ?? '—',
        availability: availabilityRaw,
        rating: Number.isFinite(ratingNumber ?? NaN) ? ratingNumber : null,
        ratingLabel: ratingRaw ?? '—',
        delivery,
        location,
        contact,
        rawData: data,
      }
    })
  }, [scrapedTableRows])

  const [decisionVendorFilter, setDecisionVendorFilter] = useState('all')
  const [decisionOnlyAvailable, setDecisionOnlyAvailable] = useState(false)
  const [decisionPriceRange, setDecisionPriceRange] = useState<[number, number]>([0, 0])
  const [decisionSelectedIds, setDecisionSelectedIds] = useState<Set<string>>(new Set())
  const [decisionView, setDecisionView] = useState<'table' | 'insights' | 'mindmap'>('table')

  const decisionVendors = useMemo(
    () => Array.from(new Set(decisionRows.map((r) => r.vendor).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [decisionRows]
  )
  const decisionPriceBounds = useMemo<[number, number]>(() => {
    const nums = decisionRows.map((r) => r.price).filter((n): n is number => n != null)
    if (nums.length === 0) return [0, 0]
    return [Math.min(...nums), Math.max(...nums)]
  }, [decisionRows])
  useEffect(() => {
    setDecisionPriceRange(decisionPriceBounds)
  }, [decisionPriceBounds])

  const decisionFilteredRows = useMemo(() => {
    const [minPrice, maxPrice] = decisionPriceRange
    return decisionRows.filter((row) => {
      if (decisionVendorFilter !== 'all' && row.vendor !== decisionVendorFilter) return false
      if (decisionOnlyAvailable && !/in stock|available|low stock/i.test(row.availability)) return false
      if (row.price != null && (row.price < minPrice || row.price > maxPrice)) return false
      return true
    })
  }, [decisionRows, decisionVendorFilter, decisionOnlyAvailable, decisionPriceRange])
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
  const [selectedBucketSourceUrls, setSelectedBucketSourceUrls] = useState<Set<string>>(new Set())
  const [bucketSourceUrlsInSession, setBucketSourceUrlsInSession] = useState<Set<string>>(new Set())

  useEffect(() => {
    setScrapedColumnOrder(scrapedTableRows.map((_, i) => i))
  }, [scrapedTableSignature])
  useEffect(() => {
    setScrapedFieldOrder(scrapedFieldKeys.map((_, i) => i))
  }, [scrapedFieldSignature])
  useEffect(() => {
    // Keep all discovered fields visible in the decision table.
    setScrapedSelectedFields(scrapedFieldKeys)
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

  const toggleBucketSourceSelection = useCallback((url: string, checked: boolean) => {
    setSelectedBucketSourceUrls((prev) => {
      const next = new Set(prev)
      if (checked) next.add(url)
      else next.delete(url)
      return next
    })
  }, [])

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
      effectiveVendorFilteredParts.length > 0 &&
      !selectedRowForScraped
    ) {
      const first = effectiveVendorFilteredParts[0]
      const parsed = first ? parseFileItemId(first.id) : null
      if (parsed && first) {
        updateActiveTabData((d) => ({
          ...d,
          selectedRowForScraped: {
            fileId: parsed.fileId,
            tabId: null,
            rowIdx: parsed.rowIdx,
            partLabel: first.title || '—',
          },
        }))
      }
    }
  }, [compareMode, effectiveVendorFilteredParts, selectedRowForScraped, updateActiveTabData])

  const buildItemsFromFileRows = useCallback(
    (fileData: LoadedFile, rowIndices: number[]): ComparisonItem[] => {
      const headers = fileData.content[0] ?? []
      return rowIndices
        .map((rowIdx) => {
          const row = fileData.content[rowIdx + 1]
          if (!row) return null
          const title = primaryTextFromDataRow(row) ?? ''
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
    if (!activeTab) return
    const external = externalItemsByTab[activeTab.id] ?? []
    if (activeTab.data.selectedFilesData.length === 0) {
      openWithItems(external)
      return
    }
    const restored: ComparisonItem[] = []
    const rowsByFile = activeTab.data.selectedFileRows
    for (const fileData of activeTab.data.selectedFilesData) {
      const rows = rowsByFile[fileData.fileId] ?? []
      if (rows.length === 0) continue
      restored.push(...buildItemsFromFileRows(fileData, [...rows].sort((a, b) => a - b)))
    }
    if (restored.length === 0) {
      openWithItems(external)
      return
    }
    const merged = [...external, ...restored]
    const deduped = merged.filter((item, idx) => merged.findIndex((x) => x.id === item.id) === idx)
    openWithItems(deduped)
  }, [activeTab, buildItemsFromFileRows, openWithItems, externalItemsByTab])

  const totalSelectedAcrossFiles = selectedFilesData.reduce(
    (sum: number, f: LoadedFile) => sum + (selectedFileRows[f.fileId]?.length ?? 0),
    0
  )
  const toggleFileRow = useCallback((fileId: number, rowIdx: number, checked: boolean) => {
    updateActiveTabData((d) => {
      const arr = d.selectedFileRows[fileId] ?? []
      const nextArr = checked
        ? (arr.includes(rowIdx) ? arr : [...arr, rowIdx])
        : arr.filter((i) => i !== rowIdx)
      return {
        ...d,
        selectedFileRows: { ...d.selectedFileRows, [fileId]: nextArr },
        selectedRowForScraped:
          !checked &&
          d.selectedRowForScraped?.fileId === fileId &&
          d.selectedRowForScraped?.rowIdx === rowIdx
            ? null
            : d.selectedRowForScraped,
      }
    })
  }, [updateActiveTabData])

  /** Parse file-{fileId}-{rowIdx} to get fileId and rowIdx for scraped data lookup */
  function parseFileItemId(itemId: string): { fileId: number; rowIdx: number } | null {
    const match = itemId.match(/^file-(\d+)-(\d+)$/)
    if (!match) return null
    return { fileId: Number(match[1]), rowIdx: Number(match[2]) }
  }

  const toggleDecisionSelection = useCallback((id: string) => {
    setDecisionSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleAddDecisionRowToBucket = useCallback((id: string) => {
    const row = decisionRows.find((r) => r.id === id)
    if (!row) return
    const result = addBucketItem({
      id: `compare-source-${encodeURIComponent(row.url)}`,
      title: row.vendor || compactSourceUrlLabel(row.url),
      manufacturer: row.vendor || 'Vendor',
      price: row.priceLabel,
      rowIndex: 0,
      tabId: undefined,
    })
    if (result.added) showBucketToast('Source added to Bucket')
    else showBucketToast('Source already exists in Bucket')
  }, [decisionRows, addBucketItem, showBucketToast])

  const handleAddSelectedDecisionRowsToBucket = useCallback(() => {
    const targets = decisionFilteredRows.filter((r) => decisionSelectedIds.has(r.id))
    if (targets.length === 0) {
      showBucketToast('Select at least one vendor row')
      return
    }
    let added = 0
    for (const row of targets) {
      const result = addBucketItem({
        id: `compare-source-${encodeURIComponent(row.url)}`,
        title: row.vendor || compactSourceUrlLabel(row.url),
        manufacturer: row.vendor || 'Vendor',
        price: row.priceLabel,
        rowIndex: 0,
        tabId: undefined,
      })
      if (result.added) added += 1
    }
    showBucketToast(added > 0 ? `Added ${added} source${added === 1 ? '' : 's'} to Bucket` : 'Selected sources are already in Bucket')
  }, [decisionFilteredRows, decisionSelectedIds, addBucketItem, showBucketToast])

  return (
    <div className={`flex ${COMPARE_PAGE_H} w-full min-w-0 bg-[#eef3fb] text-slate-900`}>
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
          <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 lg:px-5">

      <CompareWorkspaceSection
        selectedFilesData={selectedFilesData}
        selectedFileRows={selectedFileRows}
        activeFileId={activeFileId}
        selectedRowForScraped={selectedRowForScraped}
        fileContentLoadingSize={fileContentLoading.size}
        portfolioPartNumbers={portfolioPartNumbers}
        totalSelectedAcrossFiles={totalSelectedAcrossFiles}
        onOpenFilePicker={() => setFilePickerOpen(true)}
        onSetActiveFile={(fileId) => updateActiveTabData((d) => ({ ...d, activeFileId: fileId }))}
        onRemoveFile={handleRemoveFile}
        onToggleFileRow={toggleFileRow}
      />

      {/* Comparison matrix */}
      <div ref={comparisonSectionRef} className="mt-4">
        {items.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-4 py-8 text-center ring-1 ring-slate-950/[0.03]">
            <p className="text-sm font-semibold text-slate-800">No items in comparison</p>
            <p className="mt-1 text-xs text-slate-500">
              Add rows from workspace files above or send parts from Research to populate this table.
            </p>
          </div>
        )}

        {(compareMode === 'same-part' || compareMode === 'different-same-vendor') && (
          <div className={items.length > 0 ? 'mt-5' : 'mt-4'}>
            {compareMode === 'different-same-vendor' && effectiveVendorFilteredParts.length > 1 && (
              <div className="mb-3 flex justify-end">
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="font-medium">View</span>
                  <select
                    value={structuredPartSelectValue}
                    onChange={(e) => handleStructuredPartViewChange(e.target.value)}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                  >
                    <option value="all">All selected parts</option>
                    {effectiveVendorFilteredParts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title || '—'}
                        {item.sourceName ? ` (${item.sourceName})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <CompareDecisionWorkspace
              partLabel={currentComparedPartLabel}
              rows={decisionRows}
              filteredRows={decisionFilteredRows}
              vendorFilter={decisionVendorFilter}
              vendors={decisionVendors}
              onVendorFilterChange={setDecisionVendorFilter}
              onlyAvailable={decisionOnlyAvailable}
              onOnlyAvailableChange={setDecisionOnlyAvailable}
              minPrice={decisionPriceBounds[0]}
              maxPrice={decisionPriceBounds[1]}
              priceRange={decisionPriceRange}
              onPriceRangeChange={setDecisionPriceRange}
              selectedIds={decisionSelectedIds}
              onToggleSelected={toggleDecisionSelection}
              onAddSelectedToBucket={handleAddSelectedDecisionRowsToBucket}
              onCompareSelected={() => {
                const selectedCount = decisionFilteredRows.filter((r) => decisionSelectedIds.has(r.id)).length
                showBucketToast(
                  selectedCount > 0
                    ? `${selectedCount} vendor row${selectedCount === 1 ? '' : 's'} selected for comparison`
                    : 'Select vendor rows to compare'
                )
              }}
              onAddSingleToBucket={handleAddDecisionRowToBucket}
              availableFields={scrapedFieldKeys}
              selectedFields={scrapedSelectedFields}
              onSelectedFieldsChange={setScrapedSelectedFields}
              view={decisionView}
              onViewChange={setDecisionView}
              mindMapModel={vendorOverviewPayload?.mindMap ?? null}
              onSelectVendorFromMindMap={(domain) => {
                setDecisionVendorFilter(domain)
                setScrapedVendorFilter(domain)
              }}
            />
          </div>
        )}

        {/* Scraped vendor data */}
        {(compareMode === 'same-part' || compareMode === 'different-same-vendor') && decisionRows.length === 0 && (
          <div className={items.length > 0 ? 'mt-6' : 'mt-5'}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
              <div>
                <p className="mt-0.5 text-base font-semibold text-slate-900">
                  {compareMode === 'different-same-vendor' ? 'Shared vendor fields' : 'Structured fields'}
                  {compareMode !== 'different-same-vendor' && selectedRowForScraped ? (
                    <span className="font-normal text-slate-600"> — {selectedRowForScraped.partLabel}</span>
                  ) : null}
                </p>
                {compareMode === 'different-same-vendor' && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Parts: {comparedPartLabels.join(', ')}
                    {effectiveVendorFilteredParts.length > 1
                      ? ` · ${commonVendorDomains.length} vendor${commonVendorDomains.length === 1 ? '' : 's'} appear on ≥2 parts (shared)`
                      : ` · ${commonVendorDomains.length} vendor${commonVendorDomains.length === 1 ? '' : 's'} scraped`}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {items.length > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="font-medium">Part</span>
                    <select
                      value={
                        compareMode === 'different-same-vendor'
                          ? structuredPartSelectValue
                          : (selectedPartItemId ?? '')
                      }
                      onChange={(e) => handleStructuredPartViewChange(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                    >
                      {compareMode === 'different-same-vendor' && effectiveVendorFilteredParts.length > 1 && (
                        <option value="all">All selected parts</option>
                      )}
                      {effectiveVendorFilteredParts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title || '—'}
                          {item.sourceName ? ` (${item.sourceName})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {scrapedTableRows.length > 0 && (() => {
                  const domains =
                    compareMode === 'different-same-vendor'
                      ? commonVendorDomains
                      : [...new Set(scrapedTableRows.map((d) => extractDomain(d.url)).filter(Boolean))].sort()
                  if (domains.length === 0) return null
                  return (
                    <label className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="font-medium">Vendor</span>
                      <select
                        value={scrapedVendorFilter}
                        onChange={(e) => setScrapedVendorFilter(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
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
                {scrapedTableRows.length > 0 && (
                  <>
                    <button
                      ref={fieldPickerBtnRef}
                      type="button"
                      onClick={() => setFieldPickerOpen((v) => !v)}
                      className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                    >
                      Fields {scrapedSelectedFields.length > 0 ? `(${scrapedSelectedFields.length})` : '(All)'}
                    </button>
                    {fieldPickerOpen && createPortal(
                      <div
                        ref={fieldPickerDropRef}
                        style={{
                          position: 'fixed',
                          zIndex: 9999,
                          top: (fieldPickerBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                          left: fieldPickerBtnRef.current?.getBoundingClientRect().left ?? 0,
                        }}
                      className="w-60 rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5"
                      >
                        <input
                          type="search"
                          value={scrapedFieldPickerSearch}
                          onChange={(e) => setScrapedFieldPickerSearch(e.target.value)}
                          placeholder="Search fields…"
                          autoFocus
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
                      </div>,
                      document.body,
                    )}
                    <input
                      type="search"
                      value={scrapedValueSearch}
                      onChange={(e) => setScrapedValueSearch(e.target.value)}
                      placeholder="Filter values…"
                      className="w-36 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                    />
                    <label className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 shadow-sm">
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
            {vendorOverviewPayload &&
              selectedRowForScraped &&
              !scrapedDataLoading &&
              !(compareMode === 'different-same-vendor' && commonVendorsLoading) && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">Coverage view</span>
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => setVendorCoverageView('map')}
                        className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          vendorCoverageView === 'map'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Mind map
                      </button>
                      <button
                        type="button"
                        onClick={() => setVendorCoverageView('overview')}
                        className={`border-l border-slate-300 px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          vendorCoverageView === 'overview'
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Table & bars
                      </button>
                    </div>
                  </div>
                  {vendorCoverageView === 'map' ? (
                    <CompareVendorMindMap
                      model={vendorOverviewPayload.mindMap}
                      onSelectVendor={(domain) => setScrapedVendorFilter(domain)}
                      onAddVendorToBucket={({ domain, parts }) => {
                        let added = 0
                        for (const part of parts) {
                          const id = `mindmap-${domain}-${part.partId}`
                          const result = addBucketItem({
                            id,
                            title: part.partLabel,
                            manufacturer: domain,
                            price: part.priceLabel ?? '',
                            rowIndex: 0,
                            tabId: undefined,
                          })
                          if (result.added) added += 1
                        }
                        if (added > 0) {
                          showBucketToast(
                            `${added} offer${added === 1 ? '' : 's'} added to Bucket from mind map`
                          )
                        } else {
                          showBucketToast('Vendor already in Bucket from mind map')
                        }
                      }}
                    />
                  ) : (
                    <CompareVendorOverview
                      partRows={vendorOverviewPayload.partRows}
                      maxVendorCount={vendorOverviewPayload.maxVendorCount}
                      commonVendorCount={vendorOverviewPayload.commonVendorCount}
                      commonVendorRows={vendorOverviewPayload.commonVendorRows}
                    />
                  )}
                </div>
              )}
            {!selectedRowForScraped ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-xs text-slate-600 ring-1 ring-slate-950/5">
                Select a part row in the workspace list to load scraped vendor fields.
              </p>
            ) : scrapedDataLoading || (compareMode === 'different-same-vendor' && commonVendorsLoading) ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-7 text-xs text-slate-600 ring-1 ring-slate-950/5">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 47" />
                </svg>
                <span>Loading scraped data…</span>
              </div>
            ) : compareMode === 'different-same-vendor' && commonVendorDomains.length === 0 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center text-xs text-amber-900 ring-1 ring-amber-100">
                {effectiveVendorFilteredParts.length > 1
                  ? 'No vendor domain appears on more than one selected part yet. Add overlapping research sources or pick parts that share suppliers.'
                  : 'No scraped vendors for this part yet. Run Research to collect sources.'}
              </p>
            ) : scrapedTableRows.length > 0 ? (
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
                const sourceWidth = (sourceKey: string) => scrapedSourceColWidths[sourceKey] ?? 188
                const fieldWidth = (key: string) => scrapedFieldColWidths[key] ?? 160
                const highlightNeedle = (text: string): React.ReactNode => {
                  if (!valueNeedle || !text) return text
                  const lower = text.toLowerCase()
                  const idx = lower.indexOf(valueNeedle)
                  if (idx === -1) return text
                  const parts: React.ReactNode[] = []
                  let cursor = 0
                  let pos = idx
                  let keyIdx = 0
                  while (pos !== -1) {
                    if (pos > cursor) parts.push(text.slice(cursor, pos))
                    parts.push(
                      <mark key={keyIdx++} className="rounded-sm bg-yellow-200 px-0.5 text-inherit">
                        {text.slice(pos, pos + valueNeedle.length)}
                      </mark>
                    )
                    cursor = pos + valueNeedle.length
                    pos = lower.indexOf(valueNeedle, cursor)
                  }
                  if (cursor < text.length) parts.push(text.slice(cursor))
                  return <>{parts}</>
                }
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
                  const display = typeof val === 'object' && val !== null ? strVal : String(val ?? '—')
                  return highlightNeedle(display)
                }
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-[11px] font-medium text-slate-500">Table view</span>
                      <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
                        <button
                          type="button"
                          onClick={() => setScrapedViewMode('row')}
                          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
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
                          className={`border-l border-slate-300 px-2.5 py-1 text-[11px] font-medium transition-colors ${
                            scrapedViewMode === 'column'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Column view
                        </button>
                      </div>
                    </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-950/5 max-h-[58vh] flex flex-col">
                    <div className="overflow-x-auto overflow-y-auto flex-1">
                      {visibleFieldKeys.length === 0 ? (
                        <div className="px-5 py-8 text-center text-sm text-slate-500">
                          No fields match the current filters.
                        </div>
                      ) : scrapedViewMode === 'row' ? (
                        <table className="min-w-full border-separate border-spacing-0 text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/95">
                              <th
                                className="sticky left-0 z-30 relative border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.08)]"
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
                                  key={item.sourceKey}
                                  draggable
                                  onDragStart={(e) => handleScrapedSourceDragStart(e, displayIdx)}
                                  onDragOver={handleScrapedDragOver}
                                  onDrop={(e) => handleScrapedSourceDrop(e, displayIdx)}
                                  className="relative cursor-move select-none border-b border-l border-slate-100 px-3 py-2.5 text-left"
                                  style={{ width: sourceWidth(item.sourceKey), minWidth: sourceWidth(item.sourceKey) }}
                                  title="Drag to reorder sources"
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    <span className="mt-0.5 shrink-0 text-slate-400 select-none" aria-hidden>
                                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                        <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm8-12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
                                      </svg>
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                                          checked={selectedBucketSourceUrls.has(item.sourceKey)}
                                          onChange={(e) =>
                                            toggleBucketSourceSelection(item.sourceKey, e.target.checked)
                                          }
                                          aria-label={`Select Source ${displayIdx + 1} for Bucket`}
                                        />
                                        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          Source {displayIdx + 1}
                                        </p>
                                      </div>
                                      <p className="mt-0.5 truncate text-[11px] text-slate-700">
                                        <span className="font-medium text-slate-500">Part:</span>{' '}
                                        <span className="font-medium">{item.partLabel}</span>
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] text-slate-700">
                                        <span className="font-medium text-slate-500">Vendor:</span>{' '}
                                        <span className="font-medium">{getVendorNameFromSourceData(item.data ?? {}, item.url)}</span>
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] text-slate-700">
                                        <span className="font-medium text-slate-500">URL:</span>{' '}
                                        <a
                                          href={item.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          draggable={false}
                                          onDragStart={(e) => e.stopPropagation()}
                                          className="font-medium text-sky-700 hover:text-sky-900 hover:underline"
                                          title={item.url}
                                        >
                                          {compactSourceUrlLabel(item.url)}
                                        </a>
                                      </p>
                                      {bucketSourceUrlsInSession.has(item.sourceKey) && (
                                        <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
                                          In Bucket
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    onMouseDown={(e) =>
                                      startColumnResize(e, 'row-source', item.sourceKey, sourceWidth(item.sourceKey))
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
                                  className="sticky left-0 z-10 cursor-move select-none border-r border-slate-100 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.06)] group-hover:bg-slate-50"
                                  style={{ width: scrapedRowFieldColWidth, minWidth: scrapedRowFieldColWidth }}
                                  title="Drag to reorder fields"
                                >
                                  {formatFieldLabel(key)}
                                </td>
                                {displayScrapedRows.map((item) => (
                                  <td
                                    key={`${item.sourceKey}-${key}`}
                                    className="border-l border-slate-100 px-3 py-2 text-xs text-slate-800 align-top"
                                    style={{ width: sourceWidth(item.sourceKey), minWidth: sourceWidth(item.sourceKey) }}
                                  >
                                    {renderScrapedCell(item, key)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <table className="min-w-full border-separate border-spacing-0 text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/95">
                              <th
                                className="sticky left-0 z-30 relative border-b border-r border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.08)]"
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
                                  className="relative cursor-move select-none border-b border-l border-slate-100 px-3 py-2.5 text-left text-[11px] font-semibold tracking-wide text-slate-500"
                                  style={{ width: fieldWidth(key), minWidth: fieldWidth(key) }}
                                  title="Drag to reorder fields"
                                >
                                  {formatFieldLabel(key)}
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
                                key={item.sourceKey}
                                onDragOver={handleScrapedDragOver}
                                onDrop={(e) => handleScrapedSourceDrop(e, displayIdx)}
                                className="group transition-colors hover:bg-slate-50/60"
                              >
                                <td
                                  draggable
                                  onDragStart={(e) => handleScrapedSourceDragStart(e, displayIdx)}
                                  className="sticky left-0 z-10 cursor-move select-none border-r border-slate-100 bg-white px-3 py-2 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.06)] group-hover:bg-slate-50"
                                  style={{
                                    width: scrapedColumnViewSourceColWidth,
                                    minWidth: scrapedColumnViewSourceColWidth,
                                  }}
                                  title="Drag to reorder sources"
                                >
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                                      checked={selectedBucketSourceUrls.has(item.sourceKey)}
                                      onChange={(e) =>
                                        toggleBucketSourceSelection(item.sourceKey, e.target.checked)
                                      }
                                      aria-label={`Select Source ${displayIdx + 1} for Bucket`}
                                    />
                                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Source {displayIdx + 1}
                                    </p>
                                  </div>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-700">
                                    <span className="font-medium text-slate-500">Part:</span>{' '}
                                    <span className="font-medium">{item.partLabel}</span>
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-700">
                                    <span className="font-medium text-slate-500">Vendor:</span>{' '}
                                    <span className="font-medium">{getVendorNameFromSourceData(item.data ?? {}, item.url)}</span>
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-700">
                                    <span className="font-medium text-slate-500">URL:</span>{' '}
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-sky-700 hover:text-sky-900 hover:underline"
                                      title={item.url}
                                    >
                                      {compactSourceUrlLabel(item.url)}
                                    </a>
                                  </p>
                                  {bucketSourceUrlsInSession.has(item.sourceKey) && (
                                    <p className="mt-0.5 text-[10px] font-medium text-emerald-700">
                                      In Bucket
                                    </p>
                                  )}
                                </td>
                                {visibleFieldKeys.map((key) => (
                                  <td
                                    key={`${item.sourceKey}-${key}`}
                                    className="border-l border-slate-100 px-3 py-2 text-xs text-slate-800 align-top"
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
                    {scrapedTableRows.length > 0 && (
                      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/95 px-4 py-3">
                        <p className="text-[11px] text-slate-500">
                          {bucketSourceUrlsInSession.size > 0
                            ? `${bucketSourceUrlsInSession.size} source${
                                bucketSourceUrlsInSession.size === 1 ? '' : 's'
                              } already in Bucket from this view`
                            : 'No sources from this view in Bucket yet'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            const selectedKeys = [...selectedBucketSourceUrls].filter(Boolean)
                            if (selectedKeys.length === 0) {
                              showBucketToast('Select at least one source')
                              return
                            }
                            const selectedRows = scrapedTableRows.filter((row) => selectedKeys.includes(row.sourceKey))
                            if (selectedRows.length === 0) return
                            let added = 0
                            const newlyAdded: string[] = []
                            for (const row of selectedRows) {
                              const parsedPart = parseFileItemId(row.partId)
                              if (!parsedPart) continue
                              const data = (row.data ?? {}) as Record<string, unknown>
                              const id = `file-${parsedPart.fileId}-${parsedPart.rowIdx}-s-${row.url}-${row.sourceKey}`
                              const title =
                                getFirstPartNumber(data) ??
                                row.partLabel
                              const domain = extractDomain(row.url)
                              const priceSpecs = collectScalarSpecs(data).filter((s) =>
                                /price|cost|amount|msrp|usd|\$/i.test(s.label)
                              )
                              const price = priceSpecs.length ? priceSpecs[0]!.value : ''
                              const result = addBucketItem({
                                id,
                                title: String(title),
                                manufacturer: domain || '',
                                price: String(price),
                                rowIndex: parsedPart.rowIdx,
                                tabId: undefined,
                              })
                              if (result.added) {
                                added += 1
                                newlyAdded.push(row.sourceKey)
                              }
                            }
                            if (newlyAdded.length > 0) {
                              setBucketSourceUrlsInSession((prev) => {
                                const next = new Set(prev)
                                for (const u of newlyAdded) next.add(u)
                                return next
                              })
                            }
                            if (added > 0) {
                              showBucketToast(
                                `${added} source${added === 1 ? '' : 's'} added to Bucket`
                              )
                            } else {
                              showBucketToast('Selected sources are already in Bucket')
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
                        >
                          Add selected sources to Bucket
                        </button>
                      </div>
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
