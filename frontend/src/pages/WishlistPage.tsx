import {
  CheckCircle2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUp,
  Columns3,
  Equal,
  FileText,
  GitBranch,
  Kanban,
  Layers,
  LayoutGrid,
  ListFilter,
  Loader2,
  Plus,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getToken } from '@/lib/auth'
import {
  getWorkspaceFileContent,
  listResearchUrls,
  listWorkspaceItems,
  type ResearchUrlItem,
  type ScrapedDataItem,
} from '@/lib/api'
import { collectPricesFromScrapedData } from '@/components/compare/CompareVendorOverview'

type PickerFile = { id: number; name: string; pathLabel: string }

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

function normalizeHeaderRow(row0: string[]): string[] {
  return row0.map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`))
}

/** Map saved column labels to indices; skips duplicates by consuming the first unused match. */
function columnIndicesForSelectedFields(row0: string[], selectedFields: string[]): number[] {
  const headers = normalizeHeaderRow(row0)
  const used = new Set<number>()
  const out: number[] = []
  for (const field of selectedFields) {
    let idx = -1
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue
      if (headers[i] === field) {
        idx = i
        break
      }
    }
    if (idx >= 0) {
      used.add(idx)
      out.push(idx)
    }
  }
  return out
}

function formatScrapedScalar(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function flattenScrapedRecord(data: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(data)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenScrapedRecord(v as Record<string, unknown>, key))
    } else if (Array.isArray(v)) {
      out[key] = v.map((x) => formatScrapedScalar(x)).join(', ')
    } else {
      out[key] = formatScrapedScalar(v)
    }
  }
  return out
}

/**
 * Field names (normalized) where we collect values from *every* scraped source and join them,
 * so one part row can show all vendors / prices instead of only the first source.
 */
const AGGREGATE_ACROSS_SCRAPED_SOURCES = new Set(
  [
    'vendor_name',
    'price',
    'location',
    'delivery',
    'contact',
    'product_details.your_price',
    'product_details.price',
  ].map((k) => k.toLowerCase())
)

function joinDistinctVendorValues(values: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out.join(' · ')
}

function mergeScrapedSources(items: ScrapedDataItem[] | null | undefined): Record<string, string> {
  const merged: Record<string, string> = {}
  if (!items?.length) return merged

  const perKeyLists = new Map<string, string[]>()
  const firstWin = new Map<string, string>()

  for (const item of items) {
    const data = item.data
    if (!data || typeof data !== 'object') continue
    const flat = flattenScrapedRecord(data as Record<string, unknown>)
    for (const [k, v] of Object.entries(flat)) {
      const s = String(v ?? '').trim()
      if (!s) continue
      if (AGGREGATE_ACROSS_SCRAPED_SOURCES.has(normalizeScrapedFieldKey(k))) {
        const list = perKeyLists.get(k) ?? []
        list.push(s)
        perKeyLists.set(k, list)
      } else if (!firstWin.has(k)) {
        firstWin.set(k, s)
      }
    }
  }

  for (const [k, v] of firstWin) merged[k] = v
  for (const [k, list] of perKeyLists) merged[k] = joinDistinctVendorValues(list)

  const urls = items
    .map((i) => (typeof i.url === 'string' ? i.url.trim() : ''))
    .filter(Boolean)
  if (urls.length > 0) {
    merged.source_urls = joinDistinctVendorValues(urls)
  }

  return merged
}

const SCRAPED_COLUMN_PREFIX = 'Scraped · '

/** Shown by default; long-tail nested keys (e.g. product_details.*) are opt-in via Fields. */
const COMMON_SCRAPED_FIELD_KEYS = new Set(
  [
    'contact',
    'delivery',
    'location',
    'price',
    'product_description',
    'product_image',
    'vendor_name',
    /** One cell listing every research source URL when multiple vendors were scraped */
    'source_urls',
  ].map((k) => k.toLowerCase())
)

function normalizeScrapedFieldKey(key: string): string {
  return key.trim().toLowerCase()
}

function isCommonScrapedFieldKey(flatKey: string): boolean {
  return COMMON_SCRAPED_FIELD_KEYS.has(normalizeScrapedFieldKey(flatKey))
}

function scrapedKeyFromHeader(header: string): string | null {
  if (!header.startsWith(SCRAPED_COLUMN_PREFIX)) return null
  return header.slice(SCRAPED_COLUMN_PREFIX.length)
}

function humanizeScrapedFieldKey(key: string): string {
  const t = key.trim()
  if (!t) return key
  return t
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
}

/** Split aggregated vendor-style text into lines for clearer reading in All columns. */
function scrapedCellSegments(text: string): string[] {
  const raw = text.trim()
  if (!raw) return []
  if (raw.includes('·')) {
    const parts = raw.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean)
    if (parts.length > 1) return parts
  }
  return [raw]
}

function isCommonScrapedColumnHeader(header: string): boolean {
  const k = scrapedKeyFromHeader(header)
  return k != null && isCommonScrapedFieldKey(k)
}

function defaultVisibleIndicesForSection(section: WishlistFileSection): Set<number> {
  const vis = new Set<number>()
  for (let i = 0; i < section.headers.length; i++) {
    if (i < section.csvColumnCount) vis.add(i)
    else if (isCommonScrapedColumnHeader(section.headers[i] ?? '')) vis.add(i)
  }
  if (vis.size === 0 && section.headers.length > 0) vis.add(0)
  return vis
}

function appendScrapedColumns(
  baseHeaders: string[],
  dataRows: string[][],
  researchList: ResearchUrlItem[]
): { headers: string[]; rows: string[][]; csvColumnCount: number } {
  const csvColumnCount = baseHeaders.length
  const byTri = new Map<number, ResearchUrlItem>()
  for (const r of researchList) {
    const tri = r.table_row_index
    if (tri == null || typeof tri !== 'number' || !Number.isFinite(tri)) continue
    const t = Math.trunc(tri)
    byTri.set(t, r)
  }
  const keySet = new Set<string>()
  const perRow: Record<string, string>[] = []
  for (let ri = 0; ri < dataRows.length; ri++) {
    const doc = byTri.get(ri)
    const merged = mergeScrapedSources(doc?.scraped_data)
    perRow.push(merged)
    for (const k of Object.keys(merged)) keySet.add(k)
  }
  const allKeys = [...keySet]
  const commonKeys = allKeys.filter((k) => isCommonScrapedFieldKey(k)).sort((a, b) => a.localeCompare(b))
  const extraKeys = allKeys.filter((k) => !isCommonScrapedFieldKey(k)).sort((a, b) => a.localeCompare(b))
  const scrapedKeys = [...commonKeys, ...extraKeys]
  if (scrapedKeys.length === 0) {
    return { headers: baseHeaders, rows: dataRows, csvColumnCount }
  }
  const extraHeads = scrapedKeys.map((k) => `${SCRAPED_COLUMN_PREFIX}${k}`)
  const headers = [...baseHeaders, ...extraHeads]
  const rows = dataRows.map((row, ri) => {
    const m = perRow[ri] ?? {}
    const tail = scrapedKeys.map((k) => m[k] ?? '')
    return [...row, ...tail]
  })
  return { headers, rows, csvColumnCount }
}

type WishlistSectionPrefs = {
  visibleColIndices: Set<number>
  /** Case-insensitive substring across any column */
  search: string
  /** Optional: this column must contain filterText */
  filterColumnIndex: number | null
  filterText: string
}

function defaultSectionPrefsForSection(section: WishlistFileSection): WishlistSectionPrefs {
  return {
    visibleColIndices: defaultVisibleIndicesForSection(section),
    search: '',
    filterColumnIndex: null,
    filterText: '',
  }
}

function rowMatchesFilters(row: string[], prefs: WishlistSectionPrefs): boolean {
  const q = prefs.search.trim().toLowerCase()
  if (q) {
    const hit = row.some((cell) => (cell ?? '').toLowerCase().includes(q))
    if (!hit) return false
  }
  if (prefs.filterColumnIndex != null && prefs.filterText.trim()) {
    const idx = prefs.filterColumnIndex
    const t = prefs.filterText.trim().toLowerCase()
    const cell = idx >= 0 && idx < row.length ? row[idx] ?? '' : ''
    if (!cell.toLowerCase().includes(t)) return false
  }
  return true
}

function sectionPrefsKey(tabId: string, fileId: number): string {
  return `wishlist-${tabId}-${fileId}`
}

/** Saved wishlist groups per sheet section (persisted in localStorage). */
type WishlistGroupKind = 'selection' | 'category' | 'filter'

type WishlistGroupDef = {
  id: string
  name: string
  kind: WishlistGroupKind
  /** selection: fixed row indices in section.rows */
  rowIndices?: number[]
  /** category: dynamic match on column value */
  categoryColumnIndex?: number
  categoryValue?: string
  /** filter: saved search + column filter */
  filterSearch?: string
  filterColumnIndex?: number | null
  filterText?: string
}

const WISHLIST_GROUPS_STORAGE_KEY = 'ir-wishlist-groups-v1'

function wishlistRowMatchesGroup(
  row: string[],
  dataRowIndex: number,
  group: WishlistGroupDef,
  prefs: WishlistSectionPrefs,
): boolean {
  switch (group.kind) {
    case 'selection':
      return group.rowIndices?.includes(dataRowIndex) ?? false
    case 'category': {
      const ci = group.categoryColumnIndex ?? -1
      if (ci < 0 || ci >= row.length) return false
      const want = group.categoryValue ?? ''
      return (row[ci] ?? '').trim() === want
    }
    case 'filter': {
      const merged: WishlistSectionPrefs = {
        ...prefs,
        search: group.filterSearch ?? '',
        filterColumnIndex: group.filterColumnIndex ?? null,
        filterText: group.filterText ?? '',
      }
      return rowMatchesFilters(row, merged)
    }
    default:
      return true
  }
}

function wishlistRowIncluded(
  row: string[],
  dataRowIndex: number,
  prefs: WishlistSectionPrefs,
  activeGroup: WishlistGroupDef | null,
): boolean {
  if (!activeGroup) return rowMatchesFilters(row, prefs)
  if (activeGroup.kind === 'filter') {
    return wishlistRowMatchesGroup(row, dataRowIndex, activeGroup, prefs)
  }
  return (
    rowMatchesFilters(row, prefs) &&
    wishlistRowMatchesGroup(row, dataRowIndex, activeGroup, prefs)
  )
}

function parseWishlistGroupsStorage(raw: string | null): Record<string, WishlistGroupDef[]> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, WishlistGroupDef[]>
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function generateWishlistGroupsFromColumn(
  section: WishlistFileSection,
  colIdx: number,
): WishlistGroupDef[] {
  const map = new Map<string, number[]>()
  section.rows.forEach((row, idx) => {
    const raw = (row[colIdx] ?? '').trim()
    const label = raw || '(empty)'
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(idx)
  })
  const header = section.headers[colIdx] ?? `Column ${colIdx + 1}`
  return [...map.entries()].map(([value, indices]) => ({
    id: crypto.randomUUID(),
    name: `${header}: ${value}`,
    kind: 'selection' as const,
    rowIndices: indices,
  }))
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n)
}

/** Only allow http(s) links for scraped source URLs (open in new tab). */
function safeHttpUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(t.startsWith('http://') || t.startsWith('https://') ? t : `https://${t}`)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
  } catch {
    /* ignore */
  }
  return null
}

function makeMatrixVendorDetailKey(sk: string, dataRowIndex: number, vendorId: string): string {
  return `${sk}\u0001${dataRowIndex}\u0001${vendorId}`
}

function makeClassicScrapedDetailKey(sk: string, dataRowIndex: number, colIndex: number): string {
  return `${sk}\u0001row${dataRowIndex}\u0001col${colIndex}`
}

function makeMatrixExpandRowKey(sk: string, dataRowIndex: number): string {
  return `${sk}\u0001expand\u0001${dataRowIndex}`
}

function priceForScrapedItem(item: ScrapedDataItem): number | null {
  const nums = collectPricesFromScrapedData(item.data as Record<string, unknown>)
  if (nums.length === 0) return null
  return Math.min(...nums)
}

function vendorKeyLabelFromItem(item: ScrapedDataItem): { key: string; label: string } {
  const flat = flattenScrapedRecord(item.data as Record<string, unknown>)
  const name = (flat.vendor_name ?? '').trim()
  if (name) return { key: `n:${normalizeScrapedFieldKey(name)}`, label: name }
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, '')
    return { key: `h:${host.toLowerCase()}`, label: host }
  } catch {
    return { key: `u:${item.url}`, label: item.url.slice(0, 48) || 'Source' }
  }
}

function vendorCodeFromLabel(label: string): string {
  const alnum = label.replace(/[^a-zA-Z0-9]/g, '')
  if (alnum.length >= 3) return alnum.slice(0, 3).toUpperCase()
  return label.slice(0, 3).toUpperCase().padEnd(3, '·')
}

function allocateVendorCodes(vendors: Array<{ key: string; label: string }>): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const v of vendors) {
    let base = vendorCodeFromLabel(v.label)
    let code = base
    let n = 2
    while (used.has(code)) {
      code = `${base.slice(0, 2)}${n}`
      n += 1
    }
    used.add(code)
    out.set(v.key, code)
  }
  return out
}

function mfrColumnIndex(headers: string[], csvColumnCount: number): number | null {
  for (let i = 0; i < csvColumnCount; i++) {
    const h = (headers[i] ?? '').toLowerCase()
    if (/\bmfr\b|manufacturer|brand|make/.test(h)) return i
  }
  return csvColumnCount >= 3 ? 2 : null
}

type VendorMatrixColumn = {
  id: string
  code: string
  fullLabel: string
}

/** Scraped row backing a matrix cell (best price for that vendor on this part row). */
type VendorMatrixCellDetail = {
  url: string
  data: Record<string, unknown>
}

type VendorMatrixRow = {
  dataRowIndex: number
  line1: string
  line2: string
  mfr: string
  coverageHave: number
  coverageTotal: number
  best: number | null
  worst: number | null
  spread: number | null
  savingsPct: number | null
  priceByVendorId: Record<string, number | null>
  detailByVendorId: Record<string, VendorMatrixCellDetail | null>
  bestVendorId: string | null
  worstVendorId: string | null
}

type VendorMatrixModel = {
  vendorColumns: VendorMatrixColumn[]
  rows: VendorMatrixRow[]
}

function buildVendorMatrix(section: WishlistFileSection): VendorMatrixModel | null {
  if (!section.researchList?.length || section.csvColumnCount === 0) return null
  const byTri = new Map<number, ResearchUrlItem>()
  for (const r of section.researchList) {
    const tri = r.table_row_index
    if (tri == null || typeof tri !== 'number' || !Number.isFinite(tri)) continue
    byTri.set(Math.trunc(tri), r)
  }

  const vendorKeySet = new Map<string, string>()

  for (let ri = 0; ri < section.rows.length; ri++) {
    const doc = byTri.get(ri)
    const items = doc?.scraped_data
    if (!items?.length) continue
    for (const item of items) {
      const { key, label } = vendorKeyLabelFromItem(item)
      if (!vendorKeySet.has(key)) vendorKeySet.set(key, label)
    }
  }

  if (vendorKeySet.size === 0) return null

  const rowMaps: Array<Record<string, number | null>> = []
  const rowDetailMaps: Array<Record<string, VendorMatrixCellDetail | null>> = []
  for (let ri = 0; ri < section.rows.length; ri++) {
    const perVendor: Record<string, number | null> = {}
    const perDetail: Record<string, VendorMatrixCellDetail | null> = {}
    const doc = byTri.get(ri)
    const items = doc?.scraped_data
    if (items?.length) {
      for (const item of items) {
        const { key } = vendorKeyLabelFromItem(item)
        const p = priceForScrapedItem(item)
        if (p == null) continue
        const prev = perVendor[key]
        if (prev == null || p < prev) {
          perVendor[key] = p
          perDetail[key] = {
            url: item.url,
            data: item.data && typeof item.data === 'object' ? (item.data as Record<string, unknown>) : {},
          }
        }
      }
    }
    rowMaps.push(perVendor)
    rowDetailMaps.push(perDetail)
  }

  const vendorEntries = [...vendorKeySet.entries()].map(([id, label]) => ({ key: id, label }))
  vendorEntries.sort((a, b) => a.label.localeCompare(b.label))
  const codeByKey = allocateVendorCodes(vendorEntries)
  const vendorColumns: VendorMatrixColumn[] = vendorEntries.map(({ key, label }) => ({
    id: key,
    code: codeByKey.get(key) ?? '···',
    fullLabel: label,
  }))

  if (vendorColumns.length === 0) return null

  const mfrIdx = mfrColumnIndex(section.headers, section.csvColumnCount)
  const rows: VendorMatrixRow[] = section.rows.map((row, ri) => {
    const line1 = row[0] ?? ''
    const line2 = section.csvColumnCount > 1 ? row[1] ?? '' : ''
    const mfr = mfrIdx != null ? row[mfrIdx] ?? '' : ''

    const priceByVendorId: Record<string, number | null> = {}
    const detailByVendorId: Record<string, VendorMatrixCellDetail | null> = {}
    for (const col of vendorColumns) {
      priceByVendorId[col.id] = rowMaps[ri]?.[col.id] ?? null
      detailByVendorId[col.id] = rowDetailMaps[ri]?.[col.id] ?? null
    }

    const prices = vendorColumns
      .map((c) => priceByVendorId[c.id])
      .filter((p): p is number => p != null && Number.isFinite(p))
    let best: number | null = null
    let worst: number | null = null
    let bestVendorId: string | null = null
    let worstVendorId: string | null = null
    if (prices.length) {
      best = Math.min(...prices)
      worst = Math.max(...prices)
      for (const col of vendorColumns) {
        const p = priceByVendorId[col.id]
        if (p === best) bestVendorId = col.id
        if (p === worst) worstVendorId = col.id
      }
    }
    const spread = best != null && worst != null ? worst - best : null
    const savingsPct =
      best != null && worst != null && worst > 0 ? ((worst - best) / worst) * 100 : null

    const coverageHave = vendorColumns.filter((c) => priceByVendorId[c.id] != null).length
    const coverageTotal = vendorColumns.length

    return {
      dataRowIndex: ri,
      line1,
      line2,
      mfr,
      coverageHave,
      coverageTotal,
      best,
      worst,
      spread,
      savingsPct,
      priceByVendorId,
      detailByVendorId,
      bestVendorId,
      worstVendorId,
    }
  })

  return { vendorColumns, rows }
}

function matrixRowMatchesSearch(row: VendorMatrixRow, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  const blob = [
    row.line1,
    row.line2,
    row.mfr,
    ...Object.values(row.priceByVendorId).map((p) => (p != null ? fmtUsd(p) : '')),
  ]
    .join(' ')
    .toLowerCase()
  return blob.includes(s)
}

type WishBoardColumnId = 'todo' | 'in_progress' | 'in_qa' | 'done'

const WISH_BOARD_COLUMNS: { id: WishBoardColumnId; title: string }[] = [
  { id: 'todo', title: 'To do' },
  { id: 'in_progress', title: 'In progress' },
  { id: 'in_qa', title: 'In QA' },
  { id: 'done', title: 'Done' },
]

const BOARD_SWATCHES = ['bg-emerald-500', 'bg-amber-500', 'bg-sky-600'] as const

function boardProjectSwatch(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997
  return BOARD_SWATCHES[h % BOARD_SWATCHES.length]!
}

function matrixRowToBoardColumn(row: VendorMatrixRow): WishBoardColumnId {
  if (row.coverageTotal <= 0) return 'todo'
  if (row.coverageHave === 0) return 'todo'
  if (row.coverageHave < row.coverageTotal) return 'in_progress'
  if (row.spread != null && row.spread > 0.01) return 'in_qa'
  return 'done'
}

function classicRowToBoardColumn(section: WishlistFileSection, row: string[]): WishBoardColumnId {
  const pick = (key: string) => {
    const k = key.toLowerCase()
    const idx = section.headers.findIndex((h) => scrapedKeyFromHeader(h)?.toLowerCase() === k)
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }
  const price = pick('price')
  const vendor = pick('vendor_name')
  const urls = pick('source_urls')
  if (!price && !vendor) return 'todo'
  if (!price || !vendor) return 'in_progress'
  if (urls.includes('·')) return 'in_qa'
  return 'done'
}

function boardCardTitleFromClassic(section: WishlistFileSection, row: string[]): string {
  if (section.csvColumnCount > 0) {
    const a = (row[0] ?? '').trim()
    const b = section.csvColumnCount > 1 ? (row[1] ?? '').trim() : ''
    if (a && b) return `${a} · ${b}`
    if (a) return a
  }
  const parts = row.slice(0, 2).map((c) => (c ?? '').trim()).filter(Boolean)
  return parts.join(' · ') || 'Row'
}

function boardCardSubtitleClassic(section: WishlistFileSection, row: string[]): string {
  const pick = (key: string) => {
    const k = key.toLowerCase()
    const idx = section.headers.findIndex((h) => scrapedKeyFromHeader(h)?.toLowerCase() === k)
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }
  const price = pick('price')
  const vendor = pick('vendor_name')
  return [vendor, price].filter(Boolean).join(' · ') || '—'
}

function boardPriorityGlyph(col: WishBoardColumnId) {
  const common = 'h-3.5 w-3.5 shrink-0'
  switch (col) {
    case 'todo':
      return <ChevronsUp className={`${common} text-orange-600`} aria-hidden />
    case 'in_progress':
      return <ChevronUp className={`${common} text-amber-600`} aria-hidden />
    case 'in_qa':
      return <Equal className={`${common} text-yellow-600`} aria-hidden />
    case 'done':
      return <CheckCircle2 className={`${common} text-emerald-600`} aria-hidden />
    default: {
      const _exhaustive: never = col
      return _exhaustive
    }
  }
}

type WishlistBoardCard = {
  dataRowIndex: number
  title: string
  subtitle: string
  column: WishBoardColumnId
  coverageLabel: string
  points: number
}

async function collectWorkspaceFiles(
  token: string,
  parentId: number | null,
  pathPrefix: string
): Promise<PickerFile[]> {
  const items = await listWorkspaceItems(parentId, token)
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name))
  const out: PickerFile[] = []
  for (const item of sorted) {
    if (item.is_folder) {
      const seg = item.name
      const next = pathPrefix ? `${pathPrefix} / ${seg}` : seg
      out.push(...(await collectWorkspaceFiles(token, item.id, next)))
    } else {
      out.push({
        id: item.id,
        name: item.name,
        pathLabel: pathPrefix || 'Workspace',
      })
    }
  }
  return out
}

type WishlistTab = {
  id: string
  name: string
  files: { id: number; name: string; selectedFields: string[] }[]
}

type WishlistFileSection = {
  fileId: number
  name: string
  headers: string[]
  rows: string[][]
  /** Width of the sheet columns (rest are scraped fields). */
  csvColumnCount: number
  /** Raw research rows for vendor matrix view */
  researchList: ResearchUrlItem[]
}

type PickerStep = 'files' | 'fields'

export function WishlistPage() {
  const [tabs, setTabs] = useState<WishlistTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerStep, setPickerStep] = useState<PickerStep>('files')
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const [pickerFiles, setPickerFiles] = useState<PickerFile[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [fieldsError, setFieldsError] = useState<string | null>(null)
  /** file id → header cells from first row */
  const [fileHeadersById, setFileHeadersById] = useState<Map<number, string[]>>(new Map())
  /** file id → selected column indices */
  const [selectedFieldIndicesById, setSelectedFieldIndicesById] = useState<Map<number, Set<number>>>(
    () => new Map()
  )
  const fetchGenRef = useRef(0)
  const [loadedTabData, setLoadedTabData] = useState<{ key: string; sections: WishlistFileSection[] } | null>(null)
  const [tabLoadError, setTabLoadError] = useState<string | null>(null)
  const [sectionPrefs, setSectionPrefs] = useState<Record<string, WishlistSectionPrefs>>({})
  const [openFieldsKey, setOpenFieldsKey] = useState<string | null>(null)
  const [tableViewBySection, setTableViewBySection] = useState<Record<string, 'matrix' | 'classic' | 'board'>>({})
  const [boardDetail, setBoardDetail] = useState<{ sk: string; dataRowIndex: number } | null>(null)
  const [matrixRowSelection, setMatrixRowSelection] = useState<Record<string, Set<number>>>({})
  const [classicRowSelection, setClassicRowSelection] = useState<Record<string, Set<number>>>({})
  const [wishlistGroupsBySection, setWishlistGroupsBySection] = useState<Record<string, WishlistGroupDef[]>>({})
  const [activeWishlistGroupBySection, setActiveWishlistGroupBySection] = useState<Record<string, string>>({})
  const [wishlistSplitDraft, setWishlistSplitDraft] = useState<{ sk: string; colIdx: number } | null>(null)
  const [matrixVendorDetailKey, setMatrixVendorDetailKey] = useState<string | null>(null)
  const [classicScrapedDetailKey, setClassicScrapedDetailKey] = useState<string | null>(null)
  /** Full-width expanded row in vendor matrix: all vendors for one part in a card grid */
  const [matrixExpandedRowKey, setMatrixExpandedRowKey] = useState<string | null>(null)

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId])

  const dataLoadKey = useMemo(() => {
    if (!activeTab) return ''
    return `${activeTab.id}:${activeTab.files.map((f) => `${f.id}:${f.selectedFields.join('\u001f')}`).join('|')}`
  }, [activeTab])

  const resetPickerFieldsState = useCallback(() => {
    setPickerStep('files')
    setFieldsLoading(false)
    setFieldsError(null)
    setFileHeadersById(new Map())
    setSelectedFieldIndicesById(new Map())
  }, [])

  const closePicker = useCallback(() => {
    fetchGenRef.current += 1
    setPickerOpen(false)
    setSelectedIds(new Set())
    resetPickerFieldsState()
  }, [resetPickerFieldsState])

  const openPicker = useCallback(() => {
    setSelectedIds(new Set())
    resetPickerFieldsState()
    setPickerOpen(true)
    setPickerError(null)
    const gen = ++fetchGenRef.current
    const token = getToken()
    if (!token) {
      setPickerFiles([])
      setPickerLoading(false)
      return
    }
    setPickerFiles([])
    setPickerLoading(true)
    void collectWorkspaceFiles(token, null, '')
      .then((files) => {
        if (gen !== fetchGenRef.current) return
        files.sort((a, b) => {
          const p = a.pathLabel.localeCompare(b.pathLabel)
          return p !== 0 ? p : a.name.localeCompare(b.name)
        })
        setPickerFiles(files)
      })
      .catch((e: unknown) => {
        if (gen !== fetchGenRef.current) return
        setPickerError(e instanceof Error ? e.message : 'Failed to load files')
        setPickerFiles([])
      })
      .finally(() => {
        if (gen === fetchGenRef.current) setPickerLoading(false)
      })
  }, [resetPickerFieldsState])

  const toggleFile = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(pickerFiles.map((f) => f.id)))
  }, [pickerFiles])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const goToFieldsStep = useCallback(async () => {
    if (selectedIds.size === 0) return
    const token = getToken()
    if (!token) return
    setFieldsError(null)
    setFieldsLoading(true)
    setPickerStep('fields')
    const ids = [...selectedIds]
    const headersMap = new Map<number, string[]>()
    const indicesMap = new Map<number, Set<number>>()
    try {
      await Promise.all(
        ids.map(async (fileId) => {
          const text = await getWorkspaceFileContent(fileId, token)
          const rows = parseCsv(text)
          const raw = rows[0] ?? []
          const headers = raw.map((h, i) => (h.trim() ? h.trim() : `Column ${i + 1}`))
          headersMap.set(fileId, headers)
          indicesMap.set(fileId, new Set(headers.map((_, i) => i)))
        })
      )
      setFileHeadersById(headersMap)
      setSelectedFieldIndicesById(indicesMap)
    } catch (e: unknown) {
      setFieldsError(e instanceof Error ? e.message : 'Failed to read file contents')
      setFileHeadersById(new Map())
      setSelectedFieldIndicesById(new Map())
      setPickerStep('files')
    } finally {
      setFieldsLoading(false)
    }
  }, [selectedIds])

  const backToFilesStep = useCallback(() => {
    setPickerStep('files')
    setFieldsError(null)
  }, [])

  const toggleFieldIndex = useCallback((fileId: number, colIndex: number) => {
    setSelectedFieldIndicesById((prev) => {
      const next = new Map(prev)
      const headers = fileHeadersById.get(fileId)
      if (!headers || colIndex < 0 || colIndex >= headers.length) return next
      const set = new Set(next.get(fileId) ?? [])
      if (set.has(colIndex)) set.delete(colIndex)
      else set.add(colIndex)
      next.set(fileId, set)
      return next
    })
  }, [fileHeadersById])

  const selectAllFieldsForFile = useCallback(
    (fileId: number) => {
      const headers = fileHeadersById.get(fileId)
      if (!headers?.length) return
      setSelectedFieldIndicesById((prev) => {
        const next = new Map(prev)
        next.set(fileId, new Set(headers.map((_, i) => i)))
        return next
      })
    },
    [fileHeadersById]
  )

  const clearFieldsForFile = useCallback((fileId: number) => {
    setSelectedFieldIndicesById((prev) => {
      const next = new Map(prev)
      next.set(fileId, new Set())
      return next
    })
  }, [])

  const selectAllFieldsAllFiles = useCallback(() => {
    setSelectedFieldIndicesById((prev) => {
      const next = new Map(prev)
      for (const fileId of fileHeadersById.keys()) {
        const headers = fileHeadersById.get(fileId)
        if (headers?.length) next.set(fileId, new Set(headers.map((_, i) => i)))
      }
      return next
    })
  }, [fileHeadersById])

  const clearAllFieldsAllFiles = useCallback(() => {
    setSelectedFieldIndicesById((prev) => {
      const next = new Map(prev)
      for (const fileId of prev.keys()) {
        next.set(fileId, new Set())
      }
      return next
    })
  }, [])

  const fieldsStepValid = useCallback(() => {
    for (const fileId of selectedIds) {
      const n = selectedFieldIndicesById.get(fileId)?.size ?? 0
      const headerCount = fileHeadersById.get(fileId)?.length ?? 0
      if (headerCount === 0) return false
      if (n === 0) return false
    }
    return selectedIds.size > 0
  }, [selectedIds, selectedFieldIndicesById, fileHeadersById])

  const confirmNewTab = useCallback(() => {
    if (!fieldsStepValid()) return
    const tabId = crypto.randomUUID()
    const files = pickerFiles
      .filter((f) => selectedIds.has(f.id))
      .map((f) => {
        const headers = fileHeadersById.get(f.id) ?? []
        const idxSet = selectedFieldIndicesById.get(f.id) ?? new Set<number>()
        const sorted = [...idxSet].sort((a, b) => a - b)
        const selectedFields = sorted.map((i) => headers[i] ?? `Column ${i + 1}`)
        return { id: f.id, name: f.name, selectedFields }
      })
    setTabs((prev) => [...prev, { id: tabId, name: `Tab ${prev.length + 1}`, files }])
    setActiveId(tabId)
    closePicker()
  }, [
    fieldsStepValid,
    pickerFiles,
    selectedIds,
    fileHeadersById,
    selectedFieldIndicesById,
    closePicker,
  ])

  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePicker()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen, closePicker])

  const token = getToken()

  useEffect(() => {
    if (!token) {
      setLoadedTabData(null)
      setTabLoadError(null)
      return
    }
    if (!activeTab) {
      setLoadedTabData(null)
      setTabLoadError(null)
      return
    }
    let cancelled = false
    setTabLoadError(null)
    void Promise.all(
      activeTab.files.map(async (f) => {
        const [text, researchList] = await Promise.all([
          getWorkspaceFileContent(f.id, token),
          listResearchUrls(token, { fileId: f.id }).catch(() => [] as ResearchUrlItem[]),
        ])
        const rows = parseCsv(text)
        const headerRow = rows[0] ?? []
        const indices = columnIndicesForSelectedFields(headerRow, f.selectedFields)
        const norm = normalizeHeaderRow(headerRow)
        const baseHeaders = indices.map((i) => norm[i] ?? `Column ${i + 1}`)
        const dataRows = rows.slice(1).map((row) => indices.map((i) => row[i] ?? ''))
        const merged = appendScrapedColumns(baseHeaders, dataRows, researchList)
        return {
          fileId: f.id,
          name: f.name,
          headers: merged.headers,
          rows: merged.rows,
          csvColumnCount: merged.csvColumnCount,
          researchList,
        } satisfies WishlistFileSection
      })
    )
      .then((sections) => {
        if (cancelled) return
        setLoadedTabData({ key: dataLoadKey, sections })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoadedTabData(null)
        setTabLoadError(e instanceof Error ? e.message : 'Failed to load data')
      })
    return () => {
      cancelled = true
    }
  }, [dataLoadKey, token, activeTab])

  useLayoutEffect(() => {
    setTabLoadError(null)
  }, [dataLoadKey])

  useEffect(() => {
    if (!loadedTabData || !activeId) return
    if (loadedTabData.key !== dataLoadKey) return
    const sections = loadedTabData.sections
    setSectionPrefs((prev) => {
      const next: Record<string, WishlistSectionPrefs> = { ...prev }
      for (const s of sections) {
        const sk = sectionPrefsKey(activeId, s.fileId)
        const n = s.headers.length
        const old = prev[sk]
        const indicesOk =
          old &&
          old.visibleColIndices.size > 0 &&
          [...old.visibleColIndices].every((i) => Number.isInteger(i) && i >= 0 && i < n)
        if (!indicesOk) {
          next[sk] = defaultSectionPrefsForSection(s)
        } else {
          next[sk] = {
            ...old,
            filterColumnIndex:
              old.filterColumnIndex != null && old.filterColumnIndex >= n ? null : old.filterColumnIndex,
            visibleColIndices: new Set(old.visibleColIndices),
          }
        }
      }
      return next
    })
  }, [loadedTabData?.key, activeId, dataLoadKey])

  useEffect(() => {
    if (!matrixVendorDetailKey && !classicScrapedDetailKey) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest?.('[data-matrix-vendor-detail]')) return
      if (el?.closest?.('[data-classic-scraped-detail]')) return
      setMatrixVendorDetailKey(null)
      setClassicScrapedDetailKey(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [matrixVendorDetailKey, classicScrapedDetailKey])

  useEffect(() => {
    if (!matrixVendorDetailKey && !classicScrapedDetailKey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMatrixVendorDetailKey(null)
        setClassicScrapedDetailKey(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [matrixVendorDetailKey, classicScrapedDetailKey])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WISHLIST_GROUPS_STORAGE_KEY)
      setWishlistGroupsBySection(parseWishlistGroupsStorage(raw))
    } catch {
      setWishlistGroupsBySection({})
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(WISHLIST_GROUPS_STORAGE_KEY, JSON.stringify(wishlistGroupsBySection))
    } catch {
      /* ignore quota */
    }
  }, [wishlistGroupsBySection])

  useEffect(() => {
    setOpenFieldsKey(null)
    setMatrixVendorDetailKey(null)
    setClassicScrapedDetailKey(null)
    setMatrixExpandedRowKey(null)
    setBoardDetail(null)
    setWishlistSplitDraft(null)
  }, [activeId])

  useEffect(() => {
    if (!boardDetail) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBoardDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [boardDetail])

  useEffect(() => {
    if (!loadedTabData || !activeId) return
    if (loadedTabData.key !== dataLoadKey) return
    setMatrixRowSelection({})
    setClassicRowSelection({})
    setMatrixVendorDetailKey(null)
    setClassicScrapedDetailKey(null)
    setMatrixExpandedRowKey(null)
    setTableViewBySection((prev) => {
      const next = { ...prev }
      for (const s of loadedTabData.sections) {
        const sk = sectionPrefsKey(activeId, s.fileId)
        const m = buildVendorMatrix(s)
        if (next[sk] === undefined) {
          next[sk] = m && m.vendorColumns.length > 0 ? 'matrix' : 'classic'
        }
      }
      return next
    })
  }, [loadedTabData, activeId, dataLoadKey])

  const tabDataReady = loadedTabData?.key === dataLoadKey
  const tabLoading = Boolean(token && activeTab && !tabLoadError && !tabDataReady)

  const selectedFilesOrdered = pickerFiles.filter((f) => selectedIds.has(f.id))
  const dialogTitleId = 'wishlist-picker-dialog-title'

  return (
    <div className="flex min-h-full w-full flex-col p-4">
      <div
        className="flex flex-wrap items-end gap-1 border-b border-gray-200"
        role="tablist"
        aria-label="Wishlist sheets"
      >
        {tabs.map((tab) => {
          const selected = tab.id === activeId
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`wishlist-tab-${tab.id}`}
              onClick={() => setActiveId(tab.id)}
              className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 ${
                selected
                  ? 'border-b-2 border-blue-600 text-blue-600 -mb-px bg-white'
                  : 'border-b-2 border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={openPicker}
          className="mb-0.5 ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New tab
        </button>
      </div>

      <section
        role="tabpanel"
        aria-labelledby={activeId ? `wishlist-tab-${activeId}` : undefined}
        className="mt-6 w-full min-w-0 flex-1 pb-8"
      >
        {!token && (
          <p className="text-sm text-gray-600">Sign in to load and view workspace data in each tab.</p>
        )}
        {token && tabs.length === 0 && (
          <p className="text-sm text-gray-600">
            Use <span className="font-medium">New tab</span> to pick workspace files and columns. Your filtered data
            appears here.
          </p>
        )}
        {token && tabs.length > 0 && !activeTab && (
          <p className="text-sm text-gray-600">Select a tab above to view its data.</p>
        )}
        {tabLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-600" aria-live="polite">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" aria-hidden />
            Loading tab data…
          </div>
        )}
        {tabLoadError && (
          <p className="text-sm text-red-600" role="alert">
            {tabLoadError}
          </p>
        )}
        {tabDataReady && loadedTabData && activeId && (
          <div className="space-y-8">
            {loadedTabData.sections.map((section) => {
              const sk = sectionPrefsKey(activeId, section.fileId)
              const prefs = sectionPrefs[sk] ?? defaultSectionPrefsForSection(section)
              const wishlistGroups = wishlistGroupsBySection[sk] ?? []
              const activeWishlistGroupId = activeWishlistGroupBySection[sk] ?? ''
              const activeWishlistGroup =
                wishlistGroups.find((g) => g.id === activeWishlistGroupId) ?? null
              const viewableEntries = section.rows
                .map((row, dataRowIndex) => ({ row, dataRowIndex }))
                .filter(({ row, dataRowIndex }) =>
                  wishlistRowIncluded(row, dataRowIndex, prefs, activeWishlistGroup),
                )
              const filteredRows = viewableEntries.map(({ row }) => row)
              const visibleOrdered = [...prefs.visibleColIndices].sort((a, b) => a - b)
              const firstVisibleScrapedIdx = visibleOrdered.find((j) => j >= section.csvColumnCount)
              const hasActiveFilters =
                prefs.search.trim() !== '' ||
                (prefs.filterColumnIndex != null && prefs.filterText.trim() !== '')
              const inputCls =
                'mt-0.5 w-full min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

              const sheetFieldIndices = section.headers.map((_, i) => i).filter((i) => i < section.csvColumnCount)
              const scrapedFieldIndices = section.headers.map((_, i) => i).filter((i) => i >= section.csvColumnCount)
              const commonScrapedIndices = scrapedFieldIndices.filter((i) =>
                isCommonScrapedColumnHeader(section.headers[i] ?? '')
              )
              const extraScrapedIndices = scrapedFieldIndices.filter(
                (i) => !isCommonScrapedColumnHeader(section.headers[i] ?? '')
              )

              const matrixModel = buildVendorMatrix(section)
              const defaultTableView: 'matrix' | 'classic' | 'board' =
                matrixModel && matrixModel.vendorColumns.length > 0 ? 'matrix' : 'classic'
              const storedTableView = tableViewBySection[sk]
              let tableViewMode: 'matrix' | 'classic' | 'board' = storedTableView ?? defaultTableView
              if (
                tableViewMode === 'matrix' &&
                (!matrixModel || matrixModel.vendorColumns.length === 0)
              ) {
                tableViewMode = 'classic'
              }
              const showMatrix = Boolean(
                matrixModel && matrixModel.vendorColumns.length > 0 && tableViewMode === 'matrix'
              )
              const showBoard = tableViewMode === 'board'
              const matrixRowsFiltered = matrixModel
                ? matrixModel.rows.filter((r) => {
                    const row = section.rows[r.dataRowIndex]
                    if (!row) return false
                    if (!matrixRowMatchesSearch(r, prefs.search)) return false
                    return wishlistRowIncluded(row, r.dataRowIndex, prefs, activeWishlistGroup)
                  })
                : []
              const matrixSel = matrixRowSelection[sk] ?? new Set<number>()
              const classicSel = classicRowSelection[sk] ?? new Set<number>()
              const visibleClassicIndices = viewableEntries.map((e) => e.dataRowIndex)
              const allClassicVisibleSelected =
                visibleClassicIndices.length > 0 &&
                visibleClassicIndices.every((i) => classicSel.has(i))
              const allMatrixFilteredSelected =
                matrixRowsFiltered.length > 0 &&
                matrixRowsFiltered.every((r) => matrixSel.has(r.dataRowIndex))

              const renderFieldCheckbox = (hi: number, variant: 'sheet' | 'common' | 'extra') => {
                const h = section.headers[hi] ?? ''
                const checked = prefs.visibleColIndices.has(hi)
                const labelClass =
                  variant === 'sheet'
                    ? 'text-gray-800'
                    : variant === 'common'
                      ? 'text-emerald-900'
                      : 'text-gray-700'
                return (
                  <li key={hi}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={checked && prefs.visibleColIndices.size <= 1}
                        onChange={() => {
                          setSectionPrefs((prev) => {
                            const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                            const next = new Set(cur.visibleColIndices)
                            if (next.has(hi)) {
                              if (next.size <= 1) return prev
                              next.delete(hi)
                            } else {
                              next.add(hi)
                            }
                            return { ...prev, [sk]: { ...cur, visibleColIndices: next } }
                          })
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500/40"
                      />
                      <span className={`min-w-0 flex-1 text-xs leading-snug ${labelClass}`}>
                        {h}
                        {variant === 'extra' && (
                          <span className="mt-0.5 block text-[10px] font-normal text-gray-500">
                            Optional — off by default
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                )
              }

              return (
                <div key={section.fileId}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                    <h3 className="text-sm font-semibold text-gray-900">{section.name}</h3>
                    <span className="text-xs text-gray-500">
                      {showBoard
                        ? matrixModel && matrixModel.vendorColumns.length > 0
                          ? matrixRowsFiltered.length === section.rows.length
                            ? `${section.rows.length} part${section.rows.length === 1 ? '' : 's'}`
                            : `${matrixRowsFiltered.length} of ${section.rows.length} parts`
                          : filteredRows.length === section.rows.length
                            ? `${section.rows.length} row${section.rows.length === 1 ? '' : 's'}`
                            : `${filteredRows.length} of ${section.rows.length} rows`
                        : showMatrix
                          ? matrixRowsFiltered.length === section.rows.length
                            ? `${section.rows.length} part${section.rows.length === 1 ? '' : 's'}`
                            : `${matrixRowsFiltered.length} of ${section.rows.length} parts`
                          : filteredRows.length === section.rows.length
                            ? `${section.rows.length} row${section.rows.length === 1 ? '' : 's'}`
                            : `${filteredRows.length} of ${section.rows.length} rows`}
                    </span>
                  </div>

                  {section.headers.length === 0 ? (
                    <p className="text-sm text-amber-800">
                      No columns matched this file. The header row may have changed.
                    </p>
                  ) : section.rows.length === 0 ? (
                    <p className="text-sm text-gray-600">No data rows under the header row.</p>
                  ) : (
                    <>
                      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                        <label className="flex  max-w-md flex-1 flex-col">
                          <span className="flex items-center gap-1 text-xs font-medium text-gray-600">
                            <ListFilter className="h-3.5 w-3.5 text-gray-500" aria-hidden />
                            Search rows
                          </span>
                          <input
                            type="search"
                            value={prefs.search}
                            onChange={(e) => {
                              const v = e.target.value
                              setSectionPrefs((prev) => {
                                const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                                return { ...prev, [sk]: { ...cur, search: v } }
                              })
                            }}
                            placeholder="Match any column…"
                            className={inputCls}
                            autoComplete="off"
                          />
                        </label>
                        <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
                          {matrixModel && matrixModel.vendorColumns.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                setClassicScrapedDetailKey(null)
                                setMatrixExpandedRowKey(null)
                                setBoardDetail(null)
                                setTableViewBySection((prev) => ({ ...prev, [sk]: 'matrix' }))
                              }}
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                                showMatrix
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                              Vendor matrix
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setMatrixVendorDetailKey(null)
                              setMatrixExpandedRowKey(null)
                              setBoardDetail(null)
                              setTableViewBySection((prev) => ({ ...prev, [sk]: 'classic' }))
                            }}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                              tableViewMode === 'classic'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <Table2 className="h-3.5 w-3.5" aria-hidden />
                            All columns
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMatrixVendorDetailKey(null)
                              setMatrixExpandedRowKey(null)
                              setClassicScrapedDetailKey(null)
                              setTableViewBySection((prev) => ({ ...prev, [sk]: 'board' }))
                            }}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                              showBoard
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            <Kanban className="h-3.5 w-3.5" aria-hidden />
                            Board
                          </button>
                        </div>
                        {tableViewMode === 'classic' && (
                          <>
                            <label className="flex min-w-[9rem] flex-col">
                              <span className="text-xs font-medium text-gray-600">Filter column</span>
                              <select
                                value={prefs.filterColumnIndex ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setSectionPrefs((prev) => {
                                    const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                                    return {
                                      ...prev,
                                      [sk]: {
                                        ...cur,
                                        filterColumnIndex: v === '' ? null : Number(v),
                                        filterText: v === '' ? '' : cur.filterText,
                                      },
                                    }
                                  })
                                }}
                                className={inputCls}
                              >
                                <option value="">— Any —</option>
                                {section.headers.map((h, i) => (
                                  <option key={i} value={i}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label
                              className={`flex min-w-[8rem] flex-1 flex-col ${prefs.filterColumnIndex == null ? 'opacity-50' : ''}`}
                            >
                              <span className="text-xs font-medium text-gray-600">Contains</span>
                              <input
                                type="text"
                                value={prefs.filterText}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setSectionPrefs((prev) => {
                                    const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                                    return { ...prev, [sk]: { ...cur, filterText: v } }
                                  })
                                }}
                                disabled={prefs.filterColumnIndex == null}
                                placeholder="Text in that column…"
                                className={inputCls}
                                autoComplete="off"
                              />
                            </label>
                          </>
                        )}
                        {tableViewMode === 'classic' && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenFieldsKey((k) => (k === sk ? null : sk))}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                            aria-expanded={openFieldsKey === sk}
                            aria-controls={`wishlist-fields-${sk}`}
                          >
                            <Columns3 className="h-4 w-4 text-gray-500" aria-hidden />
                            Fields
                            <ChevronDown
                              className={`h-3.5 w-3.5 text-gray-500 transition-transform ${openFieldsKey === sk ? 'rotate-180' : ''}`}
                              aria-hidden
                            />
                          </button>
                          {openFieldsKey === sk && (
                            <>
                              <button
                                type="button"
                                className="fixed inset-0 z-40 cursor-default"
                                aria-label="Close field picker"
                                onClick={() => setOpenFieldsKey(null)}
                              />
                              <div
                                id={`wishlist-fields-${sk}`}
                                className="absolute right-0 z-50 mt-1 max-h-[min(70vh,28rem)] w-[min(100vw-2rem,22rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white py-2 shadow-lg"
                                role="listbox"
                                aria-label="Visible columns"
                              >
                                <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-gray-100 px-2 pb-2">
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-blue-600 hover:underline"
                                    onClick={() =>
                                      setSectionPrefs((prev) => {
                                        const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                                        return {
                                          ...prev,
                                          [sk]: {
                                            ...cur,
                                            visibleColIndices: new Set(section.headers.map((_, i) => i)),
                                          },
                                        }
                                      })
                                    }
                                  >
                                    All
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-emerald-700 hover:underline"
                                    onClick={() =>
                                      setSectionPrefs((prev) => {
                                        const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                                        return {
                                          ...prev,
                                          [sk]: {
                                            ...cur,
                                            visibleColIndices: defaultVisibleIndicesForSection(section),
                                          },
                                        }
                                      })
                                    }
                                  >
                                    Defaults
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-gray-600 hover:underline"
                                    onClick={() => {
                                      setSectionPrefs((prev) => {
                                        const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                                        return {
                                          ...prev,
                                          [sk]: { ...cur, visibleColIndices: new Set([0]) },
                                        }
                                      })
                                    }}
                                  >
                                    One only
                                  </button>
                                </div>
                                <ul className="px-1 pt-1">
                                  {sheetFieldIndices.length > 0 && (
                                    <>
                                      <li className="list-none px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                        Sheet columns
                                      </li>
                                      {sheetFieldIndices.map((hi) => renderFieldCheckbox(hi, 'sheet'))}
                                    </>
                                  )}
                                  {commonScrapedIndices.length > 0 && (
                                    <>
                                      <li className="list-none px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                        Common scraped
                                      </li>
                                      {commonScrapedIndices.map((hi) => renderFieldCheckbox(hi, 'common'))}
                                    </>
                                  )}
                                  {extraScrapedIndices.length > 0 && (
                                    <>
                                      <li className="list-none px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                                        Additional fields
                                      </li>
                                      <li className="list-none px-2 pb-1 text-[10px] leading-snug text-gray-500">
                                        Turn on to add columns to the table. Long product detail keys stay here.
                                      </li>
                                      {extraScrapedIndices.map((hi) => renderFieldCheckbox(hi, 'extra'))}
                                    </>
                                  )}
                                </ul>
                              </div>
                            </>
                          )}
                        </div>
                        )}
                        {(hasActiveFilters || activeWishlistGroupId) && (
                          <button
                            type="button"
                            onClick={() => {
                              setSectionPrefs((prev) => {
                                const cur = prev[sk] ?? defaultSectionPrefsForSection(section)
                                return {
                                  ...prev,
                                  [sk]: {
                                    ...cur,
                                    search: '',
                                    filterColumnIndex: null,
                                    filterText: '',
                                  },
                                }
                              })
                              setActiveWishlistGroupBySection((prev) => ({ ...prev, [sk]: '' }))
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200/60"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                            {activeWishlistGroupId ? 'Clear filters & group' : 'Clear filters'}
                          </button>
                        )}
                      </div>

                      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-violet-200/80 bg-violet-50/60 p-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="flex min-w-[12rem] flex-1 flex-col sm:max-w-xs">
                            <span className="flex items-center gap-1 text-xs font-medium text-violet-900">
                              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Wishlist groups
                            </span>
                            <select
                              value={activeWishlistGroupId}
                              onChange={(e) =>
                                setActiveWishlistGroupBySection((prev) => ({
                                  ...prev,
                                  [sk]: e.target.value,
                                }))
                              }
                              className={inputCls}
                              aria-label="Active wishlist group"
                            >
                              <option value="">All rows</option>
                              {wishlistGroups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                  {g.kind === 'selection'
                                    ? ' · hand-picked'
                                    : g.kind === 'category'
                                      ? ' · category'
                                      : ' · saved filters'}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const merged = new Set<number>()
                              for (const i of matrixSel) merged.add(i)
                              for (const i of classicSel) merged.add(i)
                              if (merged.size === 0) {
                                window.alert(
                                  'Select rows with the matrix or table checkboxes, then create a group.',
                                )
                                return
                              }
                              const name = window.prompt('Name for this group?')?.trim()
                              if (!name) return
                              const newG: WishlistGroupDef = {
                                id: crypto.randomUUID(),
                                name,
                                kind: 'selection',
                                rowIndices: [...merged],
                              }
                              setWishlistGroupsBySection((prev) => ({
                                ...prev,
                                [sk]: [...(prev[sk] ?? []), newG],
                              }))
                              setActiveWishlistGroupBySection((prev) => ({ ...prev, [sk]: newG.id }))
                            }}
                            className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-950 shadow-sm hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                          >
                            From selection
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const suggest =
                                [prefs.search, prefs.filterText].find((t) => t.trim())?.trim() ||
                                'Saved filters'
                              const name = window.prompt('Name for this filter group?', suggest)?.trim()
                              if (!name) return
                              const newG: WishlistGroupDef = {
                                id: crypto.randomUUID(),
                                name,
                                kind: 'filter',
                                filterSearch: prefs.search,
                                filterColumnIndex: prefs.filterColumnIndex,
                                filterText: prefs.filterText,
                              }
                              setWishlistGroupsBySection((prev) => ({
                                ...prev,
                                [sk]: [...(prev[sk] ?? []), newG],
                              }))
                              setActiveWishlistGroupBySection((prev) => ({ ...prev, [sk]: newG.id }))
                            }}
                            className="rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-medium text-violet-950 shadow-sm hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                          >
                            Save filters as group
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setWishlistSplitDraft((d) =>
                                d?.sk === sk ? null : { sk, colIdx: 0 },
                              )
                            }
                            className={`rounded-lg border px-3 py-2 text-xs font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 ${
                              wishlistSplitDraft?.sk === sk
                                ? 'border-violet-600 bg-violet-600 text-white'
                                : 'border-violet-300 bg-white text-violet-950 hover:bg-violet-50'
                            }`}
                          >
                            Split by column…
                          </button>
                          {activeWishlistGroupId ? (
                            <button
                              type="button"
                              onClick={() => {
                                setWishlistGroupsBySection((prev) => ({
                                  ...prev,
                                  [sk]: (prev[sk] ?? []).filter((g) => g.id !== activeWishlistGroupId),
                                }))
                                setActiveWishlistGroupBySection((prev) => ({ ...prev, [sk]: '' }))
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-800 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              Delete group
                            </button>
                          ) : null}
                        </div>
                        {wishlistSplitDraft?.sk === sk ? (
                          <div className="flex flex-wrap items-end gap-2 border-t border-violet-200/70 pt-2">
                            <label className="flex min-w-[10rem] flex-col">
                              <span className="text-xs font-medium text-violet-900">Column</span>
                              <select
                                value={wishlistSplitDraft.colIdx}
                                onChange={(e) =>
                                  setWishlistSplitDraft((d) =>
                                    d && d.sk === sk
                                      ? { ...d, colIdx: Number(e.target.value) }
                                      : d,
                                  )
                                }
                                className={inputCls}
                              >
                                {section.headers.map((h, i) => (
                                  <option key={i} value={i}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const colIdx = wishlistSplitDraft.colIdx
                                if (colIdx < 0 || colIdx >= section.headers.length) return
                                const generated = generateWishlistGroupsFromColumn(section, colIdx)
                                if (generated.length > 120) {
                                  if (
                                    !window.confirm(
                                      `Create ${generated.length} groups (one per distinct value). Continue?`,
                                    )
                                  ) {
                                    return
                                  }
                                }
                                setWishlistGroupsBySection((prev) => ({
                                  ...prev,
                                  [sk]: [...(prev[sk] ?? []), ...generated],
                                }))
                                setWishlistSplitDraft(null)
                              }}
                              className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                            >
                              Generate groups
                            </button>
                            <button
                              type="button"
                              onClick={() => setWishlistSplitDraft(null)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <p className="w-full text-[11px] leading-snug text-violet-800/90">
                              Creates one hand-picked group per distinct cell value in that column (saved locally in
                              this browser).
                            </p>
                          </div>
                        ) : null}
                      </div>

                      {showBoard ? (
                        (() => {
                          const byCol = new Map<WishBoardColumnId, WishlistBoardCard[]>()
                          for (const c of WISH_BOARD_COLUMNS) byCol.set(c.id, [])
                          if (matrixModel && matrixModel.vendorColumns.length > 0) {
                            for (const mr of matrixRowsFiltered) {
                              const col = matrixRowToBoardColumn(mr)
                              byCol.get(col)!.push({
                                dataRowIndex: mr.dataRowIndex,
                                title: mr.line1 || '—',
                                subtitle:
                                  [mr.mfr || '', mr.best != null ? fmtUsd(mr.best) : '']
                                    .filter(Boolean)
                                    .join(' · ') || '—',
                                column: col,
                                coverageLabel:
                                  mr.coverageTotal > 0
                                    ? `${mr.coverageHave}/${mr.coverageTotal}`
                                    : '—',
                                points: Math.min(13, Math.max(1, mr.coverageHave || 1)),
                              })
                            }
                          } else {
                            for (const { row, dataRowIndex } of viewableEntries) {
                              const col = classicRowToBoardColumn(section, row)
                              const urlsIdx = section.headers.findIndex(
                                (h) => scrapedKeyFromHeader(h)?.toLowerCase() === 'source_urls',
                              )
                              const urlsRaw =
                                urlsIdx >= 0 ? (row[urlsIdx] ?? '').trim() : ''
                              const n = urlsRaw
                                ? urlsRaw.split(/\s*·\s*/).filter(Boolean).length
                                : 0
                              byCol.get(col)!.push({
                                dataRowIndex,
                                title: boardCardTitleFromClassic(section, row),
                                subtitle: boardCardSubtitleClassic(section, row),
                                column: col,
                                coverageLabel: n > 0 ? String(n) : '0',
                                points: Math.min(13, Math.max(1, n || 1)),
                              })
                            }
                          }
                          const activeIdx =
                            boardDetail?.sk === sk ? boardDetail.dataRowIndex : null
                          const isEmptyBoard = WISH_BOARD_COLUMNS.every(
                            (c) => (byCol.get(c.id) ?? []).length === 0,
                          )
                          if (isEmptyBoard) {
                            return (
                              <p className="text-sm text-gray-600">
                                {matrixModel && matrixModel.vendorColumns.length > 0
                                  ? 'No parts match the search.'
                                  : 'No rows match the current filters.'}
                              </p>
                            )
                          }
                          return (
                            <div
                              className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]"
                              role="region"
                              aria-label="Wishlist board"
                            >
                              {WISH_BOARD_COLUMNS.map((colDef) => {
                                const items = byCol.get(colDef.id) ?? []
                                return (
                                  <div
                                    key={colDef.id}
                                    className="w-[min(100vw-2rem,280px)] shrink-0 sm:w-[280px]"
                                  >
                                    <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
                                      <h4 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-600">
                                        {colDef.title}
                                      </h4>
                                      <span className="text-xs font-semibold tabular-nums text-gray-400">
                                        ({items.length})
                                      </span>
                                    </div>
                                    <div className="max-h-[min(65vh,560px)] min-h-[120px] space-y-2.5 overflow-y-auto rounded-xl bg-[#f4f5f7] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                                      {items.length === 0 ? (
                                        <p className="px-2 py-6 text-center text-xs text-gray-400">
                                          No cards
                                        </p>
                                      ) : (
                                        items.map((item) => {
                                          const active = activeIdx === item.dataRowIndex
                                          return (
                                            <button
                                              key={item.dataRowIndex}
                                              type="button"
                                              onClick={() =>
                                                setBoardDetail({ sk, dataRowIndex: item.dataRowIndex })
                                              }
                                              className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition-[box-shadow,transform] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                                active
                                                  ? 'border-blue-300 ring-2 ring-blue-400/30'
                                                  : 'border-gray-200/90'
                                              }`}
                                            >
                                              <p className="line-clamp-3 text-sm font-medium leading-snug text-gray-900">
                                                {item.title}
                                              </p>
                                              <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                                                {item.subtitle}
                                              </p>
                                              <div className="mt-3 flex items-center justify-between gap-1 border-t border-gray-100 pt-2.5">
                                                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                                  <span
                                                    className={`h-2.5 w-2.5 shrink-0 rounded-sm ${boardProjectSwatch(item.title)}`}
                                                    aria-hidden
                                                  />
                                                  <span className="truncate font-mono text-[11px] font-semibold text-gray-600">
                                                    #{item.dataRowIndex + 1}
                                                  </span>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1 text-gray-500">
                                                  <span
                                                    className="inline-flex items-center gap-0.5"
                                                    title="Coverage / sources"
                                                  >
                                                    <GitBranch className="h-3.5 w-3.5 opacity-70" aria-hidden />
                                                    <span className="text-[11px] tabular-nums">
                                                      {item.coverageLabel}
                                                    </span>
                                                  </span>
                                                  <span
                                                    className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1 text-[10px] font-semibold text-gray-700"
                                                    title="Weight"
                                                  >
                                                    {item.points}
                                                  </span>
                                                  <span title={colDef.title}>
                                                    {boardPriorityGlyph(item.column)}
                                                  </span>
                                                </div>
                                              </div>
                                            </button>
                                          )
                                        })
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })()
                      ) : showMatrix && matrixModel ? (
                        matrixRowsFiltered.length === 0 ? (
                          <p className="text-sm text-gray-600">No parts match the search.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-sky-200 bg-sky-50/60 shadow-sm">
                            <table className="min-w-full border-collapse text-xs sm:text-sm">
                              <thead>
                                <tr className="border-b border-sky-200 bg-sky-100/90">
                                  <th className="sticky left-0 z-30 w-9 bg-sky-100/90 px-1.5 py-2 text-left align-bottom shadow-[2px_0_8px_-2px_rgba(15,23,42,0.08)]">
                                    <input
                                      type="checkbox"
                                      checked={allMatrixFilteredSelected}
                                      onChange={() => {
                                        setMatrixRowSelection((prev) => {
                                          const cur = new Set(prev[sk] ?? [])
                                          if (allMatrixFilteredSelected) {
                                            for (const r of matrixRowsFiltered) cur.delete(r.dataRowIndex)
                                          } else {
                                            for (const r of matrixRowsFiltered) cur.add(r.dataRowIndex)
                                          }
                                          return { ...prev, [sk]: cur }
                                        })
                                      }}
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/40"
                                      aria-label="Select all visible parts"
                                    />
                                  </th>
                                  <th className="sticky left-9 z-30 min-w-[11rem] max-w-[14rem] bg-sky-100/90 px-2 py-2 text-left align-bottom text-xs font-semibold text-gray-900 shadow-[4px_0_12px_-4px_rgba(15,23,42,0.1)]">
                                    Part
                                  </th>
                                  <th className="min-w-[4rem] px-2 py-2 text-left align-bottom text-xs font-semibold text-gray-900">
                                    Mfr
                                  </th>
                                  <th className="min-w-[4rem] px-2 py-2 text-center align-bottom text-xs font-semibold text-blue-700">
                                    Coverage
                                  </th>
                                  <th className="min-w-[4rem] px-2 py-2 text-right align-bottom text-xs font-semibold text-emerald-800">
                                    Best $
                                  </th>
                                  <th className="min-w-[4rem] px-2 py-2 text-right align-bottom text-xs font-semibold text-red-900">
                                    Worst $
                                  </th>
                                  <th className="min-w-[4rem] px-2 py-2 text-right align-bottom text-xs font-semibold text-gray-800">
                                    Spread
                                  </th>
                                  <th className="min-w-[4rem] px-2 py-2 text-right align-bottom text-xs font-semibold text-emerald-800">
                                    Savings
                                  </th>
                                  {matrixModel.vendorColumns.map((vc) => (
                                    <th
                                      key={vc.id}
                                      title={vc.fullLabel}
                                      className="min-w-[7.5rem] max-w-[9rem] px-1 py-2 text-center align-bottom text-[10px] font-bold leading-tight tracking-tight text-gray-800 sm:text-xs"
                                    >
                                      {vc.code}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {matrixRowsFiltered.map((mr) => {
                                  const selected = matrixSel.has(mr.dataRowIndex)
                                  const expandKey = makeMatrixExpandRowKey(sk, mr.dataRowIndex)
                                  const rowExpanded = matrixExpandedRowKey === expandKey
                                  const stickyRowBg = selected ? 'bg-sky-100/95' : 'bg-sky-50/95'
                                  return (
                                    <Fragment key={mr.dataRowIndex}>
                                      <tr
                                        className={`border-b border-sky-100/90 ${selected ? 'bg-sky-100/80' : 'bg-sky-50/90'}`}
                                      >
                                      <td
                                        className={`sticky left-0 z-20 w-9 px-1.5 py-1.5 align-middle shadow-[2px_0_8px_-2px_rgba(15,23,42,0.08)] ${stickyRowBg}`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={() => {
                                            setMatrixRowSelection((prev) => {
                                              const cur = new Set(prev[sk] ?? [])
                                              if (cur.has(mr.dataRowIndex)) cur.delete(mr.dataRowIndex)
                                              else cur.add(mr.dataRowIndex)
                                              return { ...prev, [sk]: cur }
                                            })
                                          }}
                                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/40"
                                          aria-label={`Select row ${mr.line1}`}
                                        />
                                      </td>
                                      <td
                                        className={`sticky left-9 z-20 max-w-[14rem] min-w-[11rem] px-2 py-1.5 align-top leading-snug shadow-[4px_0_12px_-4px_rgba(15,23,42,0.1)] ${stickyRowBg}`}
                                      >
                                        <div className="flex items-start gap-1">
                                          <button
                                            type="button"
                                            className="mt-0.5 shrink-0 rounded p-0.5 text-gray-600 hover:bg-sky-200/60 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                            aria-expanded={rowExpanded}
                                            aria-label={
                                              rowExpanded
                                                ? 'Collapse vendor list for this part'
                                                : 'Expand to see all vendors for this part'
                                            }
                                            onClick={() => {
                                              setMatrixVendorDetailKey(null)
                                              setMatrixExpandedRowKey((prev) =>
                                                prev === expandKey ? null : expandKey
                                              )
                                            }}
                                          >
                                            <ChevronDown
                                              className={`h-4 w-4 transition-transform ${rowExpanded ? 'rotate-180' : ''}`}
                                              aria-hidden
                                            />
                                          </button>
                                          <div className="min-w-0 flex-1">
                                            <div className="font-medium text-gray-900">{mr.line1 || '—'}</div>
                                            {mr.line2 ? (
                                              <div className="mt-0.5 text-[11px] text-gray-600 sm:text-xs">
                                                {mr.line2}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="max-w-[6rem] truncate px-2 py-1.5 align-top text-blue-600">
                                        {mr.mfr || '—'}
                                      </td>
                                      <td className="px-2 py-1.5 text-center text-blue-700">
                                        {mr.coverageTotal > 0
                                          ? `${mr.coverageHave}/${mr.coverageTotal}`
                                          : '—'}
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-emerald-700">
                                        {mr.best != null ? fmtUsd(mr.best) : '—'}
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-red-800">
                                        {mr.worst != null ? fmtUsd(mr.worst) : '—'}
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1.5 text-right text-gray-800">
                                        {mr.spread != null ? fmtUsd(mr.spread) : '—'}
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-emerald-700">
                                        {mr.savingsPct != null ? `${mr.savingsPct.toFixed(0)}%` : '—'}
                                      </td>
                                      {matrixModel.vendorColumns.map((vc) => {
                                        const p = mr.priceByVendorId[vc.id]
                                        const detail = mr.detailByVendorId[vc.id]
                                        const b = mr.best
                                        const w = mr.worst
                                        const hasSpread = b != null && w != null && w - b > 1e-6
                                        const isBest = hasSpread && p != null && b != null && Math.abs(p - b) < 1e-6
                                        const isWorst = hasSpread && p != null && w != null && Math.abs(p - w) < 1e-6
                                        const dk = makeMatrixVendorDetailKey(sk, mr.dataRowIndex, vc.id)
                                        const detailOpen = matrixVendorDetailKey === dk
                                        const priceCls =
                                          p == null
                                            ? 'text-gray-400'
                                            : isBest
                                              ? 'font-semibold text-emerald-700'
                                              : isWorst
                                                ? 'font-semibold text-red-800'
                                                : 'text-gray-900'
                                        const flatRows =
                                          detail && detailOpen
                                            ? Object.entries(flattenScrapedRecord(detail.data)).filter(
                                                ([, v]) => String(v ?? '').trim() !== ''
                                              )
                                            : []
                                        const src = detail ? safeHttpUrl(detail.url) : null
                                        return (
                                          <td
                                            key={vc.id}
                                            className={`min-w-[7.5rem] max-w-[9rem] align-top px-1 py-1.5 ${
                                              p == null ? 'text-gray-400' : ''
                                            }`}
                                          >
                                            {p == null ? (
                                              '—'
                                            ) : (
                                              <div
                                                className="relative"
                                                {...(detailOpen ? { 'data-matrix-vendor-detail': '' } : {})}
                                              >
                                                <div className="flex flex-col gap-0.5">
                                                  <div
                                                    className="line-clamp-2 text-left text-[10px] font-medium leading-tight text-gray-800"
                                                    title={vc.fullLabel}
                                                  >
                                                    {vc.fullLabel}
                                                  </div>
                                                  <div className="flex items-center justify-end gap-0.5">
                                                    <span className={`whitespace-nowrap text-xs ${priceCls}`}>
                                                      {fmtUsd(p)}
                                                    </span>
                                                    <button
                                                      type="button"
                                                      className="inline-flex shrink-0 rounded p-0.5 text-gray-500 hover:bg-sky-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                                      aria-expanded={detailOpen}
                                                      aria-label={`Details for ${vc.fullLabel}`}
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        setClassicScrapedDetailKey(null)
                                                        setMatrixVendorDetailKey((prev) =>
                                                          prev === dk ? null : dk
                                                        )
                                                      }}
                                                    >
                                                      <ChevronRight
                                                        className={`h-3.5 w-3.5 transition-transform ${detailOpen ? 'rotate-90' : ''}`}
                                                        aria-hidden
                                                      />
                                                    </button>
                                                  </div>
                                                </div>
                                                {detailOpen && detail ? (
                                                  <div
                                                    className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] max-h-72 overflow-y-auto rounded-md border border-sky-200 bg-white p-2 text-left text-xs shadow-lg"
                                                    role="dialog"
                                                    aria-label="Scraped vendor details"
                                                  >
                                                    <div className="mb-1.5 border-b border-gray-100 pb-1.5 font-semibold text-gray-900">
                                                      {vc.fullLabel}
                                                    </div>
                                                    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                      <span className="text-gray-500">Price</span>
                                                      <span className={priceCls}>{fmtUsd(p)}</span>
                                                    </div>
                                                    {src ? (
                                                      <div className="mb-2 break-all">
                                                        <a
                                                          href={src}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                                                        >
                                                          Open source page
                                                        </a>
                                                      </div>
                                                    ) : (
                                                      <div className="mb-2 break-all text-gray-500">
                                                        Source: {detail.url || '—'}
                                                      </div>
                                                    )}
                                                    {flatRows.length > 0 ? (
                                                      <dl className="space-y-1 border-t border-gray-100 pt-2">
                                                        {flatRows.map(([k, v]) => (
                                                          <div
                                                            key={k}
                                                            className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-2 gap-y-0.5"
                                                          >
                                                            <dt className="break-words text-[10px] font-medium uppercase tracking-wide text-gray-500">
                                                              {k}
                                                            </dt>
                                                            <dd className="break-words text-gray-800">{v}</dd>
                                                          </div>
                                                        ))}
                                                      </dl>
                                                    ) : (
                                                      <p className="text-gray-500">No extra fields in scrape.</p>
                                                    )}
                                                  </div>
                                                ) : null}
                                              </div>
                                            )}
                                          </td>
                                        )
                                      })}
                                    </tr>
                                    {rowExpanded ? (
                                      <tr className="border-b border-sky-200 bg-white">
                                        <td
                                          colSpan={8 + matrixModel.vendorColumns.length}
                                          className="p-0 align-top"
                                        >
                                          <div className="border-t border-sky-200 bg-gradient-to-b from-sky-50/90 to-white px-3 py-4 sm:px-5">
                                            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                                              <div>
                                                <p className="text-xs font-medium uppercase tracking-wide text-sky-800/80">
                                                  All vendors for this part
                                                </p>
                                                <h4 className="text-base font-semibold text-gray-900">
                                                  {mr.line1 || '—'}
                                                  {mr.line2 ? (
                                                    <span className="mt-1 block text-sm font-normal text-gray-600">
                                                      {mr.line2}
                                                    </span>
                                                  ) : null}
                                                </h4>
                                              </div>
                                              <button
                                                type="button"
                                                className="shrink-0 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-900 shadow-sm hover:bg-sky-50"
                                                onClick={() => setMatrixExpandedRowKey(null)}
                                              >
                                                Collapse
                                              </button>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                                              {matrixModel.vendorColumns.map((vc) => {
                                                const p = mr.priceByVendorId[vc.id]
                                                const detail = mr.detailByVendorId[vc.id]
                                                const b = mr.best
                                                const w = mr.worst
                                                const hasSpread =
                                                  b != null && w != null && w - b > 1e-6
                                                const isBest =
                                                  hasSpread &&
                                                  p != null &&
                                                  b != null &&
                                                  Math.abs(p - b) < 1e-6
                                                const isWorst =
                                                  hasSpread &&
                                                  p != null &&
                                                  w != null &&
                                                  Math.abs(p - w) < 1e-6
                                                const priceCls =
                                                  p == null
                                                    ? 'text-gray-400'
                                                    : isBest
                                                      ? 'text-emerald-700'
                                                      : isWorst
                                                        ? 'text-red-800'
                                                        : 'text-gray-900'
                                                const flatRows = detail
                                                  ? Object.entries(
                                                      flattenScrapedRecord(detail.data)
                                                    ).filter(([, v]) => String(v ?? '').trim() !== '')
                                                  : []
                                                const src = detail ? safeHttpUrl(detail.url) : null
                                                return (
                                                  <div
                                                    key={vc.id}
                                                    className={`flex flex-col rounded-xl border bg-white p-3 shadow-sm ${
                                                      p == null
                                                        ? 'border-gray-200 opacity-80'
                                                        : isBest
                                                          ? 'border-emerald-200 ring-1 ring-emerald-100'
                                                          : isWorst
                                                            ? 'border-red-200 ring-1 ring-red-100'
                                                            : 'border-sky-200'
                                                    }`}
                                                  >
                                                    <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2">
                                                      <div className="min-w-0 flex-1">
                                                        <span className="font-mono text-[10px] font-bold tracking-wide text-gray-500">
                                                          {vc.code}
                                                        </span>
                                                        <div className="text-sm font-semibold leading-snug text-gray-900">
                                                          {vc.fullLabel}
                                                        </div>
                                                      </div>
                                                      <div className="flex shrink-0 flex-col items-end gap-1">
                                                        {hasSpread && p != null && isBest ? (
                                                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-900">
                                                            Best
                                                          </span>
                                                        ) : null}
                                                        {hasSpread && p != null && isWorst ? (
                                                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-900">
                                                            Worst
                                                          </span>
                                                        ) : null}
                                                      </div>
                                                    </div>
                                                    {p == null ? (
                                                      <p className="mt-3 text-sm text-gray-500">
                                                        No price from this vendor for this part.
                                                      </p>
                                                    ) : (
                                                      <>
                                                        <p
                                                          className={`mt-3 text-2xl font-bold tabular-nums ${priceCls}`}
                                                        >
                                                          {fmtUsd(p)}
                                                        </p>
                                                        {src ? (
                                                          <a
                                                            href={src}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="mt-2 inline-flex text-sm font-medium text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                                                          >
                                                            Open source page
                                                          </a>
                                                        ) : detail?.url ? (
                                                          <p className="mt-2 break-all text-xs text-gray-500">
                                                            Source: {detail.url}
                                                          </p>
                                                        ) : null}
                                                        {flatRows.length > 0 ? (
                                                          <dl className="mt-3 max-h-52 space-y-2 overflow-y-auto border-t border-gray-100 pt-3 text-xs">
                                                            {flatRows.map(([k, v]) => (
                                                              <div key={k}>
                                                                <dt className="font-medium text-gray-500">
                                                                  {k}
                                                                </dt>
                                                                <dd className="mt-0.5 wrap-break-word text-gray-800">
                                                                  {v}
                                                                </dd>
                                                              </div>
                                                            ))}
                                                          </dl>
                                                        ) : null}
                                                      </>
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                    </Fragment>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : visibleOrdered.length === 0 ? (
                        <p className="text-sm text-amber-800">Select at least one field to display.</p>
                      ) : filteredRows.length === 0 ? (
                        <p className="text-sm text-gray-600">No rows match the current filters.</p>
                      ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                          <table className="min-w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-gray-200 bg-gray-50">
                                <th
                                  scope="col"
                                  className="sticky left-0 z-10 w-10 border-r border-gray-200 bg-gray-50 px-1.5 py-2.5"
                                >
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-violet-600 focus:ring-violet-500/40"
                                    checked={allClassicVisibleSelected}
                                    onChange={() => {
                                      setClassicRowSelection((prev) => {
                                        const cur = new Set(prev[sk] ?? [])
                                        if (allClassicVisibleSelected) {
                                          for (const i of visibleClassicIndices) cur.delete(i)
                                        } else {
                                          for (const i of visibleClassicIndices) cur.add(i)
                                        }
                                        return { ...prev, [sk]: cur }
                                      })
                                    }}
                                    disabled={visibleClassicIndices.length === 0}
                                    aria-label="Select all visible rows"
                                  />
                                </th>
                                {visibleOrdered.map((hi) => {
                                  const h = section.headers[hi] ?? ''
                                  const isScraped = hi >= section.csvColumnCount
                                  const firstScraped =
                                    firstVisibleScrapedIdx !== undefined && hi === firstVisibleScrapedIdx
                                  const scrapedKey = scrapedKeyFromHeader(h)
                                  return (
                                    <th
                                      key={hi}
                                      scope="col"
                                      className={`px-3 py-2.5 text-left align-bottom ${
                                        isScraped
                                          ? `min-w-[min(22rem,85vw)] max-w-[min(40rem,92vw)] bg-emerald-50/95 text-emerald-950 ${firstScraped ? 'border-l-4 border-emerald-400 pl-4' : ''}`
                                          : 'max-w-[min(20rem,45vw)] whitespace-nowrap font-semibold text-gray-900'
                                      }`}
                                    >
                                      {isScraped && scrapedKey ? (
                                        <>
                                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-emerald-800/90">
                                            Scraped
                                          </span>
                                          <span className="mt-1 block text-sm font-semibold leading-snug text-emerald-950">
                                            {humanizeScrapedFieldKey(scrapedKey)}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-xs font-semibold">{h}</span>
                                      )}
                                    </th>
                                  )
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {viewableEntries.map(({ row, dataRowIndex }) => (
                                  <tr key={dataRowIndex} className="border-b border-gray-100 last:border-b-0">
                                    <td className="sticky left-0 z-10 w-10 border-r border-gray-200 bg-white px-1.5 py-2.5 align-top">
                                      <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-violet-600 focus:ring-violet-500/40"
                                        checked={classicSel.has(dataRowIndex)}
                                        onChange={() => {
                                          setClassicRowSelection((prev) => {
                                            const cur = new Set(prev[sk] ?? [])
                                            if (cur.has(dataRowIndex)) cur.delete(dataRowIndex)
                                            else cur.add(dataRowIndex)
                                            return { ...prev, [sk]: cur }
                                          })
                                        }}
                                        aria-label={`Select row ${dataRowIndex + 1}`}
                                      />
                                    </td>
                                    {visibleOrdered.map((ci) => {
                                      const cell = row[ci] ?? ''
                                      const isScraped = ci >= section.csvColumnCount
                                      const firstScraped =
                                        firstVisibleScrapedIdx !== undefined && ci === firstVisibleScrapedIdx
                                      const colTitle = section.headers[ci] ?? ''
                                      const scrapedDetailKey = makeClassicScrapedDetailKey(sk, dataRowIndex, ci)
                                      const scrapedDetailOpen =
                                        isScraped && classicScrapedDetailKey === scrapedDetailKey
                                      const scrapedHasText = isScraped && cell.trim().length > 0
                                      const segments = scrapedHasText ? scrapedCellSegments(cell) : []
                                      const useBullets = segments.length > 1
                                      return (
                                        <td
                                          key={ci}
                                          className={`px-3 py-2.5 align-top ${
                                            isScraped
                                              ? `min-w-[min(22rem,85vw)] max-w-[min(40rem,92vw)] bg-emerald-50/40 text-emerald-950 ${firstScraped ? 'border-l-4 border-emerald-300' : ''}`
                                              : `max-w-[min(24rem,50vw)] truncate text-gray-800`
                                          }`}
                                          title={!isScraped && cell ? cell : undefined}
                                        >
                                          {scrapedHasText ? (
                                            <div
                                              className="relative"
                                              {...(scrapedDetailOpen ? { 'data-classic-scraped-detail': '' } : {})}
                                            >
                                              <div className="max-h-56 overflow-y-auto rounded-lg border border-emerald-200/80 bg-white/95 p-3 text-sm leading-relaxed text-emerald-950 shadow-sm">
                                                {useBullets ? (
                                                  <ul className="list-outside list-disc space-y-1.5 pl-4 marker:text-emerald-600">
                                                    {segments.map((seg, si) => (
                                                      <li key={si} className="wrap-break-word pl-0.5">
                                                        {seg}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                ) : (
                                                  <div className="wrap-break-word whitespace-pre-wrap">{cell}</div>
                                                )}
                                              </div>
                                              <div className="mt-2 flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/70">
                                                  Scroll or expand
                                                </span>
                                                <button
                                                  type="button"
                                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-900 shadow-sm hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                                                  aria-expanded={scrapedDetailOpen}
                                                  aria-label={`Full details: ${colTitle}`}
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    setMatrixVendorDetailKey(null)
                                                    setClassicScrapedDetailKey((prev) =>
                                                      prev === scrapedDetailKey ? null : scrapedDetailKey
                                                    )
                                                  }}
                                                >
                                                  Full view
                                                  <ChevronRight
                                                    className={`h-3.5 w-3.5 transition-transform ${scrapedDetailOpen ? 'rotate-90' : ''}`}
                                                    aria-hidden
                                                  />
                                                </button>
                                              </div>
                                              {scrapedDetailOpen ? (
                                                <div
                                                  className="absolute right-0 top-full z-50 mt-1 w-[min(32rem,calc(100vw-1.5rem))] max-h-[min(28rem,70vh)] overflow-y-auto rounded-lg border border-emerald-200 bg-white p-4 text-left text-sm text-gray-900 shadow-xl"
                                                  role="dialog"
                                                  aria-label={`${colTitle} full text`}
                                                >
                                                  <div className="mb-3 border-b border-emerald-100 pb-2">
                                                    {scrapedKeyFromHeader(colTitle) ? (
                                                      <>
                                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-800">
                                                          Scraped
                                                        </span>
                                                        <div className="mt-0.5 text-base font-semibold text-emerald-950">
                                                          {humanizeScrapedFieldKey(scrapedKeyFromHeader(colTitle) ?? '')}
                                                        </div>
                                                      </>
                                                    ) : (
                                                      <div className="text-sm font-semibold text-emerald-950">
                                                        {colTitle}
                                                      </div>
                                                    )}
                                                  </div>
                                                  <div className="wrap-break-word whitespace-pre-wrap leading-relaxed text-gray-800">
                                                    {cell}
                                                  </div>
                                                </div>
                                              ) : null}
                                            </div>
                                          ) : isScraped ? (
                                            <span className="text-gray-400">—</span>
                                          ) : (
                                            cell
                                          )}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {boardDetail && tabDataReady && loadedTabData && activeId
        ? (() => {
            const sKey = boardDetail.sk
            const sec = loadedTabData.sections.find(
              (s) => sectionPrefsKey(activeId, s.fileId) === sKey,
            )
            if (!sec) return null
            const idx = boardDetail.dataRowIndex
            const dat = sec.rows[idx]
            if (!dat) return null
            const p = sectionPrefs[sKey] ?? defaultSectionPrefsForSection(sec)
            const ordered = [...p.visibleColIndices].sort((a, b) => a - b)
            const mtx = buildVendorMatrix(sec)
            const mrow = mtx?.rows.find((r) => r.dataRowIndex === idx) ?? null
            return (
              <div
                className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center sm:p-6"
                role="presentation"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) setBoardDetail(null)
                }}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="wishlist-board-detail-title"
                  className="my-auto w-full max-w-3xl rounded-xl border border-gray-200 bg-white shadow-2xl"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 sm:px-5">
                    <FileText className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                    <h2
                      id="wishlist-board-detail-title"
                      className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900"
                    >
                      {mrow?.line1 || boardCardTitleFromClassic(sec, dat)}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setBoardDetail(null)}
                      className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300/50"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" aria-hidden />
                    </button>
                  </div>
                  <div className="max-h-[min(85vh,720px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
                    {mrow ? (
                      <div className="mb-4 grid gap-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
                            Coverage
                          </div>
                          <div className="mt-0.5 font-medium text-gray-900">
                            {mrow.coverageTotal > 0
                              ? `${mrow.coverageHave}/${mrow.coverageTotal}`
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
                            Best / worst
                          </div>
                          <div className="mt-0.5 font-medium text-gray-900">
                            {mrow.best != null ? fmtUsd(mrow.best) : '—'}
                            {mrow.worst != null ? ` · ${fmtUsd(mrow.worst)}` : ''}
                          </div>
                        </div>
                        {mrow.line2 ? (
                          <div className="sm:col-span-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/80">
                              Detail
                            </div>
                            <div className="mt-0.5 text-gray-800">{mrow.line2}</div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
                      Row data (visible columns)
                    </p>
                    <dl className="space-y-3">
                      {ordered.map((hi) => {
                        const head = sec.headers[hi] ?? `Column ${hi + 1}`
                        const val = dat[hi] ?? ''
                        return (
                          <div key={hi} className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
                            <dt className="text-xs font-medium text-gray-500">{head}</dt>
                            <dd className="mt-0.5 wrap-break-word text-sm text-gray-900">
                              {val.trim() ? val : '—'}
                            </dd>
                          </div>
                        )
                      })}
                    </dl>
                    <p className="mt-4 text-xs text-gray-500">
                      Wishlist rows are read-only here. Edit the source file in your workspace to change sheet cells.
                    </p>
                  </div>
                </div>
              </div>
            )
          })()
        : null}

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="presentation"
          onClick={closePicker}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="flex max-h-[min(32rem,85vh)] w-full max-w-lg flex-col rounded-xl border border-gray-200 bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id={dialogTitleId} className="text-sm font-semibold text-gray-900">
                {pickerStep === 'files' ? 'Choose files for new tab' : 'Choose columns'}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {pickerStep === 'files'
                  ? 'Select one or more workspace files. Folders are expanded in the list.'
                  : 'Pick which columns to include for each file. At least one column per file.'}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {pickerStep === 'files' && (
                <>
                  {!token && (
                    <p className="px-2 py-6 text-center text-sm text-gray-600">Sign in to load workspace files.</p>
                  )}
                  {token && pickerLoading && (
                    <p className="px-2 py-6 text-center text-sm text-gray-500">Loading files…</p>
                  )}
                  {token && !pickerLoading && pickerError && (
                    <p className="px-2 py-4 text-center text-sm text-red-600">{pickerError}</p>
                  )}
                  {token && !pickerLoading && !pickerError && pickerFiles.length === 0 && (
                    <p className="px-2 py-6 text-center text-sm text-gray-600">No files in your workspace yet.</p>
                  )}
                  {token && !pickerLoading && !pickerError && pickerFiles.length > 0 && (
                    <ul className="space-y-0.5">
                      {pickerFiles.map((f) => {
                        const checked = selectedIds.has(f.id)
                        return (
                          <li key={f.id}>
                            <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFile(f.id)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500/40"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5 text-sm text-gray-900">
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                                  <span className="truncate">{f.name}</span>
                                </span>
                                <span className="mt-0.5 block text-xs text-gray-500">{f.pathLabel}</span>
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}

              {pickerStep === 'fields' && (
                <>
                  {fieldsLoading && (
                    <p className="px-2 py-6 text-center text-sm text-gray-500">Loading columns…</p>
                  )}
                  {!fieldsLoading && fieldsError && (
                    <p className="px-2 py-4 text-center text-sm text-red-600">{fieldsError}</p>
                  )}
                  {!fieldsLoading && !fieldsError && (
                    <div className="space-y-4 px-2">
                      {selectedFilesOrdered.map((f) => {
                        const headers = fileHeadersById.get(f.id) ?? []
                        const selectedIdx = selectedFieldIndicesById.get(f.id) ?? new Set<number>()
                        if (headers.length === 0) {
                          return (
                            <div key={f.id} className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2">
                              <p className="text-xs font-medium text-amber-900">{f.name}</p>
                              <p className="mt-1 text-xs text-amber-800">
                                No header row found (empty or unreadable). Choose another file or add a header row to
                                the CSV.
                              </p>
                            </div>
                          )
                        }
                        return (
                          <div key={f.id} className="rounded-lg border border-gray-100 bg-gray-50/50 px-2 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
                              <p className="text-xs font-semibold text-gray-800">{f.name}</p>
                              <div className="flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => selectAllFieldsForFile(f.id)}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-200/80"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  onClick={() => clearFieldsForFile(f.id)}
                                  className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-200/80"
                                >
                                  None
                                </button>
                              </div>
                            </div>
                            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                              {headers.map((label, colIdx) => {
                                const checked = selectedIdx.has(colIdx)
                                return (
                                  <li key={`${f.id}-${colIdx}`}>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/80">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleFieldIndex(f.id, colIdx)}
                                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500/40"
                                      />
                                      <span className="min-w-0 flex-1 truncate text-xs text-gray-800">{label}</span>
                                    </label>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
              {pickerStep === 'files' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisible}
                      disabled={!token || pickerLoading || pickerFiles.length === 0}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      disabled={selectedIds.size === 0}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closePicker}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300/40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void goToFieldsStep()}
                      disabled={selectedIds.size === 0}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-40"
                    >
                      Next ({selectedIds.size})
                    </button>
                  </div>
                </>
              )}
              {pickerStep === 'fields' && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={backToFilesStep}
                      disabled={fieldsLoading}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={selectAllFieldsAllFiles}
                      disabled={fieldsLoading || fileHeadersById.size === 0}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    >
                      Select all columns
                    </button>
                    <button
                      type="button"
                      onClick={clearAllFieldsAllFiles}
                      disabled={fieldsLoading || fileHeadersById.size === 0}
                      className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                    >
                      Clear columns
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closePicker}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300/40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmNewTab}
                      disabled={fieldsLoading || !fieldsStepValid()}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-40"
                    >
                      Add tab
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
