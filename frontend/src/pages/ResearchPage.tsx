import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUpDown,
  Bot,
  ChevronDown,
  ChevronRight,
  EyeOff,
  Filter,
  GitCompare,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getToken, workspaceStorageKey } from '@/lib/auth'
import {
  getWorkspaceFileContent,
  listResearchGridSummary,
  listResearchUrls,
  listWorkspaceItems,
  researchMoreSource,
  saveDataSheetSelection,
  searchSelectionAndStoreUrls,
  updateWorkspaceFileContent,
  type ResearchGridSummaryRow,
  type ScrapedDataItem,
} from '@/lib/api'
import { isSpreadsheetWorkspaceFile } from '@/lib/workspaceFiles'
import { useBucket } from '@/contexts/BucketContext'
import { useComparison, type ComparisonItem } from '@/contexts/ComparisonContext'
import { useLayout } from '@/contexts/LayoutContext'
import { ResearchRowAiChat } from '@/components/research/ResearchRowAiChat'
import { ResearchSheetFilterBuilder } from '@/components/research/ResearchSheetFilterBuilder'
import { ResearchTabs } from '@/components/research/ResearchTabs'
import {
  RESEARCH_AI_SHEET_INSTRUCTIONS,
  type SheetColumnUpdate,
} from '@/lib/researchSheetUpdates'
import {
  defaultFilterBuilderItems,
  evalFilterBuilder,
  filterBuilderIsActive,
  filterBuilderSummaryLabels,
  type FilterBuilderTopItem,
} from '@/lib/researchSheetFilter'
import { RESEARCH_COMPARE_PATH } from '@/lib/paths'

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

function serializeToCsv(data: string[][]): string {
  return data
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '')
          if (/[,\n"]/.test(s)) return `"${s.replace(/"/g, '""')}"`
          return s
        })
        .join(',')
    )
    .join('\n')
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

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className ?? ''}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 47" />
    </svg>
  )
}

function isImageKey(key: string): boolean {
  const k = key.toLowerCase().replace(/_/g, '')
  return /image|img|photo|picture|thumbnail/.test(k)
}

function formatValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (val == null) return '—'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function isEditableScalar(val: unknown): boolean {
  return val == null || typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean'
}

function scalarEditText(val: unknown): string {
  if (val == null) return ''
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  return String(val)
}

function needsMultilineEdit(text: string): boolean {
  return text.includes('\n') || text.length > 72
}

function StructuredFieldEditor({
  value,
  onChange,
}: {
  value: unknown
  onChange: (next: string) => void
}) {
  const text = scalarEditText(value)
  const fieldClass =
    'w-full min-w-[100px] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-sm text-slate-900 hover:border-slate-300 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500/30'
  if (needsMultilineEdit(text)) {
    return (
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.min(6, Math.max(2, text.split('\n').length + (text.length > 120 ? 1 : 0)))}
        className={`${fieldClass} resize-y`}
      />
    )
  }
  return (
    <input
      type="text"
      value={text}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClass}
    />
  )
}

function structuredFieldEditText(val: unknown): string {
  if (Array.isArray(val)) {
    return val.map((v) => (v == null ? '' : String(v))).join('\n')
  }
  return scalarEditText(val)
}

function StructuredFieldCell({
  fieldKey,
  val,
  editing,
  onChange,
}: {
  fieldKey: string
  val: unknown
  editing: boolean
  onChange: (next: string) => void
}) {
  const imageUrls = Array.isArray(val)
    ? val.filter((v): v is string => typeof v === 'string' && isImageUrl(v))
    : isImageUrl(val)
      ? [String(val)]
      : []
  const showAsImage = (isImageKey(fieldKey) || imageUrls.length > 0) && imageUrls.length > 0

  if (editing) {
    if (
      isEditableScalar(val) ||
      showAsImage ||
      isImageKey(fieldKey) ||
      (Array.isArray(val) && val.every((v) => v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'))
    ) {
      return (
        <StructuredFieldEditor
          value={structuredFieldEditText(val)}
          onChange={onChange}
        />
      )
    }
    return (
      <StructuredFieldEditor
        value={formatValue(val) === '—' ? '' : formatValue(val)}
        onChange={onChange}
      />
    )
  }

  if (showAsImage) {
    return (
      <span className="inline-flex flex-wrap gap-2">
        {imageUrls.map((imgSrc, i) => (
          <span key={i} className="relative">
            <img
              src={imgSrc}
              alt={`${fieldKey.replace(/_/g, ' ')} ${i + 1}`}
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
              className="hidden max-w-[200px] truncate text-xs text-blue-600 hover:underline"
              title={imgSrc}
            >
              {imgSrc}
            </a>
          </span>
        ))}
      </span>
    )
  }

  return <>{renderValue(val)}</>
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 48)
  }
}

/** Flatten nested scraped objects into spec rows (dot-path labels). */
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

/** JSON context for in-panel AI (sheet row + scraped structured data). */
function buildResearchInspectorContext(
  headerRow: string[],
  row: string[] | null,
  scraped: Array<{ url: string; data: Record<string, unknown> }> | null,
  options?: { sourceIndex?: number; sourceOnly?: boolean }
): string {
  const sheetRow: Record<string, string> = {}
  if (row) {
    headerRow.forEach((h, i) => {
      const key = (h || `Column ${i + 1}`).trim()
      sheetRow[key] = String(row[i] ?? '')
    })
  }
  const allSources = (scraped ?? []).map((s, i) => ({
    source_index: i + 1,
    url: s.url,
    data: s.data,
  }))
  const sources =
    options?.sourceOnly && options.sourceIndex != null
      ? allSources.filter((s) => s.source_index === options.sourceIndex! + 1)
      : allSources
  try {
    return JSON.stringify({
      sheet_headers: headerRow.map((h, i) => (h || `Column ${i + 1}`).trim()),
      sheet_row: sheetRow,
      scraped_sources: sources,
      assistant_instructions: RESEARCH_AI_SHEET_INSTRUCTIONS,
    })
  } catch {
    return JSON.stringify({
      sheet_headers: [],
      sheet_row: sheetRow,
      scraped_sources: [],
      assistant_instructions: RESEARCH_AI_SHEET_INSTRUCTIONS,
    })
  }
}

function comparisonItemsFromScrapedSources(
  previewScrapedData: Array<{ url: string; data: Record<string, unknown> }>,
  selectedIndices: Set<number>,
  effectiveTabId: string,
  selectedRowIndex: number
): ComparisonItem[] {
  const sorted = [...selectedIndices].filter((i) => i >= 0 && i < previewScrapedData.length).sort((a, b) => a - b)
  return sorted.map((idx) => {
    const row = previewScrapedData[idx]!
    const domain = row.url ? extractDomain(row.url) : '—'
    const title = getFirstPartNumber(row.data) ?? `Source ${idx + 1}`
    const img = extractImageFromRecord(row.data)
    return {
      id: `research-${effectiveTabId}-r${selectedRowIndex}-s${idx}`,
      title,
      imageUrl: img,
      specs: collectScalarSpecs(row.data),
      sourceName: domain,
    }
  })
}

/** Stable union of spec labels (order follows first occurrence across items). */
function orderedUnionLabels(items: ComparisonItem[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    for (const spec of item.specs) {
      if (!seen.has(spec.label)) {
        seen.add(spec.label)
        out.push(spec.label)
      }
    }
  }
  return out
}

function specValueForLabel(item: ComparisonItem, label: string): string {
  const spec = item.specs.find((s) => s.label === label)
  return spec?.value ?? ''
}

function extractImageFromRecord(obj: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && isImageUrl(v) && (isImageKey(k) || /image|photo|thumbnail/i.test(k))) {
      return v.trim()
    }
  }
  for (const v of Object.values(obj)) {
    if (v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      const nested = extractImageFromRecord(v as Record<string, unknown>)
      if (nested) return nested
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && isImageUrl(v)) return v.trim()
  }
  return null
}

function extractImageFromSpecs(specs: ComparisonItem['specs']): string | null {
  for (const s of specs) {
    if (isImageKey(s.label) && isImageUrl(s.value)) return String(s.value).trim()
  }
  for (const s of specs) {
    if (isImageUrl(s.value)) return String(s.value).trim()
  }
  return null
}

function isPartNumberKey(key: string): boolean {
  const k = key.toLowerCase().replace(/\s+/g, '').replace(/-/g, '_')
  // Common LLM/schema outputs: part_number, partNumbers, part_no, partNo, etc.
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

function renderSimplePartFields(obj: Record<string, unknown>, maxFields = 3): ReactNode {
  const parts: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (parts.length >= maxFields) break
    if (isPartNumberKey(k) || isImageKey(k)) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k.replace(/_/g, ' ')}: ${String(v)}`)
    }
  }
  if (parts.length === 0) return null
  return <div className="text-xs text-gray-600">{parts.join(' • ')}</div>
}

function renderValue(val: unknown): ReactNode {
  if (val == null) return '—'

  if (Array.isArray(val)) {
    if (val.length === 0) return '—'

    const allObjects = val.every((v) => typeof v === 'object' && v !== null && !Array.isArray(v))
    if (allObjects) {
      const objs = val as Record<string, unknown>[]
      const hasAnyPartNumber = objs.some((o) => getFirstPartNumber(o) != null)
      if (!hasAnyPartNumber) return formatValue(val)

      return (
        <div className="space-y-1">
          {objs.map((obj, i) => {
            const partNumber = getFirstPartNumber(obj)
            return (
              <div key={i} className="rounded border border-gray-200 bg-white px-2 py-1">
                <div className="text-xs font-semibold text-gray-700">
                  {partNumber ? `Part number: ${partNumber}` : `Part ${i + 1}`}
                </div>
                {renderSimplePartFields(obj)}
              </div>
            )
          })}
        </div>
      )
    }

    const allPrimitive =
      val.every((v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') &&
      !val.some((v) => typeof v === 'object')
    if (allPrimitive) return val.map(String).join(', ')

    return formatValue(val)
  }

  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    const partNumber = getFirstPartNumber(obj)
    if (partNumber) {
      return (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-gray-700">Part number: {partNumber}</div>
          {renderSimplePartFields(obj)}
        </div>
      )
    }
    return formatValue(val)
  }

  return String(val)
}

function getDomPath(el: Element): string {
  const parts: string[] = []
  let current: Element | null = el
  while (current && current !== document.body) {
    let sel = current.tagName.toLowerCase()
    if (current.id) sel += `#${current.id}`
    else if (current.className && typeof current.className === 'string') {
      const cls = current.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
      if (cls) sel += '.' + cls.replace(/\s+/g, '.')
    }
    const parentEl: Element | null = current.parentElement
    if (parentEl) {
      const siblings = Array.from(parentEl.children).filter((c: Element) => c.tagName === current!.tagName)
      if (siblings.length > 1) {
        const idx = siblings.indexOf(current)
        if (idx >= 0) sel += `[${idx}]`
      }
    }
    parts.unshift(sel)
    current = parentEl
  }
  return parts.join(' > ')
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
const RESEARCH_TABS_KEY = 'research-tabs'

const INSPECTOR_MIN_WIDTH = 280
const INSPECTOR_MAX_WIDTH = 900
const INSPECTOR_DEFAULT_WIDTH = 450

type RowDensity = 'compact' | 'default' | 'comfortable'

function researchRowDensityClasses(density: RowDensity) {
  switch (density) {
    case 'compact':
      return {
        th: 'px-1 py-0.5',
        thLabel: 'text-[10px]',
        tdNum: 'h-7 min-h-[1.75rem] px-1 text-[10px]',
        tdCb: 'h-7 min-h-[1.75rem] px-2',
        tdResearch: 'h-7 min-h-[1.75rem] px-1.5',
        tdCell: 'h-7 min-h-[1.75rem] p-0',
        cellInput: 'h-7 min-h-[1.75rem] px-2 text-[11px]',
        headInput: 'px-1 py-0 text-[10px]',
      }
    case 'comfortable':
      return {
        th: 'px-2 py-2',
        thLabel: 'text-xs',
        tdNum: 'min-h-[2.75rem] py-2 px-1 text-[11px]',
        tdCb: 'min-h-[2.75rem] py-2 px-2',
        tdResearch: 'min-h-[2.75rem] py-2 px-1.5',
        tdCell: 'min-h-[2.75rem] py-2 p-0',
        cellInput: 'min-h-[2.75rem] px-2 py-1.5 text-xs',
        headInput: 'px-1 py-1 text-xs',
      }
    default:
      return {
        th: 'px-1.5 py-1.5',
        thLabel: 'text-[11px]',
        tdNum: 'h-8 px-1 text-[10px]',
        tdCb: 'h-8 px-2',
        tdResearch: 'h-8 px-1.5',
        tdCell: 'h-8 p-0',
        cellInput: 'h-8 px-2 text-xs',
        headInput: 'px-1 py-0.5 text-[11px]',
      }
  }
}

/** Airtable-style row height control icon */
function RowHeightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.5v7M19 10.5l2-2 2 2M19 13.5l2 2 2-2" />
    </svg>
  )
}

function researchToolbarBtnClass(active: boolean, disabled = false) {
  if (disabled) {
    return 'group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-gray-200 bg-white text-gray-400 opacity-60 cursor-default'
  }
  return `group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
    active
      ? 'border-blue-500 bg-blue-50 text-blue-700'
      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
  }`
}

function ResearchToolbarTooltip({ label }: { label: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  )
}

function ResearchToolbarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-300/80" aria-hidden />
}

function ResearchToolbarGroup({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1"
    >
      {children}
    </div>
  )
}

function ResearchFoundBadge({ count, onClick }: { count: number; onClick: () => void }) {
  if (!count) {
    return <span className="py-0.5 font-mono text-[11px] text-gray-400">—</span>
  }

  const tone =
    count >= 8
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : count >= 4
        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
        : 'border-orange-200 bg-orange-50 text-orange-900'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`rounded-full border-[1.5px] px-2.5 py-0.5 font-mono text-[11px] font-semibold shadow-none transition-shadow hover:shadow-md ${tone}`}
    >
      {count} found ↗
    </button>
  )
}

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
      // Never read the legacy unscoped `research-tabs` key — it leaked across accounts.
      const raw = localStorage.getItem(workspaceStorageKey(RESEARCH_TABS_KEY))
      if (!raw) return [newBlankSheet()]
      const parsed = JSON.parse(raw) as TabState[]
      // Preserve an intentionally empty tab set after user closes all tabs.
      return Array.isArray(parsed) ? parsed : [newBlankSheet()]
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
  const [toolbarActive, setToolbarActive] = useState<'selected' | null>(null)
  // Removed "Other options" menu
  // const [otherMenuOpen, setOtherMenuOpen] = useState(false)
  const [rowSearchDraft, setRowSearchDraft] = useState('')
  const [rowSearchQuery, setRowSearchQuery] = useState('')
  const [hiddenColumns, setHiddenColumns] = useState<Set<number>>(new Set())
  const [filterBuilderItems, setFilterBuilderItems] = useState<FilterBuilderTopItem[]>(() =>
    defaultFilterBuilderItems()
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [groupByCol, setGroupByCol] = useState<number | null>(null)
  const [sortCol, setSortCol] = useState<number | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [rowDensity, setRowDensity] = useState<RowDensity>('default')
  const [hideFieldsOpen, setHideFieldsOpen] = useState(false)
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [densityMenuOpen, setDensityMenuOpen] = useState(false)
  const [addColumnOpen, setAddColumnOpen] = useState(false)
  const [addColumnNameDraft, setAddColumnNameDraft] = useState('')
  const hideFieldsBtnRef = useRef<HTMLButtonElement>(null)
  const hideFieldsDropRef = useRef<HTMLDivElement>(null)
  const groupMenuBtnRef = useRef<HTMLButtonElement>(null)
  const groupMenuDropRef = useRef<HTMLDivElement>(null)
  const sortMenuBtnRef = useRef<HTMLButtonElement>(null)
  const sortMenuDropRef = useRef<HTMLDivElement>(null)
  const densityMenuBtnRef = useRef<HTMLButtonElement>(null)
  const densityMenuDropRef = useRef<HTMLDivElement>(null)
  const filterBtnRef = useRef<HTMLButtonElement>(null)
  const filterDropRef = useRef<HTMLDivElement>(null)
  const addColumnBtnRef = useRef<HTMLButtonElement>(null)
  const addColumnDropRef = useRef<HTMLDivElement>(null)
  const addColumnInputRef = useRef<HTMLInputElement>(null)
  /** Bumps when scroll/resize so portaled menus re-read anchor getBoundingClientRect. */
  const [, setToolbarMenuLayoutTick] = useState(0)
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
  const [, setElementDetails] = useState<{
    domPath: string
    position: { top: number; left: number; width: number; height: number }
    reactComponent: string
    htmlElement: string
  } | null>(null)
  const [inspectorMode, setInspectorMode] = useState<'single' | 'multi'>('single')
  const [inspectorMultiRowIndices, setInspectorMultiRowIndices] = useState<number[]>([])
  const [inspectorCompareSelection, setInspectorCompareSelection] = useState<Set<number>>(new Set())
  const [addRowPopover, setAddRowPopover] = useState<{
    open: boolean
    x: number
    y: number
  }>({ open: false, x: 0, y: 0 })
  const [addRowCountDraft, setAddRowCountDraft] = useState('1')
  const [deleteConfirm, setDeleteConfirm] = useState<'rows' | 'columns' | null>(null)
  const [researchFieldsPopupOpen, setResearchFieldsPopupOpen] = useState(false)
  const [researchAiQueryInput, setResearchAiQueryInput] = useState(
    'Product Image, Product description, Vendor name, Price, Product details, Delivery, Location, Contact'
  )
  const [researchMoreOpen, setResearchMoreOpen] = useState(false)
  const [researchMorePrompt, setResearchMorePrompt] = useState('')
  const [addStructuredColumnOpen, setAddStructuredColumnOpen] = useState(false)
  const [addStructuredColumnName, setAddStructuredColumnName] = useState('')
  const [addStructuredColumnSourceIdx, setAddStructuredColumnSourceIdx] = useState<number | null>(null)
  const [storeSelectionLoading, setStoreSelectionLoading] = useState(false)
  const [researchProgress, setResearchProgress] = useState(0)
  const [researchingRowIndices, setResearchingRowIndices] = useState<Set<number>>(new Set())
  const researchProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [researchVersion, setResearchVersion] = useState(0)
  const [previewScrapedData, setPreviewScrapedData] = useState<ScrapedDataItem[] | null>(null)
  const [previewResearchUrlId, setPreviewResearchUrlId] = useState<number | null>(null)
  const [researchMoreLoading, setResearchMoreLoading] = useState(false)
  /** Checked scraped source indices for inspector → Compare (synced when preview data loads). */
  const [inspectorScrapedSourceSelection, setInspectorScrapedSourceSelection] = useState<Set<number>>(new Set())
  const [previewResultsLoading, setPreviewResultsLoading] = useState(false)
  const [structuredDataViewType, setStructuredDataViewType] = useState<'row' | 'column'>('column')
  const [inspectorSourceAiOpen, setInspectorSourceAiOpen] = useState<Set<number>>(new Set())
  const [inspectorSourceEditOpen, setInspectorSourceEditOpen] = useState<Set<number>>(new Set())
  const [inspectorRowAiOpen, setInspectorRowAiOpen] = useState(false)
  const [researchRowSummaryByIndex, setResearchRowSummaryByIndex] = useState<
    Map<number, ResearchGridSummaryRow>
  >(() => new Map())
  const navigate = useNavigate()
  const location = useLocation()
  const flushSaveRef = useRef<(() => void) | null>(null)
  const { setCollapseSidebarForInspector } = useLayout()
  const { addItem, showToast } = useBucket()
  const {
    openWithItems: openComparison,
    closeAndClear: clearComparison,
    items: comparisonItems,
  } = useComparison()
  const [comparePreviewModalOpen, setComparePreviewModalOpen] = useState(false)
  const comparePreviewNavigateStateRef = useRef<unknown>(null)
  const [comparePreviewLayout, setComparePreviewLayout] = useState<'matrix' | 'cards'>('matrix')
  /** Matrix view: field labels whose rows are minimized (content hidden). */
  const [compareMatrixCollapsedFields, setCompareMatrixCollapsedFields] = useState<Set<string>>(
    () => new Set()
  )
  const comparePreviewWasOpenRef = useRef(false)

  const comparePreviewLabels = useMemo(
    () => orderedUnionLabels(comparisonItems),
    [comparisonItems]
  )

  const openComparePreviewModal = useCallback(
    (items: ComparisonItem[], navigateState: unknown) => {
      clearComparison()
      openComparison(items)
      const base =
        navigateState != null && typeof navigateState === 'object'
          ? (navigateState as Record<string, unknown>)
          : {}
      comparePreviewNavigateStateRef.current = {
        ...base,
        initialComparisonItems: items,
      }
      setComparePreviewModalOpen(true)
      showToast('Comparison preview ready')
    },
    [clearComparison, openComparison, showToast]
  )

  useEffect(() => {
    if (!comparePreviewModalOpen) return
    setComparePreviewLayout(comparisonItems.length >= 2 ? 'matrix' : 'cards')
  }, [comparePreviewModalOpen, comparisonItems.length])

  useEffect(() => {
    if (comparePreviewModalOpen && !comparePreviewWasOpenRef.current) {
      setCompareMatrixCollapsedFields(new Set())
    }
    comparePreviewWasOpenRef.current = comparePreviewModalOpen
  }, [comparePreviewModalOpen])

  useEffect(() => {
    if (!comparePreviewModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setComparePreviewModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [comparePreviewModalOpen])
  const lastClosedFileIdRef = useRef<number | null>(null)
  const hasRestoredPageStateRef = useRef(false)
  const userHasEditedRef = useRef(false)
  const saveImmediatelyRef = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const content = activeTab?.data ?? null
  const effectiveTabId = activeTab?.id ?? tabs[0]?.id ?? null

  const clearResearchProgressTicker = useCallback(() => {
    if (researchProgressIntervalRef.current) {
      clearInterval(researchProgressIntervalRef.current)
      researchProgressIntervalRef.current = null
    }
  }, [])

  const startResearchProgressTicker = useCallback(() => {
    clearResearchProgressTicker()
    researchProgressIntervalRef.current = setInterval(() => {
      setResearchProgress((p) => (p < 90 ? p + 1 : p))
    }, 350)
  }, [clearResearchProgressTicker])

  const runSelectedResearch = useCallback(
    async (aiQuery?: string, options?: { rowIndices?: number[] }) => {
      if (!content) return
      const token = getToken()
      if (!token) {
        showToast('Sign in to research selected')
        return
      }
      const colIndices =
        selectedColumns.size > 0
          ? Array.from(selectedColumns).sort((a, b) => a - b)
          : Array.from({ length: content[0]?.length ?? 0 }, (_, i) => i)
      if (colIndices.length === 0) {
        showToast('Select at least one column first')
        return
      }
      const headers = colIndices.map((i) => String(content[0]?.[i] ?? `Column ${i + 1}`).trim())
      const rowIndices =
        options?.rowIndices && options.rowIndices.length > 0
          ? [...options.rowIndices].sort((a, b) => a - b)
          : selectedRows.size > 0
            ? Array.from(selectedRows).sort((a, b) => a - b)
            : Array.from({ length: Math.max(0, content.length - 1) }, (_, i) => i)
      if (rowIndices.length === 0) {
        showToast('Select at least one row first')
        return
      }
      const rows = rowIndices.map((rowIdx) => {
        const row = content[rowIdx + 1] ?? []
        return colIndices.map((colIdx) => String(row[colIdx] ?? ''))
      })

      setResearchingRowIndices(new Set(rowIndices))
      setStoreSelectionLoading(true)
      setResearchProgress(8)
      startResearchProgressTicker()
      setResearchFieldsPopupOpen(false)
      setResearchMoreOpen(false)

      try {
        setResearchProgress(20)
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
        setResearchProgress(45)
        const searchResult = await searchSelectionAndStoreUrls(saved.id, token, aiQuery?.trim() || null)
        setResearchProgress(100)
        setResearchVersion((v) => v + 1)
        showToast(
          `Saved ${rows.length} row${rows.length !== 1 ? 's' : ''}. Searched and scraped ${searchResult.total_urls} URLs.`
        )
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Failed to save or search')
      } finally {
        clearResearchProgressTicker()
        setStoreSelectionLoading(false)
        setResearchingRowIndices(new Set())
        window.setTimeout(() => setResearchProgress(0), 400)
      }
    },
    [
      activeTab?.fileId,
      activeTab?.name,
      clearResearchProgressTicker,
      content,
      effectiveTabId,
      selectedColumns,
      selectedRows,
      showToast,
      startResearchProgressTicker,
    ]
  )

  useEffect(() => () => clearResearchProgressTicker(), [clearResearchProgressTicker])

  // Persist tabs in localStorage so they survive route changes and reloads
  useEffect(() => {
    try {
      localStorage.setItem(workspaceStorageKey(RESEARCH_TABS_KEY), JSON.stringify(tabs))
    } catch {
      // ignore quota or serialization errors
    }
  }, [tabs])

  // Save to workspace file when user edits and tab has fileId
  useEffect(() => {
    const fileId = activeTab?.fileId ?? null
    if (!fileId || !content || !userHasEditedRef.current) return

    const doSave = () => {
      const token = getToken()
      if (!token) return
      const csv = serializeToCsv(content)
      updateWorkspaceFileContent(fileId, csv, token)
        .then(() => {
          userHasEditedRef.current = false
          showToast('Saved to file')
        })
        .catch((err: unknown) => {
          showToast(err instanceof Error ? err.message : 'Failed to save')
        })
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    const delay = saveImmediatelyRef.current ? 0 : 800
    saveImmediatelyRef.current = false

    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null
      doSave()
    }, delay)

    flushSaveRef.current = () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      if (userHasEditedRef.current && fileId && content) doSave()
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      flushSaveRef.current = null
    }
  }, [content, activeTab?.fileId, showToast])

  // Flush pending save when navigating away
  useEffect(() => {
    const flush = () => flushSaveRef.current?.()
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  // Restore Research page state when returning from another page (skip if returning from Compare with restore state).
  // useLayoutEffect so activeTabId / row / inspector match persisted values before persist effect runs (avoids clobbering
  // localStorage with first-paint nulls and breaking AI chat keys like tabId:rowIndex).
  useLayoutEffect(() => {
    if (hasRestoredPageStateRef.current) return
    const st = location.state as { restoreResearchSelection?: unknown; restoreInspector?: unknown } | undefined
    if (st?.restoreResearchSelection || st?.restoreInspector) {
      // Dedicated restore effect owns this handoff; do not hydrate from localStorage yet.
      return
    }

    hasRestoredPageStateRef.current = true
    try {
      const raw = localStorage.getItem(workspaceStorageKey(RESEARCH_PAGE_STATE_KEY))
      if (!raw) return
      const data = JSON.parse(raw) as Partial<PersistedResearchState>
      if (data.activeTabId && tabs.some((t) => t.id === data.activeTabId)) {
        skipSelectionResetRef.current = true
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
  }, [location.state, tabs, setCollapseSidebarForInspector])

  // Persist Research page state so it survives navigation to other pages
  useEffect(() => {
    if (!hasRestoredPageStateRef.current) return
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
      localStorage.setItem(workspaceStorageKey(RESEARCH_PAGE_STATE_KEY), JSON.stringify(data))
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

  const prevEffectiveTabIdRef = useRef<string | null>(effectiveTabId)
  const skipSelectionResetRef = useRef(false)
  useEffect(() => {
    if (prevEffectiveTabIdRef.current === effectiveTabId) return
    prevEffectiveTabIdRef.current = effectiveTabId
    if (skipSelectionResetRef.current) {
      skipSelectionResetRef.current = false
      return
    }
    setSelectedRows(new Set())
    setSelectedColumns(new Set())
    setSelectedRowIndex(null)
    setPage(1)
    setHiddenColumns(new Set())
    setFilterBuilderItems(defaultFilterBuilderItems())
    setFilterOpen(false)
    setGroupByCol(null)
    setSortCol(null)
    setSortDir('asc')
    setRowDensity('default')
    setHideFieldsOpen(false)
    setGroupMenuOpen(false)
    setSortMenuOpen(false)
    setDensityMenuOpen(false)
    setAddColumnOpen(false)
    setAddColumnNameDraft('')
    setIsInspectorOpen(false)
    setInspectorMaximized(false)
    setInspectorMode('single')
    setInspectorMultiRowIndices([])
    setInspectorCompareSelection(new Set())
    setCollapseSidebarForInspector(false)
  }, [effectiveTabId, setCollapseSidebarForInspector])

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
        } else if (isSpreadsheetWorkspaceFile(item)) {
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
      setPreviewResearchUrlId(null)
      setPreviewResultsLoading(false)
      return
    }
    const token = getToken()
    if (!token) {
      setPreviewScrapedData(null)
      setPreviewResearchUrlId(null)
      setPreviewResultsLoading(false)
      return
    }
    const fileId = activeTab?.fileId ?? null
    const tabId = effectiveTabId ?? null
    if (!fileId && !tabId) {
      setPreviewScrapedData(null)
      setPreviewResearchUrlId(null)
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
        setPreviewResearchUrlId(item?.id ?? null)
        setPreviewScrapedData(item?.scraped_data ?? null)
      })
      .catch(() => {
        setPreviewResearchUrlId(null)
        setPreviewScrapedData(null)
      })
      .finally(() => setPreviewResultsLoading(false))
  }, [selectedRowIndex, effectiveTabId, activeTab?.fileId, researchVersion, isInspectorOpen])

  // Keep scraped-source checkboxes unchecked until the user selects them (do not select all on load).
  useEffect(() => {
    setInspectorScrapedSourceSelection(new Set())
  }, [previewScrapedData])

  useEffect(() => {
    setInspectorSourceAiOpen(new Set())
    setInspectorSourceEditOpen(new Set())
    setInspectorRowAiOpen(false)
    setResearchMoreOpen(false)
    setResearchMoreLoading(false)
    setAddStructuredColumnOpen(false)
    setAddStructuredColumnSourceIdx(null)
  }, [selectedRowIndex])

  // Grid row highlights + counts from latest selection (no full scrape payload)
  useEffect(() => {
    const token = getToken()
    const fileId = activeTab?.fileId ?? null
    const tabId = fileId ? null : effectiveTabId
    if (!token || (!fileId && !tabId)) {
      setResearchRowSummaryByIndex(new Map())
      return
    }
    let cancelled = false
    listResearchGridSummary(token, { fileId: fileId ?? undefined, tabId: tabId ?? undefined })
      .then((rows) => {
        if (cancelled) return
        const next = new Map<number, ResearchGridSummaryRow>()
        for (const r of rows) {
          const idx = Number(r.table_row_index)
          if (!Number.isFinite(idx)) continue
          next.set(idx, { ...r, table_row_index: idx })
        }
        setResearchRowSummaryByIndex(next)
      })
      .catch(() => {
        if (!cancelled) setResearchRowSummaryByIndex(new Map())
      })
    return () => {
      cancelled = true
    }
  }, [activeTab?.fileId, effectiveTabId, researchVersion])

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
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id)
        if (idx < 0) return prev

        const tab = prev[idx]
        const next = prev.filter((t) => t.id !== id)

        // If this tab was backed by a workspace file, clear any file-related URL params.
        if (tab?.fileId != null) {
          lastClosedFileIdRef.current = tab.fileId
          setSearchParams({}, { replace: true })
        }

        setActiveTabId((currentActiveId) => {
          if (currentActiveId !== id) return currentActiveId
          const nextActive = next[idx] ?? next[idx - 1] ?? next[0]
          return nextActive?.id ?? null
        })

        return next
      })
    },
    [setSearchParams]
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

  /** Persist sheet CSV to Mongo workspace_files when the tab is backed by a file. */
  const persistSheetContent = useCallback(
    async (nextData: string[][]): Promise<boolean> => {
      const fileId = activeTab?.fileId ?? null
      if (!fileId) return false
      const token = getToken()
      if (!token) {
        showToast('Sign in to save changes to the server')
        return false
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      try {
        await updateWorkspaceFileContent(fileId, serializeToCsv(nextData), token)
        userHasEditedRef.current = false
        saveImmediatelyRef.current = false
        return true
      } catch (err: unknown) {
        showToast(err instanceof Error ? err.message : 'Failed to save to server')
        return false
      }
    },
    [activeTab?.fileId, showToast]
  )

  const updateCell = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      userHasEditedRef.current = true
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

  const applySheetColumnUpdates = useCallback(
    (updates: SheetColumnUpdate[]) => {
      if (!updates.length || selectedRowIndex == null || !content?.length) {
        showToast('Select a row before applying sheet updates')
        return
      }
      const validUpdates = updates.filter((u) => u.column.trim())
      if (!validUpdates.length) return

      userHasEditedRef.current = true
      saveImmediatelyRef.current = true
      const dataRowIndex = selectedRowIndex + 1
      setActiveTabData((prev) => {
        if (!prev.length) return prev
        const next = prev.map((row) => [...row])
        const headerRow = [...(next[0] ?? [])]
        const row = [...(next[dataRowIndex] ?? [])]

        for (const { column, value } of validUpdates) {
          const name = column.trim()
          const norm = name.toLowerCase()
          let colIdx = headerRow.findIndex((h) => (h || '').trim().toLowerCase() === norm)
          if (colIdx < 0) {
            colIdx = headerRow.length
            headerRow.push(name)
            for (let r = 1; r < next.length; r++) {
              while (next[r].length < headerRow.length) next[r].push('')
            }
          }
          while (row.length < headerRow.length) row.push('')
          row[colIdx] = value
        }

        next[0] = headerRow
        next[dataRowIndex] = row
        return next
      })
      showToast(`Updated ${validUpdates.length} column${validUpdates.length === 1 ? '' : 's'} on this row`)
    },
    [content, selectedRowIndex, setActiveTabData, showToast]
  )

  const toggleInspectorSourceAi = useCallback((sourceIndex: number) => {
    setInspectorSourceAiOpen((prev) => {
      const next = new Set(prev)
      if (next.has(sourceIndex)) next.delete(sourceIndex)
      else next.add(sourceIndex)
      return next
    })
  }, [])

  const toggleInspectorSourceEdit = useCallback((sourceIndex: number) => {
    setInspectorSourceEditOpen((prev) => {
      const next = new Set(prev)
      if (next.has(sourceIndex)) next.delete(sourceIndex)
      else next.add(sourceIndex)
      return next
    })
  }, [])

  const updateScrapedField = useCallback((sourceIndex: number, key: string, value: string) => {
    setPreviewScrapedData((prev) => {
      if (!prev) return prev
      return prev.map((item, i) => {
        if (i !== sourceIndex) return item
        return { ...item, data: { ...item.data, [key]: value } }
      })
    })
  }, [])

  const addStructuredColumn = useCallback(
    (columnName: string, sourceIndex: number | null) => {
      const key = columnName.trim().replace(/\s+/g, '_')
      const label = columnName.trim()
      if (!label) {
        showToast('Enter a column name')
        return
      }
      setPreviewScrapedData((prev) => {
        if (!prev || prev.length === 0) {
          return [{ url: '', data: { [key]: '' } }]
        }
        return prev.map((item, i) => {
          if (sourceIndex != null && i !== sourceIndex) return item
          if (Object.prototype.hasOwnProperty.call(item.data, key)) return item
          return { ...item, data: { ...item.data, [key]: '' } }
        })
      })
      applySheetColumnUpdates([{ column: label, value: '' }])
      setAddStructuredColumnName('')
      setAddStructuredColumnOpen(false)
      setAddStructuredColumnSourceIdx(null)
      showToast(`Added column “${label}”`)
    },
    [applySheetColumnUpdates, showToast]
  )

  const runResearchMoreOnSelectedSource = useCallback(async () => {
    const prompt = researchMorePrompt.trim()
    if (!prompt) {
      showToast('Enter a prompt for what to extract')
      return
    }
    if (inspectorScrapedSourceSelection.size !== 1) {
      showToast('Select exactly one source (checkbox) to research more')
      return
    }
    const sourceIndex = Array.from(inspectorScrapedSourceSelection)[0]
    const source = previewScrapedData?.[sourceIndex ?? -1]
    if (sourceIndex == null || !source) {
      showToast('Selected source not found')
      return
    }
    if (source.id == null) {
      showToast('This source cannot be re-scraped yet. Run Research Selected first.')
      return
    }
    if (previewResearchUrlId == null) {
      showToast('No research record for this row')
      return
    }
    if (!source.url?.trim()) {
      showToast('Selected source has no URL')
      return
    }
    const token = getToken()
    if (!token) {
      showToast('Sign in to research more')
      return
    }

    setResearchMoreLoading(true)
    try {
      const result = await researchMoreSource(token, previewResearchUrlId, {
        scrapedId: source.id,
        aiQuery: prompt,
      })
      setPreviewScrapedData((prev) => {
        if (!prev) return prev
        return prev.map((item, i) =>
          i === sourceIndex
            ? { ...item, id: result.scraped_id, url: result.url, data: result.data }
            : item
        )
      })
      const bits: string[] = []
      if (result.updated_fields.length) {
        bits.push(`updated ${result.updated_fields.length}`)
      }
      if (result.new_fields.length) {
        bits.push(`added ${result.new_fields.length} column${result.new_fields.length === 1 ? '' : 's'}`)
      }
      showToast(
        bits.length
          ? `Source ${sourceIndex + 1}: ${bits.join(', ')}`
          : `Source ${sourceIndex + 1}: no field changes`
      )
      setResearchMoreOpen(false)
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Research more failed')
    } finally {
      setResearchMoreLoading(false)
    }
  }, [
    inspectorScrapedSourceSelection,
    previewResearchUrlId,
    previewScrapedData,
    researchMorePrompt,
    showToast,
  ])

  const addSheetColumn = useCallback(
    async (rawName?: string) => {
      const defaultLabel = `Column ${(content?.[0]?.length ?? 0) + 1}`
      const label = (rawName ?? '').trim() || defaultLabel
      const nextData = (() => {
        if (!content?.length) return [[label]]
        const next = content.map((row) => [...row])
        const headerRow = [...(next[0] ?? []), label]
        next[0] = headerRow
        for (let r = 1; r < next.length; r++) {
          while (next[r].length < headerRow.length) next[r].push('')
        }
        return next
      })()

      userHasEditedRef.current = true
      saveImmediatelyRef.current = true
      setActiveTabData(() => nextData)
      setAddColumnOpen(false)
      setAddColumnNameDraft('')

      const saved = await persistSheetContent(nextData)
      showToast(
        saved ? `Added column “${label}” and saved` : `Added column “${label}”`
      )
    },
    [content, persistSheetContent, setActiveTabData, showToast]
  )

  const addRow = useCallback((count: number = 1) => {
    userHasEditedRef.current = true
    saveImmediatelyRef.current = true
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
    setDeleteConfirm('rows')
  }, [content, selectedRows.size])

  const removeSelectedColumns = useCallback(() => {
    if (!content?.[0] || selectedColumns.size === 0) return
    const colCount = content[0].length
    if (selectedColumns.size >= colCount) {
      showToast('Keep at least one column')
      return
    }
    setDeleteConfirm('columns')
  }, [content, selectedColumns.size, showToast])

  const confirmDeleteSelectedRows = useCallback(() => {
    if (!content || selectedRows.size === 0) {
      setDeleteConfirm(null)
      return
    }

    // selectedRows are 0-based indices into data rows; content includes header row at index 0
    const toRemove = Array.from(selectedRows)
      .map((i) => i + 1)
      .sort((a, b) => b - a)

    userHasEditedRef.current = true
    saveImmediatelyRef.current = true
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
    setDeleteConfirm(null)
  }, [
    content,
    selectedRows,
    setActiveTabData,
    setCollapseSidebarForInspector,
  ])

  const confirmDeleteSelectedColumns = useCallback(async () => {
    if (!content?.[0] || selectedColumns.size === 0) {
      setDeleteConfirm(null)
      return
    }
    const colCount = content[0].length
    const toRemove = Array.from(selectedColumns)
      .filter((i) => i >= 0 && i < colCount)
      .sort((a, b) => a - b)
    if (toRemove.length === 0) {
      setDeleteConfirm(null)
      return
    }
    if (toRemove.length >= colCount) {
      showToast('Keep at least one column')
      setDeleteConfirm(null)
      return
    }

    const remapCol = (oldIdx: number | null): number | null => {
      if (oldIdx == null) return null
      if (toRemove.includes(oldIdx)) return null
      return oldIdx - toRemove.filter((r) => r < oldIdx).length
    }

    const removedHeaderKeys = new Set(
      toRemove
        .map((i) => String(content[0][i] ?? '').trim())
        .filter(Boolean)
        .map((h) => h.toLowerCase())
    )
    const nextData = content.map((row) => row.filter((_, colIdx) => !toRemove.includes(colIdx)))

    userHasEditedRef.current = true
    saveImmediatelyRef.current = true
    setActiveTabData(() => nextData)

    setSelectedColumns(new Set())
    setHiddenColumns((prev) => {
      const next = new Set<number>()
      for (const idx of prev) {
        const mapped = remapCol(idx)
        if (mapped != null) next.add(mapped)
      }
      return next
    })
    setSortCol((prev) => remapCol(prev))
    setGroupByCol((prev) => remapCol(prev))
    setFilterBuilderItems((prev) =>
      prev.map((item) => {
        if (item.type === 'line') {
          return {
            ...item,
            row: { ...item.row, fieldCol: remapCol(item.row.fieldCol) },
          }
        }
        return {
          ...item,
          rows: item.rows.map((row) => ({ ...row, fieldCol: remapCol(row.fieldCol) })),
        }
      })
    )
    if (removedHeaderKeys.size > 0) {
      setPreviewScrapedData((prev) => {
        if (!prev?.length) return prev
        return prev.map((item) => {
          const data = { ...item.data }
          let changed = false
          for (const key of Object.keys(data)) {
            if (removedHeaderKeys.has(key.trim().toLowerCase())) {
              delete data[key]
              changed = true
            }
          }
          return changed ? { ...item, data } : item
        })
      })
    }
    setDeleteConfirm(null)

    const saved = await persistSheetContent(nextData)
    const n = toRemove.length
    showToast(
      saved
        ? `Deleted ${n} column${n === 1 ? '' : 's'} and saved`
        : `Deleted ${n} column${n === 1 ? '' : 's'}`
    )
  }, [content, persistSheetContent, selectedColumns, setActiveTabData, showToast])

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

  // Cell interactions:
  // - single click selects row (updates highlight, but does not open preview panel)
  // - double click opens the right-side preview panel for that row
  const handleCellSelect = useCallback(
    (dataRowIndex: number) => {
      setSelectedRowIndex(dataRowIndex)
      if (isInspectorOpen) {
        // Keep inspector state consistent when switching rows while panel is already open.
        setInspectorMode('single')
        setInspectorMaximized(false)
        setInspectorMultiRowIndices([])
        setInspectorCompareSelection(new Set())
        setCollapseSidebarForInspector(true)
      }
    },
    [isInspectorOpen, setCollapseSidebarForInspector]
  )

  const handleCellClick = useCallback(
    (dataRowIndex: number) => {
      setSelectedRowIndex(dataRowIndex)
      setIsInspectorOpen(true)
      setInspectorMode('single')
      setInspectorMaximized(false)
      setInspectorMultiRowIndices([])
      setInspectorCompareSelection(new Set())
      setCollapseSidebarForInspector(true)
    },
    [setCollapseSidebarForInspector]
  )

  const headers = content?.[0] ?? []
  const hasRowSearch = rowSearchQuery.trim().length > 0
  const unfilteredRowCount = content ? content.length - 1 : 0
  const rd = researchRowDensityClasses(rowDensity)

  const visibleColIndices = useMemo(() => {
    if (!content?.[0]) return []
    return Array.from({ length: content[0].length }, (_, i) => i).filter((i) => !hiddenColumns.has(i))
  }, [content, hiddenColumns])

  const hasActiveColumnFilters = useMemo(
    () => filterBuilderIsActive(filterBuilderItems),
    [filterBuilderItems]
  )
  const filterSummaryLabels = useMemo(
    () => filterBuilderSummaryLabels(filterBuilderItems, headers),
    [filterBuilderItems, headers]
  )

  const getDistinctColumnValues = useCallback(
    (colIdx: number) => {
      if (!content || content.length <= 1) return []
      return Array.from(
        new Set(content.slice(1).map((row) => String(row[colIdx] ?? '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b))
    },
    [content]
  )

  // Debounce global row search so it stays snappy for large sheets.
  useEffect(() => {
    const t = setTimeout(() => {
      setRowSearchQuery(rowSearchDraft)
      setPage(1)
    }, 150)
    return () => clearTimeout(t)
  }, [rowSearchDraft])

  const searchFilteredIndices = useMemo(() => {
    if (!content || content.length <= 1) return []
    const allIndices = Array.from({ length: content.length - 1 }, (_, i) => i)
    const q = rowSearchQuery.trim().toLowerCase()
    if (!q) return allIndices
    return allIndices.filter((dataIdx) => {
      const row = content[dataIdx + 1]
      for (const cell of row) {
        if (String(cell ?? '').toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [content, rowSearchQuery])

  const columnFilteredIndices = useMemo(() => {
    if (!content) return []
    if (!hasActiveColumnFilters) return searchFilteredIndices
    return searchFilteredIndices.filter((dataIdx) => {
      const row = content[dataIdx + 1]
      return evalFilterBuilder(filterBuilderItems, row)
    })
  }, [content, searchFilteredIndices, filterBuilderItems, hasActiveColumnFilters])

  const viewRowIndices = useMemo(() => {
    if (!content || sortCol === null) return columnFilteredIndices
    const copy = [...columnFilteredIndices]
    copy.sort((a, b) => {
      const ra = content[a + 1]!
      const rb = content[b + 1]!
      const va = String(ra[sortCol] ?? '').toLowerCase()
      const vb = String(rb[sortCol] ?? '').toLowerCase()
      const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [content, columnFilteredIndices, sortCol, sortDir])

  const totalDataRows = viewRowIndices.length
  const totalPages = Math.max(1, Math.ceil(totalDataRows / rowsPerPage))
  const currentPage = Math.min(page, totalPages)
  const startRow = (currentPage - 1) * rowsPerPage
  const endRow = Math.min(startRow + rowsPerPage, totalDataRows)
  const rowIndices = viewRowIndices.slice(startRow, endRow)
  const sheetBodyItems = useMemo(() => {
    if (!content) return []
    type BodyItem =
      | { kind: 'group'; key: string; label: string }
      | { kind: 'row'; dataRowIndex: number; row: string[] }
    const groupLabel = (dataIdx: number) => {
      if (groupByCol == null) return ''
      return String(content[dataIdx + 1]?.[groupByCol] ?? '').trim() || '(Empty)'
    }
    const items: BodyItem[] = []
    for (let idx = 0; idx < rowIndices.length; idx++) {
      const dataRowIndex = rowIndices[idx]!
      const row = content[dataRowIndex + 1]
      if (!row) continue
      if (groupByCol != null) {
        const prevDataIdx =
          idx === 0 ? (startRow > 0 ? viewRowIndices[startRow - 1] : undefined) : rowIndices[idx - 1]
        const needsHeader = prevDataIdx === undefined || groupLabel(dataRowIndex) !== groupLabel(prevDataIdx)
        if (needsHeader) {
          items.push({
            kind: 'group',
            key: `g-${dataRowIndex}-${groupLabel(dataRowIndex)}`,
            label: groupLabel(dataRowIndex),
          })
        }
      }
      items.push({ kind: 'row', dataRowIndex, row })
    }
    return items
  }, [content, rowIndices, groupByCol, startRow, viewRowIndices])

  const toggleSelectAll = () => {
    if (!content || content.length <= 1) return
    const allFilteredSelected = viewRowIndices.length > 0 && viewRowIndices.every((i) => selectedRows.has(i))
    if (allFilteredSelected) {
      setSelectedRows((prev) => {
        const next = new Set(prev)
        for (const i of viewRowIndices) next.delete(i)
        return next
      })
    } else {
      setSelectedRows((prev) => {
        const next = new Set(prev)
        for (const i of viewRowIndices) next.add(i)
        return next
      })
    }
  }

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
      if (e.key !== 'Escape' || !isInspectorOpen) return
      if (comparePreviewModalOpen) return
      closeInspector()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isInspectorOpen, comparePreviewModalOpen, closeInspector])

  const closeAllGridMenus = useCallback(() => {
    setHideFieldsOpen(false)
    setFilterOpen(false)
    setGroupMenuOpen(false)
    setSortMenuOpen(false)
    setDensityMenuOpen(false)
    setAddColumnOpen(false)
  }, [])

  const anyToolbarMenuOpen =
    hideFieldsOpen ||
    filterOpen ||
    groupMenuOpen ||
    sortMenuOpen ||
    densityMenuOpen ||
    addColumnOpen

  useLayoutEffect(() => {
    if (!anyToolbarMenuOpen) return
    const bump = () => setToolbarMenuLayoutTick((n) => n + 1)
    window.addEventListener('scroll', bump, true)
    window.addEventListener('resize', bump)
    return () => {
      window.removeEventListener('scroll', bump, true)
      window.removeEventListener('resize', bump)
    }
  }, [anyToolbarMenuOpen])

  useEffect(() => {
    if (addColumnOpen) {
      const t = window.setTimeout(() => addColumnInputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [addColumnOpen])

  useEffect(() => {
    if (
      !hideFieldsOpen &&
      !filterOpen &&
      !groupMenuOpen &&
      !sortMenuOpen &&
      !densityMenuOpen &&
      !addColumnOpen
    ) {
      return
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (
        hideFieldsOpen &&
        (hideFieldsBtnRef.current?.contains(t) || hideFieldsDropRef.current?.contains(t))
      ) {
        return
      }
      if (
        groupMenuOpen &&
        (groupMenuBtnRef.current?.contains(t) || groupMenuDropRef.current?.contains(t))
      ) {
        return
      }
      if (sortMenuOpen && (sortMenuBtnRef.current?.contains(t) || sortMenuDropRef.current?.contains(t))) {
        return
      }
      if (
        densityMenuOpen &&
        (densityMenuBtnRef.current?.contains(t) || densityMenuDropRef.current?.contains(t))
      ) {
        return
      }
      if (filterOpen && (filterBtnRef.current?.contains(t) || filterDropRef.current?.contains(t))) return
      if (
        addColumnOpen &&
        (addColumnBtnRef.current?.contains(t) || addColumnDropRef.current?.contains(t))
      ) {
        return
      }
      closeAllGridMenus()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAllGridMenus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [
    hideFieldsOpen,
    filterOpen,
    groupMenuOpen,
    sortMenuOpen,
    densityMenuOpen,
    addColumnOpen,
    closeAllGridMenus,
  ])

  // Capture element details for selected row (for Add details)
  useEffect(() => {
    if (selectedRowIndex == null || !isInspectorOpen) {
      setElementDetails(null)
      return
    }
    const capture = () => {
      const row = document.querySelector(`tr[data-row-index="${selectedRowIndex}"]`)
      const cell = row?.querySelector('td:nth-child(2)')
      const input = cell?.querySelector('input')
      const el = (input ?? cell) as HTMLElement
      if (!el) return
      const rect = el.getBoundingClientRect()
      setElementDetails({
        domPath: getDomPath(el),
        position: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        reactComponent: 'ResearchPage',
        htmlElement: el.outerHTML.slice(0, 200) + (el.outerHTML.length > 200 ? '…' : ''),
      })
    }
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(capture)
    })
    return () => cancelAnimationFrame(t)
  }, [selectedRowIndex, isInspectorOpen])

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

  // Handle action from Compare page (New sheet / Open file)
  useEffect(() => {
    const st = location.state as { action?: string } | undefined
    const action = st?.action
    if (action === 'newSheet') {
      addNewTab()
      const rest = { ...st } as Record<string, unknown>
      delete rest.action
      navigate(location.pathname + location.search, { replace: true, state: Object.keys(rest).length ? rest : undefined })
    } else if (action === 'openFilePicker') {
      setFilePickerOpen(true)
      const rest = { ...st } as Record<string, unknown>
      delete rest.action
      navigate(location.pathname + location.search, { replace: true, state: Object.keys(rest).length ? rest : undefined })
    }
  }, [location.pathname, location.search, location.state, addNewTab, navigate])

  // Restore inspector state when returning from research/compare
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
    if (st?.restoreResearchSelection) {
      const r = st.restoreResearchSelection
      if (r.rowsPerPage) setRowsPerPage(r.rowsPerPage)
      if (r.page) setPage(r.page)
      if (r.activeTabId) {
        skipSelectionResetRef.current = true
        setActiveTabId(r.activeTabId)
      }
      setSelectedRows(new Set(r.selectedRows ?? []))
    }
    if (st?.restoreInspector) {
      const r = st.restoreInspector
      setInspectorMode(r.mode)
      setSelectedRowIndex(r.selectedRowIndex)
      setInspectorMultiRowIndices(r.multiRowIndices ?? [])
      setInspectorCompareSelection(new Set(r.compareSelection ?? []))
      setIsInspectorOpen(true)
      setCollapseSidebarForInspector(true)
    }
    if (st?.restoreInspector || st?.restoreResearchSelection) {
      hasRestoredPageStateRef.current = true
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

  const selectedRowData =
    selectedRowIndex != null && content
      ? content[1 + selectedRowIndex] ?? null
      : null

  const researchAiContext = buildResearchInspectorContext(headers, selectedRowData, previewScrapedData)
  const researchAiSessionLabel = (() => {
    const primary = selectedRowData?.[0]
    const label =
      primary != null && String(primary).trim()
        ? String(primary).trim()
        : `Row ${(selectedRowIndex ?? 0) + 1}`
    return `Research · ${label.slice(0, 100)}`
  })()
  const researchAiTabRowKey = activeTab?.fileId
    ? `file:${activeTab.fileId}:row:${selectedRowIndex ?? 0}`
    : `tab:${effectiveTabId ?? 'sheet'}:row:${selectedRowIndex ?? 0}`

  return (
    <div
      className={`bg-[#f8f9fb] text-slate-900 ${isInspectorOpen ? 'flex h-[calc(100vh-3.5rem)] overflow-hidden' : 'min-h-full'}`}
    >
      {deleteConfirm != null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {deleteConfirm === 'rows' ? (
              <>
                <h2 id="delete-confirm-title" className="text-sm font-semibold text-gray-900">
                  Delete selected row{selectedRows.size === 1 ? '' : 's'}?
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  You are about to delete {selectedRows.size} row{selectedRows.size === 1 ? '' : 's'}. This cannot be
                  undone.
                </p>
              </>
            ) : deleteConfirm === 'columns' ? (
              <>
                <h2 id="delete-confirm-title" className="text-sm font-semibold text-gray-900">
                  Delete selected column{selectedColumns.size === 1 ? '' : 's'}?
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  You are about to delete {selectedColumns.size} column
                  {selectedColumns.size === 1 ? '' : 's'} from the sheet. This cannot be undone.
                </p>
              </>
            ) : (
              (() => {
                const _exhaustive: never = deleteConfirm
                return _exhaustive
              })()
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteConfirm === 'rows') confirmDeleteSelectedRows()
                  else if (deleteConfirm === 'columns') confirmDeleteSelectedColumns()
                  else {
                    const _exhaustive: never = deleteConfirm
                    return _exhaustive
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {comparePreviewModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-[2px] sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="compare-preview-title"
          onClick={(e) => e.target === e.currentTarget && setComparePreviewModalOpen(false)}
        >
          <div
            className="flex h-[min(90vh,calc(100dvh-2rem))] max-h-[min(90vh,calc(100dvh-2rem))] min-h-0 w-full max-w-[min(120rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 bg-gradient-to-r from-slate-50 via-white to-emerald-50/30 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60"
                  aria-hidden
                >
                  <GitCompare className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <h2 id="compare-preview-title" className="text-base font-semibold tracking-tight text-slate-900">
                    Compare preview
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {comparisonItems.length === 0
                      ? 'No sources loaded'
                      : comparisonItems.length === 1
                        ? '1 source — review fields below'
                        : `${comparisonItems.length} sources — scroll vertically for fields, horizontally for vendors`}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {comparisonItems.length >= 2 && (
                  <div
                    className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
                    role="group"
                    aria-label="Comparison layout"
                  >
                    <button
                      type="button"
                      onClick={() => setComparePreviewLayout('matrix')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        comparePreviewLayout === 'matrix'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Table2 className="h-3.5 w-3.5" aria-hidden />
                      Matrix
                    </button>
                    <button
                      type="button"
                      onClick={() => setComparePreviewLayout('cards')}
                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        comparePreviewLayout === 'cards'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
                      Cards
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setComparePreviewModalOpen(false)}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/80 hover:text-slate-900"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50/40 p-3 sm:p-4">
              {comparisonItems.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  No items to compare.
                </p>
              ) : comparePreviewLayout === 'matrix' && comparisonItems.length >= 2 ? (
                <div
                  className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-xl border border-slate-200/90 bg-white shadow-sm [-webkit-overflow-scrolling:touch]"
                  role="region"
                  aria-label="Side-by-side field comparison"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50/90 px-3 py-2">
                    <span className="text-[11px] text-slate-600">
                      Use the arrow beside each field to minimize or expand that row.
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCompareMatrixCollapsedFields(new Set())}
                        className="rounded-md px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Expand all
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCompareMatrixCollapsedFields(new Set(comparePreviewLabels))
                        }
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        Minimize all
                      </button>
                    </div>
                  </div>
                  <table className="w-max min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/95">
                        <th
                          scope="col"
                          className="sticky top-0 left-0 z-30 min-w-[140px] max-w-[200px] border-r border-slate-200 bg-slate-50/95 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] sm:min-w-[160px]"
                        >
                          Field
                        </th>
                        {comparisonItems.map((item) => {
                          const thumb = item.imageUrl ?? extractImageFromSpecs(item.specs)
                          return (
                            <th
                              key={item.id}
                              scope="col"
                              className="sticky top-0 z-20 min-w-[200px] max-w-[280px] border-r border-slate-100 bg-slate-50/95 px-3 py-3 align-top shadow-[0_1px_0_0_rgb(226_232_240)] last:border-r-0 sm:min-w-[220px]"
                            >
                              <div className="flex flex-col gap-2">
                                {thumb ? (
                                  <div className="mx-auto h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                    <img
                                      src={thumb}
                                      alt={item.title ? `${item.title} — preview` : 'Product preview'}
                                      className="h-full w-full object-contain"
                                      loading="lazy"
                                    />
                                  </div>
                                ) : null}
                                <div className="min-w-0 text-center">
                                  <div className="line-clamp-2 text-xs font-semibold leading-snug text-slate-900">
                                    {item.title || '—'}
                                  </div>
                                  {item.sourceName != null && item.sourceName !== '' && (
                                    <div className="mt-1 truncate text-[11px] text-emerald-700">{item.sourceName}</div>
                                  )}
                                </div>
                              </div>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {comparePreviewLabels.map((label, rowIdx) => {
                        const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'
                        const collapsed = compareMatrixCollapsedFields.has(label)
                        return (
                          <tr key={label} className={`border-b border-slate-100/80 ${rowBg}`}>
                            <th
                              scope="row"
                              className={`sticky left-0 z-10 max-w-[200px] border-r border-slate-200 px-2 py-1.5 text-left text-xs font-medium text-slate-600 shadow-[2px_0_8px_-2px_rgba(15,23,42,0.06)] sm:px-3 ${rowBg}`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setCompareMatrixCollapsedFields((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(label)) next.delete(label)
                                    else next.add(label)
                                    return next
                                  })
                                }
                                className="flex w-full min-w-0 items-start gap-1.5 rounded-md py-0.5 text-left text-slate-700 hover:bg-slate-200/50"
                                aria-expanded={!collapsed}
                                aria-label={
                                  collapsed ? `Expand field row: ${label}` : `Minimize field row: ${label}`
                                }
                              >
                                {collapsed ? (
                                  <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                                ) : (
                                  <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                                )}
                                <span className="min-w-0 break-words leading-snug">{label}</span>
                              </button>
                            </th>
                            {comparisonItems.map((item) => {
                              const v = specValueForLabel(item, label)
                              const display = v.trim() === '' ? '—' : v
                              return (
                                <td
                                  key={`${item.id}-${label}`}
                                  className={`max-w-[280px] border-r border-slate-100 px-3 align-top text-slate-800 last:border-r-0 ${rowBg} ${
                                    collapsed ? 'py-1.5' : 'py-2.5'
                                  }`}
                                >
                                  {collapsed ? (
                                    <span className="text-xs text-slate-400" aria-hidden>
                                      …
                                    </span>
                                  ) : (
                                    <span
                                      className="line-clamp-6 break-words text-sm leading-snug"
                                      title={display}
                                    >
                                      {display}
                                    </span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div
                  className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]"
                  role="region"
                  aria-label="Source cards comparison"
                >
                  <div
                    className={`mx-auto grid w-full max-w-full gap-4 pb-1 ${
                      comparisonItems.length === 1
                        ? 'grid-cols-1'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                    }`}
                  >
                  {comparisonItems.map((item) => {
                    const thumb = item.imageUrl ?? extractImageFromSpecs(item.specs)
                    return (
                      <article
                        key={item.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-900/5"
                      >
                        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-slate-50/80 to-white px-3 py-3">
                          {thumb ? (
                            <div className="mb-2 flex justify-center">
                              <div className="h-24 w-24 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <img
                                  src={thumb}
                                  alt={item.title ? `${item.title} — preview` : 'Product preview'}
                                  className="h-full w-full object-contain"
                                  loading="lazy"
                                />
                              </div>
                            </div>
                          ) : null}
                          <h3 className="text-center text-sm font-semibold leading-snug text-slate-900">
                            {item.title || '—'}
                          </h3>
                          {item.sourceName != null && item.sourceName !== '' && (
                            <p className="mt-1 text-center text-[11px] font-medium text-emerald-700">
                              {item.sourceName}
                            </p>
                          )}
                        </div>
                        <dl className="min-w-0 space-y-2.5 p-3">
                          {item.specs.map((spec, idx) => (
                            <div key={`${item.id}-${spec.label}-${idx}`} className="min-w-0 border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                              <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                {spec.label}
                              </dt>
                              <dd className="mt-0.5 break-words text-sm text-slate-800">{spec.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    )
                  })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <p className="text-xs text-slate-500">
                {comparisonItems.length > 0 && (
                  <>
                    <span className="font-medium text-slate-700">{comparisonItems.length}</span> source
                    {comparisonItems.length === 1 ? '' : 's'} in preview
                  </>
                )}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setComparePreviewModalOpen(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setComparePreviewModalOpen(false)
                    const base =
                      comparePreviewNavigateStateRef.current != null &&
                      typeof comparePreviewNavigateStateRef.current === 'object'
                        ? (comparePreviewNavigateStateRef.current as Record<string, unknown>)
                        : { returnTo: '/research' }
                    navigate(RESEARCH_COMPARE_PATH, {
                      state: {
                        ...base,
                        initialComparisonItems:
                          (base.initialComparisonItems as ComparisonItem[] | undefined) ??
                          comparisonItems,
                      },
                    })
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
                >
                  Open full Compare
                  <GitCompare className="h-4 w-4 opacity-90" aria-hidden />
                </button>
              </div>
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
              placeholder="Describe in natural language what you want to extract from each search result"
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
                disabled={storeSelectionLoading}
                onClick={() => void runSelectedResearch(researchAiQueryInput)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {storeSelectionLoading && <LoaderIcon className="h-4 w-4 shrink-0" />}
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
            ? 'flex h-[calc(100vh-3.5rem)] min-w-0 flex-1 flex-col overflow-hidden'
            : 'flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden'
        }
      >
      <div className="shrink-0 border-b border-gray-200 bg-white px-5 pb-0 pt-3">
        <h1 className="mb-2.5 text-[17px] font-semibold text-gray-900">Data Research</h1>
      </div>

      {/* Unified header: tabs + toolbar in one container, flush full-width.
          z-30 keeps toolbar dropdowns above the sheet (sticky thead is z-10). */}
      <div className="relative z-30 shrink-0 border-b border-gray-200 bg-white">
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

      {loading && (
        <p className="px-4 pb-1 text-sm text-slate-500">Loading file…</p>
      )}
      {error && (
        <p className="px-4 pb-1 text-sm text-rose-600">{error}</p>
      )}

      {/* Toolbar */}
      <div className="relative z-20 flex max-w-full flex-nowrap items-center gap-3 overflow-visible border-t border-gray-200 bg-[#f8f9fb] px-4 py-2">
        <ResearchToolbarGroup label="View">
          <button
            ref={hideFieldsBtnRef}
            type="button"
            disabled={!content?.[0]}
            onClick={() => {
              if (!content?.[0]) return
              setHideFieldsOpen((o) => !o)
              setGroupMenuOpen(false)
              setSortMenuOpen(false)
              setDensityMenuOpen(false)
              setFilterOpen(false)
              setAddColumnOpen(false)
            }}
            className={researchToolbarBtnClass(hideFieldsOpen, !content?.[0])}
            aria-label="Hide fields"
          >
            <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
            <ResearchToolbarTooltip label="Hide fields" />
          </button>
          {hideFieldsOpen &&
            content?.[0] &&
            createPortal(
              <div
                ref={hideFieldsDropRef}
                style={{
                  position: 'fixed',
                  zIndex: 9999,
                  top: (hideFieldsBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: Math.min(
                    Math.max(8, hideFieldsBtnRef.current?.getBoundingClientRect().left ?? 8),
                    typeof window !== 'undefined'
                      ? window.innerWidth - Math.min(320, window.innerWidth - 16) - 8
                      : 8
                  ),
                  width: typeof window !== 'undefined' ? Math.min(320, window.innerWidth - 16) : 320,
                }}
                className="rounded-xl border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5"
              >
                <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Visible columns
                </p>
                <div className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
                  {headers.map((h, colIdx) => {
                    const name = (h || `Column ${colIdx + 1}`).trim()
                    const visible = !hiddenColumns.has(colIdx)
                    return (
                      <label
                        key={colIdx}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={visible}
                          onChange={() => {
                            setHiddenColumns((prev) => {
                              const next = new Set(prev)
                              if (next.has(colIdx)) next.delete(colIdx)
                              else next.add(colIdx)
                              return next
                            })
                          }}
                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                        />
                        <span className="truncate text-slate-700" title={name}>
                          {name}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>,
              document.body
            )}

          <button
            ref={filterBtnRef}
            type="button"
            disabled={!content?.[0]}
            onClick={() => {
              if (!content?.[0]) return
              setFilterOpen((f) => !f)
              setHideFieldsOpen(false)
              setGroupMenuOpen(false)
              setSortMenuOpen(false)
              setDensityMenuOpen(false)
              setAddColumnOpen(false)
            }}
            className={researchToolbarBtnClass(hasActiveColumnFilters, !content?.[0])}
            aria-label={
              hasActiveColumnFilters ? `Filtered by ${filterSummaryLabels.join(', ')}` : 'Filter'
            }
          >
            <Filter className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
            <ResearchToolbarTooltip
              label={
                hasActiveColumnFilters ? `Filtered by ${filterSummaryLabels.join(', ')}` : 'Filter'
              }
            />
          </button>
          {filterOpen &&
            content?.[0] &&
            createPortal(
              <div
                ref={filterDropRef}
                style={{
                  position: 'fixed',
                  zIndex: 9999,
                  top: (filterBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: Math.min(
                    filterBtnRef.current?.getBoundingClientRect().left ?? 0,
                    window.innerWidth - 420
                  ),
                }}
                className="min-w-[min(26rem,calc(100vw-1rem))] max-w-[32rem] rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-slate-950/5"
              >
                <ResearchSheetFilterBuilder
                  headers={headers}
                  items={filterBuilderItems}
                  onChange={(next) => {
                    setFilterBuilderItems(next)
                    setPage(1)
                  }}
                  getDistinctColumnValues={getDistinctColumnValues}
                />
                {hasActiveColumnFilters && (
                  <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterBuilderItems(defaultFilterBuilderItems())
                        setPage(1)
                      }}
                      className="text-[11px] font-medium text-red-600 hover:text-red-700"
                    >
                      Clear all filters
                    </button>
                  </div>
                )}
              </div>,
              document.body
            )}

          <button
            ref={groupMenuBtnRef}
            type="button"
            disabled={!content?.[0]}
            onClick={() => {
              if (!content?.[0]) return
              setGroupMenuOpen((o) => !o)
              setHideFieldsOpen(false)
              setSortMenuOpen(false)
              setDensityMenuOpen(false)
              setFilterOpen(false)
              setAddColumnOpen(false)
            }}
            className={researchToolbarBtnClass(groupByCol != null, !content?.[0])}
            aria-label="Group"
          >
            <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <ResearchToolbarTooltip label="Group" />
          </button>
          {groupMenuOpen &&
            content?.[0] &&
            createPortal(
              <div
                ref={groupMenuDropRef}
                style={{
                  position: 'fixed',
                  zIndex: 9999,
                  top: (groupMenuBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: Math.min(
                    Math.max(8, groupMenuBtnRef.current?.getBoundingClientRect().left ?? 8),
                    typeof window !== 'undefined' ? window.innerWidth - 240 - 8 : 8
                  ),
                  width: 240,
                }}
                className="rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-950/5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setGroupByCol(null)
                    setGroupMenuOpen(false)
                  }}
                  className="flex w-full px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                >
                  Don&apos;t group
                </button>
                <div className="my-1 border-t border-slate-100" />
                {headers.map((h, colIdx) => {
                  const label = (h || `Column ${colIdx + 1}`).trim()
                  return (
                    <button
                      key={colIdx}
                      type="button"
                      onClick={() => {
                        setGroupByCol(colIdx)
                        setGroupMenuOpen(false)
                      }}
                      className={`flex w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                        groupByCol === colIdx ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>,
              document.body
            )}

          <button
            ref={sortMenuBtnRef}
            type="button"
            disabled={!content?.[0]}
            onClick={() => {
              if (!content?.[0]) return
              setSortMenuOpen((o) => !o)
              setHideFieldsOpen(false)
              setGroupMenuOpen(false)
              setDensityMenuOpen(false)
              setFilterOpen(false)
              setAddColumnOpen(false)
            }}
            className={researchToolbarBtnClass(sortCol != null, !content?.[0])}
            aria-label="Sort"
          >
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <ResearchToolbarTooltip label="Sort" />
          </button>
          {sortMenuOpen &&
            content?.[0] &&
            createPortal(
              <div
                ref={sortMenuDropRef}
                style={{
                  position: 'fixed',
                  zIndex: 9999,
                  top: (sortMenuBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: Math.min(
                    Math.max(8, sortMenuBtnRef.current?.getBoundingClientRect().left ?? 8),
                    typeof window !== 'undefined' ? window.innerWidth - 240 - 8 : 8
                  ),
                  width: 240,
                }}
                className="rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-950/5"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSortCol(null)
                    setSortDir('asc')
                    setSortMenuOpen(false)
                  }}
                  className="flex w-full px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-50"
                >
                  Clear sort
                </button>
                <div className="my-1 border-t border-slate-100" />
                {headers.map((h, colIdx) => {
                  const label = (h || `Column ${colIdx + 1}`).trim()
                  const active = sortCol === colIdx
                  return (
                    <button
                      key={colIdx}
                      type="button"
                      onClick={() => {
                        if (sortCol === colIdx) {
                          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                        } else {
                          setSortCol(colIdx)
                          setSortDir('asc')
                        }
                        setSortMenuOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                        active ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{label}</span>
                      {active && (
                        <span className="shrink-0 text-[10px] text-slate-500">
                          {sortDir === 'asc' ? 'A→Z' : 'Z→A'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>,
              document.body
            )}

          <button
            ref={densityMenuBtnRef}
            type="button"
            onClick={() => {
              setDensityMenuOpen((o) => !o)
              setHideFieldsOpen(false)
              setGroupMenuOpen(false)
              setSortMenuOpen(false)
              setFilterOpen(false)
              setAddColumnOpen(false)
            }}
            className="group relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-gray-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Row height"
          >
            <RowHeightIcon className="h-4 w-4" />
            <ResearchToolbarTooltip label="Row height" />
          </button>
          {densityMenuOpen &&
            createPortal(
              <div
                ref={densityMenuDropRef}
                style={{
                  position: 'fixed',
                  zIndex: 9999,
                  top: (densityMenuBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: (() => {
                    const w = typeof window !== 'undefined' ? window.innerWidth : 800
                    const panel = 192
                    const r = densityMenuBtnRef.current?.getBoundingClientRect()
                    const alignRight = Math.max(8, (r?.right ?? panel) - panel)
                    return Math.min(alignRight, w - panel - 8)
                  })(),
                  width: 192,
                }}
                className="rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-950/5"
              >
                {(
                  [
                    { id: 'compact' as const, label: 'Compact' },
                    { id: 'default' as const, label: 'Default' },
                    { id: 'comfortable' as const, label: 'Comfortable' },
                  ] as const
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setRowDensity(id)
                      setDensityMenuOpen(false)
                    }}
                    className={`flex w-full px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                      rowDensity === id ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>,
              document.body
            )}
        </ResearchToolbarGroup>

        <ResearchToolbarDivider />

        <ResearchToolbarGroup label="Columns">
          <button
            ref={addColumnBtnRef}
            type="button"
            disabled={!content}
            onClick={() => {
              if (!content) return
              setAddColumnOpen((o) => !o)
              setAddColumnNameDraft('')
              setHideFieldsOpen(false)
              setGroupMenuOpen(false)
              setSortMenuOpen(false)
              setDensityMenuOpen(false)
              setFilterOpen(false)
            }}
            className={researchToolbarBtnClass(addColumnOpen, !content)}
            aria-label="Add column"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <ResearchToolbarTooltip label="Add column" />
          </button>
          {addColumnOpen &&
            createPortal(
              <div
                ref={addColumnDropRef}
                style={{
                  position: 'fixed',
                  zIndex: 9999,
                  top: (addColumnBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                  left: Math.min(
                    Math.max(8, addColumnBtnRef.current?.getBoundingClientRect().left ?? 8),
                    typeof window !== 'undefined' ? window.innerWidth - 260 - 8 : 8
                  ),
                  width: 260,
                }}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg ring-1 ring-slate-950/5"
              >
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  New column
                </p>
                <input
                  ref={addColumnInputRef}
                  type="text"
                  value={addColumnNameDraft}
                  onChange={(e) => setAddColumnNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addSheetColumn(addColumnNameDraft)
                    }
                  }}
                  placeholder={`Column ${(content?.[0]?.length ?? 0) + 1}`}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                <div className="mt-2.5 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setAddColumnOpen(false)
                      setAddColumnNameDraft('')
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => addSheetColumn(addColumnNameDraft)}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Add
                  </button>
                </div>
              </div>,
              document.body
            )}

          <button
            type="button"
            onClick={removeSelectedColumns}
            disabled={selectedColumns.size === 0}
            className={researchToolbarBtnClass(selectedColumns.size > 0, selectedColumns.size === 0)}
            aria-label={
              selectedColumns.size === 0
                ? 'Select column(s) in the header to remove'
                : 'Delete column'
            }
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <ResearchToolbarTooltip
              label={
                selectedColumns.size === 0
                  ? 'Select column(s) to delete'
                  : 'Delete column'
              }
            />
          </button>
        </ResearchToolbarGroup>

        <ResearchToolbarDivider />

        <ResearchToolbarGroup label="Selection actions">
          <button
            type="button"
            onClick={() => {
              setToolbarActive('selected')
              if (!content || selectedColumns.size === 0 || selectedRows.size === 0) {
                showToast(
                  selectedColumns.size === 0 && selectedRows.size === 0
                    ? 'Select at least one column and one row first'
                    : selectedColumns.size === 0
                      ? 'Select at least one column first'
                      : 'Select at least one row first'
                )
                return
              }
              setResearchAiQueryInput(
                'Product Image, Product description, Vendor name, Price, Product details, Delivery, Location, Contact'
              )
              setResearchFieldsPopupOpen(true)
            }}
            disabled={
              !content ||
              selectedColumns.size === 0 ||
              selectedRows.size === 0 ||
              storeSelectionLoading
            }
            className={`${researchToolbarBtnClass(
              toolbarActive === 'selected' && selectedColumns.size > 0 && selectedRows.size > 0,
              !content ||
                selectedColumns.size === 0 ||
                selectedRows.size === 0 ||
                storeSelectionLoading
            )} ${
              toolbarActive === 'selected' && selectedColumns.size > 0 && selectedRows.size > 0
                ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700'
                : ''
            }`}
            aria-label={
              storeSelectionLoading
                ? `Researching… ${researchProgress}%`
                : selectedColumns.size === 0 || selectedRows.size === 0
                  ? 'Select column(s) and row(s) first'
                  : 'Research Selected'
            }
          >
            {storeSelectionLoading && (
              <span
                className="pointer-events-none absolute inset-0 overflow-hidden rounded-[4px]"
                aria-hidden
              >
                <span
                  className={`absolute inset-y-0 left-0 transition-[width] duration-300 ease-out ${
                    toolbarActive === 'selected' ? 'bg-white/25' : 'bg-blue-500/20'
                  }`}
                  style={{ width: `${researchProgress}%` }}
                />
              </span>
            )}
            <span className="relative z-[1] inline-flex items-center justify-center">
              {storeSelectionLoading ? (
                <LoaderIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
            </span>
            <ResearchToolbarTooltip
              label={
                storeSelectionLoading
                  ? `Researching… ${researchProgress}%`
                  : selectedColumns.size === 0 || selectedRows.size === 0
                    ? 'Select column(s) and row(s) first'
                    : 'Research Selected'
              }
            />
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
              setInspectorCompareSelection(new Set())
              setCollapseSidebarForInspector(true)
            }}
            disabled={selectedRows.size === 0}
            className={researchToolbarBtnClass(false, selectedRows.size === 0)}
            aria-label={selectedRows.size === 0 ? 'Select a row first' : 'Preview Selected'}
          >
            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <ResearchToolbarTooltip
              label={selectedRows.size === 0 ? 'Select a row first' : 'Preview Selected'}
            />
          </button>

          <button
            type="button"
            onClick={() => {
              if (selectedRows.size === 0 || !content || !effectiveTabId) return
              const items = Array.from(selectedRows)
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
              openComparePreviewModal(items, {
                returnTo: '/research',
                restoreResearchSelection: {
                  selectedRows: Array.from(selectedRows),
                  activeTabId: effectiveTabId,
                  page: currentPage,
                  rowsPerPage,
                },
              })
            }}
            disabled={selectedRows.size === 0}
            className={researchToolbarBtnClass(false, selectedRows.size === 0)}
            aria-label={selectedRows.size === 0 ? 'Select rows first' : 'Compare Selected'}
          >
            <GitCompare className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <ResearchToolbarTooltip
              label={selectedRows.size === 0 ? 'Select rows first' : 'Compare Selected'}
            />
          </button>
        </ResearchToolbarGroup>

        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
            <input
              type="search"
              value={rowSearchDraft}
              onChange={(e) => setRowSearchDraft(e.target.value)}
              placeholder="Search rows…"
              className="w-[130px] border-0 bg-transparent text-xs text-gray-900 outline-none placeholder:text-gray-400 sm:w-[150px]"
            />
            {rowSearchDraft.trim() && (
              <button
                type="button"
                onClick={() => {
                  setRowSearchDraft('')
                  setRowSearchQuery('')
                  setPage(1)
                }}
                className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      </div>{/* end unified header */}

      {content && content.length > 0 && (
        <>
          <div className="relative z-0 flex min-h-0 flex-1 overflow-hidden bg-white">
            <div className="h-full w-full overflow-auto">
            <table className="min-w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#f8f9fb]">
                <tr className="border-b-2 border-gray-200">
                  {/* Row-number gutter */}
                  <th
                    className={`w-8 border-r border-slate-200 text-center ${rd.th} ${rd.thLabel} text-slate-400`}
                    aria-label="Row number"
                  />
                  <th className={`w-8 border-r border-slate-200 ${rd.th}`}>
                    <input
                      type="checkbox"
                      checked={viewRowIndices.length > 0 && viewRowIndices.every((i) => selectedRows.has(i))}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th
                    scope="col"
                    className={`w-[80px] shrink-0 border-r border-slate-200 text-left font-medium uppercase tracking-wide text-slate-500 ${rd.th} ${rd.thLabel}`}
                  >
                    Research
                  </th>
                  {visibleColIndices.map((i) => {
                    const cell = content[0][i] ?? ''
                    return (
                      <th key={i} scope="col" className={`border-r border-slate-200 last:border-r-0 ${rd.th}`}>
                        <div className="flex items-center gap-1.5">
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
                            className="mt-0.5 rounded border-slate-300"
                            title="Select column"
                            aria-label={`Select column ${cell || i + 1}`}
                          />
                          <input
                            value={cell}
                            onChange={(e) => updateCell(0, i, e.target.value)}
                            className={`w-full min-w-[80px] border-0 bg-transparent font-semibold uppercase tracking-wide text-slate-500 focus:ring-2 focus:ring-inset focus:ring-blue-500 ${rd.headInput}`}
                          />
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="bg-white">
                {sheetBodyItems.map((item) => {
                  if (item.kind === 'group') {
                    return (
                      <tr key={item.key} className="bg-blue-50/40">
                        <td
                          colSpan={3 + visibleColIndices.length}
                          className="border-b border-gray-200 px-3 py-1.5 text-[11px] font-semibold text-gray-700"
                        >
                          {item.label}
                        </td>
                      </tr>
                    )
                  }
                  const { dataRowIndex, row } = item
                  const isInspectorRow = isInspectorOpen && selectedRowIndex === dataRowIndex
                  const isRowChecked = selectedRows.has(dataRowIndex)
                  const isRowBeingResearched = researchingRowIndices.has(dataRowIndex)
                  const rowResearchSummary = researchRowSummaryByIndex.get(dataRowIndex)
                  const hasStructuredData = rowResearchSummary?.has_structured_data === true
                  const stripe = dataRowIndex % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fb]'
                  return (
                    <tr
                      key={dataRowIndex}
                      data-row-index={dataRowIndex}
                      className={`cursor-pointer border-b border-gray-200 border-l-[3px] transition-colors ${
                        isInspectorRow
                          ? 'border-l-blue-500 bg-[#f0f7ff]'
                          : isRowChecked
                            ? 'border-l-transparent bg-blue-50 hover:bg-blue-50'
                            : `border-l-transparent ${stripe} hover:bg-[#f0f4f9]`
                      }`}
                    >
                      <td
                        className={`w-8 select-none border-r border-slate-200 text-center align-middle text-slate-400 ${rd.tdNum}`}
                      >
                        {dataRowIndex + 1}
                      </td>
                      <td className={`w-8 border-r border-slate-200 align-middle ${rd.tdCb}`}>
                        <div className="flex items-center justify-center">
                          {isRowBeingResearched ? (
                            <LoaderIcon className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={selectedRows.has(dataRowIndex)}
                              onChange={() => toggleRowSelection(dataRowIndex)}
                              className="rounded border-slate-300"
                            />
                          )}
                        </div>
                      </td>
                      <td
                        className={`w-[80px] shrink-0 cursor-pointer border-r border-slate-200 align-middle transition-colors ${rd.tdResearch} ${
                          hasStructuredData ? 'hover:bg-blue-100/80' : 'hover:bg-slate-100'
                        }`}
                        title="Open inspector for this row"
                        onClick={() => handleCellClick(dataRowIndex)}
                      >
                        {hasStructuredData && rowResearchSummary ? (
                          <ResearchFoundBadge
                            count={rowResearchSummary.structured_sources_count}
                            onClick={() => handleCellClick(dataRowIndex)}
                          />
                        ) : (
                          <span className="font-mono text-[11px] text-gray-400">—</span>
                        )}
                      </td>
                      {visibleColIndices.map((colIndex, vi) => (
                        <td
                          key={colIndex}
                          className={`cursor-pointer border-r border-slate-200 p-0 ${vi === visibleColIndices.length - 1 ? 'last:border-r-0' : ''} ${rd.tdCell}`}
                          onClick={() => handleCellSelect(dataRowIndex)}
                          onDoubleClick={() => handleCellClick(dataRowIndex)}
                        >
                          <input
                            value={row[colIndex] ?? ''}
                            onChange={(e) => updateCell(dataRowIndex + 1, colIndex, e.target.value)}
                            className={`w-full min-w-[80px] border-0 bg-transparent text-gray-700 focus:ring-2 focus:ring-inset focus:ring-blue-500 ${rd.cellInput} ${
                              vi === 0 || /part|internal|mfr/i.test((headers[colIndex] ?? '').trim())
                                ? 'font-mono font-medium text-blue-700'
                                : ''
                            }`}
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
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-2">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={(e) => openAddRowPopover(e.currentTarget)}
                data-add-row-footer-btn
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                + Add row
              </button>
              <button
                type="button"
                onClick={removeSelectedRows}
                disabled={selectedRows.size === 0}
                title={selectedRows.size === 0 ? 'Select row(s) to remove' : 'Remove selected rows'}
                className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete row
              </button>
              <span className="text-sm text-slate-600">
                Showing {totalDataRows === 0 ? 0 : startRow + 1} to {endRow} of {totalDataRows}
                {hasRowSearch || hasActiveColumnFilters ? ` (filtered from ${unfilteredRowCount})` : ''} entries
              </span>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Rows per page
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                  className="rounded border border-slate-300 py-1 pl-2 pr-6 text-sm"
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
                className="h-8 w-8 rounded-md border border-gray-200 bg-white text-sm text-gray-900 disabled:text-gray-300"
              >
                &laquo;
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="h-8 w-8 rounded-md border border-gray-200 bg-white text-sm text-gray-900 disabled:text-gray-300"
              >
                &lsaquo;
              </button>
              <span className="px-2 text-xs text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 w-8 rounded-md border border-gray-200 bg-white text-sm text-gray-900 disabled:text-gray-300"
              >
                &rsaquo;
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="h-8 w-8 rounded-md border border-gray-200 bg-white text-sm text-gray-900 disabled:text-gray-300"
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
              className="shrink-0 w-1.5 cursor-col-resize border-l border-slate-200 bg-slate-100 transition-colors hover:bg-blue-100 active:bg-blue-200"
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
                : 'flex h-full min-h-0 shrink-0 animate-[slideInRight_0.2s_ease-out] flex-col overflow-hidden border-l border-slate-200 bg-white'
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
          <header className="flex shrink-0 flex-col border-b border-gray-200 bg-white">
            <div className="bg-slate-900 px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              {inspectorMode === 'single' && selectedRowData ? (
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[15px] font-semibold text-slate-100">
                      {String(selectedRowData[0] ?? '—')}
                    </span>
                    {selectedRowIndex != null && researchRowSummaryByIndex.get(selectedRowIndex) && (
                      <span className="rounded bg-blue-800 px-1.5 py-0.5 text-[10px] font-semibold text-blue-200">
                        {researchRowSummaryByIndex.get(selectedRowIndex)!.structured_sources_count} sources
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm text-slate-400">
                    {String(selectedRowData[1] ?? headers[1] ?? 'Row details')}
                  </p>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-100">Selected rows</p>
                  <p className="text-xs text-slate-400">Review and compare sheet rows</p>
                </div>
              )}
              <div className="flex shrink-0 items-center justify-end gap-1 self-start">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setInspectorMaximized((m) => !m)
                  }}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
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
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  title="Close panel"
                  aria-label="Close panel"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            </div>
            {inspectorMode === 'single' && selectedRowData && (
              <div className="flex flex-wrap gap-2 border-t border-gray-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedRowIndex == null || !effectiveTabId || !selectedRowData) return
                    const hasScraped = previewScrapedData != null && previewScrapedData.length > 0
                    if (hasScraped && inspectorScrapedSourceSelection.size === 0) {
                      showToast('Select at least one scraped source')
                      return
                    }
                    const navigateState = {
                      returnTo: '/research',
                      restoreInspector: {
                        mode: 'single' as const,
                        selectedRowIndex,
                        multiRowIndices: [] as number[],
                        compareSelection: [] as number[],
                      },
                    }
                    if (hasScraped) {
                      const scrapedItems = comparisonItemsFromScrapedSources(
                        previewScrapedData,
                        inspectorScrapedSourceSelection,
                        effectiveTabId,
                        selectedRowIndex
                      )
                      if (scrapedItems.length === 0) {
                        showToast('Select at least one scraped source')
                        return
                      }
                      openComparePreviewModal(scrapedItems, navigateState)
                    } else {
                      const title = String(selectedRowData[0] ?? '')
                      const specs = headers.map((label, i) => ({
                        label: (label || `Column ${i + 1}`).trim(),
                        value: String(selectedRowData[i] ?? '—'),
                      }))
                      openComparePreviewModal(
                        [
                          {
                            id: `${effectiveTabId}-${selectedRowIndex}`,
                            title,
                            imageUrl: null,
                            specs,
                          },
                        ],
                        navigateState
                      )
                    }
                  }}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Add to Bucket
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Copy row
                </button>
                <button
                  type="button"
                  onClick={() => setInspectorRowAiOpen((open) => !open)}
                  className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    inspectorRowAiOpen
                      ? 'border-sky-400 bg-sky-50 text-sky-900'
                      : 'border-sky-300 bg-white text-sky-800 hover:bg-sky-50'
                  }`}
                  title="Chat with AI about this row"
                  aria-pressed={inspectorRowAiOpen}
                >
                  <Bot className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  AI
                </button>
              </div>
            )}
          </header>
          <div className="flex flex-1 min-h-0 flex-col p-4">
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
            {selectedRowData || (inspectorMode === 'multi' && inspectorMultiRowIndices.length > 0) ? (
              <div className="space-y-4">
                {inspectorMode === 'multi' ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Selected rows</h3>
                        <p className="mt-0.5 text-xs text-slate-500">
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
                          const items = chosen
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
                          openComparePreviewModal(items, {
                            returnTo: '/research',
                            restoreInspector: {
                              mode: 'multi' as const,
                              selectedRowIndex,
                              multiRowIndices: inspectorMultiRowIndices,
                              compareSelection: chosen,
                            },
                            restoreResearchSelection: {
                              selectedRows: Array.from(selectedRows),
                              activeTabId: effectiveTabId,
                              page: currentPage,
                              rowsPerPage,
                            },
                          })
                        }}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${
                              checked ? 'border-blue-200 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
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
                              <p className="truncate text-sm font-semibold text-slate-900">{title || '—'}</p>
                              {sub && <p className="truncate text-xs text-slate-600">{headers[1] ? `${headers[1]}: ${sub}` : sub}</p>}
                            </div>
                            <button
                              type="button"
                              className="ml-auto text-xs font-medium text-slate-600 hover:text-slate-900"
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
                    {inspectorRowAiOpen && (
                      <ResearchRowAiChat
                        tabRowKey={researchAiTabRowKey}
                        researchContext={researchAiContext}
                        sessionLabel={researchAiSessionLabel}
                        onApplySheetUpdates={applySheetColumnUpdates}
                      />
                    )}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Structured data
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setResearchMoreOpen((o) => {
                                const next = !o
                                if (next && previewScrapedData?.length === 1) {
                                  setInspectorScrapedSourceSelection(new Set([0]))
                                }
                                return next
                              })
                              setAddStructuredColumnOpen(false)
                              if (!researchMorePrompt.trim()) {
                                setResearchMorePrompt(
                                  'Extract updated pricing, availability, product details, and any additional fields relevant to this product page.'
                                )
                              }
                            }}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                              researchMoreOpen
                                ? 'border-blue-400 bg-blue-50 text-blue-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title="Re-scrape the selected source with a custom prompt"
                          >
                            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Research more
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddStructuredColumnOpen((o) => !o)
                              setResearchMoreOpen(false)
                              setAddStructuredColumnSourceIdx(null)
                            }}
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                              addStructuredColumnOpen
                                ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                            title="Add a column to structured data and the sheet"
                          >
                            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            Add column
                          </button>
                          {previewScrapedData && previewScrapedData.length > 0 && (
                            <div className="flex rounded-lg border border-slate-200 p-0.5">
                              <button
                                type="button"
                                onClick={() => setStructuredDataViewType('row')}
                                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                  structuredDataViewType === 'row'
                                    ? 'bg-slate-200 text-slate-900'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Row
                              </button>
                              <button
                                type="button"
                                onClick={() => setStructuredDataViewType('column')}
                                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                                  structuredDataViewType === 'column'
                                    ? 'bg-slate-200 text-slate-900'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                Column
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {researchMoreOpen && selectedRowIndex != null && (
                        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                          <p className="text-xs font-medium text-blue-900">Research more — selected source only</p>
                          <p className="mt-0.5 text-[11px] text-blue-800/80">
                            Check exactly one source below. We re-scrape that URL only, merge updated fields, and add any
                            new columns.
                          </p>
                          {inspectorScrapedSourceSelection.size === 1 ? (
                            <p className="mt-1 truncate text-[11px] font-medium text-blue-900" title={previewScrapedData?.[Array.from(inspectorScrapedSourceSelection)[0]!]?.url ?? undefined}>
                              Target: Source {Array.from(inspectorScrapedSourceSelection)[0]! + 1}
                              {previewScrapedData?.[Array.from(inspectorScrapedSourceSelection)[0]!]?.url
                                ? ` · ${previewScrapedData[Array.from(inspectorScrapedSourceSelection)[0]!]!.url}`
                                : ''}
                            </p>
                          ) : (
                            <p className="mt-1 text-[11px] font-medium text-amber-800">
                              Select one source checkbox to continue
                              {inspectorScrapedSourceSelection.size > 1 ? ' (uncheck extras)' : ''}.
                            </p>
                          )}
                          <textarea
                            value={researchMorePrompt}
                            onChange={(e) => setResearchMorePrompt(e.target.value)}
                            rows={3}
                            placeholder="e.g. Get current price, warranty terms, and shipping ETA"
                            className="mt-2 w-full resize-y rounded-md border border-blue-200 bg-white px-2.5 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          />
                          <div className="mt-2 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setResearchMoreOpen(false)}
                              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={
                                researchMoreLoading ||
                                !researchMorePrompt.trim() ||
                                inspectorScrapedSourceSelection.size !== 1
                              }
                              onClick={() => void runResearchMoreOnSelectedSource()}
                              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {researchMoreLoading ? (
                                <LoaderIcon className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              )}
                              {researchMoreLoading ? 'Updating source…' : 'Update selected source'}
                            </button>
                          </div>
                        </div>
                      )}

                      {addStructuredColumnOpen && (
                        <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
                          <p className="text-xs font-medium text-emerald-900">Add column</p>
                          <p className="mt-0.5 text-[11px] text-emerald-800/80">
                            Adds a field to structured data
                            {addStructuredColumnSourceIdx != null
                              ? ` (source ${addStructuredColumnSourceIdx + 1})`
                              : ' (all sources)'}{' '}
                            and to the sheet for this row.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <input
                              value={addStructuredColumnName}
                              onChange={(e) => setAddStructuredColumnName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  addStructuredColumn(addStructuredColumnName, addStructuredColumnSourceIdx)
                                }
                              }}
                              placeholder="Column name (e.g. Warranty)"
                              className="min-w-[160px] flex-1 rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                addStructuredColumn(addStructuredColumnName, addStructuredColumnSourceIdx)
                              }
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Add
                            </button>
                          </div>
                        </div>
                      )}

                      {previewResultsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <LoaderIcon className="h-4 w-4 shrink-0" />
                          <span>Loading…</span>
                        </div>
                      ) : previewScrapedData && previewScrapedData.length > 0 ? (
                        <div className="space-y-4">
                          {previewScrapedData.map((item, idx) => {
                            const sourceAiOpen = inspectorSourceAiOpen.has(idx)
                            const sourceEditing = inspectorSourceEditOpen.has(idx)
                            const sourceSelected = inspectorScrapedSourceSelection.has(idx)
                            const sourceAiContext = buildResearchInspectorContext(
                              headers,
                              selectedRowData,
                              previewScrapedData,
                              { sourceIndex: idx, sourceOnly: true }
                            )
                            const sourceAiKey = `${researchAiTabRowKey}:source:${idx}`
                            const sourceAiLabel = `${researchAiSessionLabel} · Source ${idx + 1}`
                            return (
                            <div
                              key={item.id ?? idx}
                              className={`rounded-lg border p-3 ${
                                researchMoreOpen && sourceSelected
                                  ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-200'
                                  : sourceEditing
                                    ? 'border-amber-200 bg-amber-50/40'
                                    : 'border-slate-100 bg-slate-50/50'
                              }`}
                            >
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                              {item.url && (
                                <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1.5">
                                  <input
                                    type="checkbox"
                                    checked={inspectorScrapedSourceSelection.has(idx)}
                                    onChange={() => {
                                      setInspectorScrapedSourceSelection((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(idx)) next.delete(idx)
                                        else next.add(idx)
                                        return next
                                      })
                                    }}
                                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    aria-label={`Include source ${idx + 1} in comparison`}
                                  />
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-600 transition-colors hover:text-blue-600"
                                    title={item.url}
                                  >
                                    <span className="shrink-0 font-medium text-slate-400">Source {idx + 1}</span>
                                    <span className="min-w-0 truncate">{item.url}</span>
                                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
                                </div>
                              )}
                                </div>
                                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleInspectorSourceEdit(idx)}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                      sourceEditing
                                        ? 'border-amber-400 bg-amber-100 text-amber-950'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    }`}
                                    title={sourceEditing ? 'Finish editing this source' : 'Edit fields for this source'}
                                    aria-pressed={sourceEditing}
                                  >
                                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {sourceEditing ? 'Done' : 'Edit'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAddStructuredColumnSourceIdx(idx)
                                      setAddStructuredColumnOpen(true)
                                      setResearchMoreOpen(false)
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                    title="Add a column to this source"
                                  >
                                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    Column
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleInspectorSourceAi(idx)}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                      sourceAiOpen
                                        ? 'border-sky-400 bg-sky-100 text-sky-900'
                                        : 'border-sky-200 bg-white text-sky-800 hover:bg-sky-50'
                                    }`}
                                    title="Chat with AI about this source"
                                  >
                                    <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {sourceAiOpen ? 'Hide AI' : 'Ask AI'}
                                  </button>
                                </div>
                              </div>
                              {sourceAiOpen && (
                                <div className="mb-3">
                                  <ResearchRowAiChat
                                    compact
                                    tabRowKey={sourceAiKey}
                                    researchContext={sourceAiContext}
                                    sessionLabel={sourceAiLabel}
                                    onApplySheetUpdates={applySheetColumnUpdates}
                                  />
                                </div>
                              )}
                              <div className="overflow-x-auto">
                                {structuredDataViewType === 'row' ? (
                                  <table className="min-w-full text-sm">
                                    <tbody className="divide-y divide-gray-200">
                                      {Object.entries(item.data).map(([key, val]) => (
                                          <tr key={key}>
                                            <td className="py-1 pr-4 font-medium text-gray-500 align-top">
                                              {key.replace(/_/g, ' ')}
                                            </td>
                                            <td className="py-1 text-gray-900">
                                              <StructuredFieldCell
                                                fieldKey={key}
                                                val={val}
                                                editing={sourceEditing}
                                                onChange={(next) => updateScrapedField(idx, key, next)}
                                              />
                                            </td>
                                          </tr>
                                        ))}
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
                                        {Object.entries(item.data).map(([key, val]) => (
                                            <td key={key} className="px-3 py-1.5 text-gray-900 align-top">
                                              <StructuredFieldCell
                                                fieldKey={key}
                                                val={val}
                                                editing={sourceEditing}
                                                onChange={(next) => updateScrapedField(idx, key, next)}
                                              />
                                            </td>
                                          ))}
                                      </tr>
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm text-gray-500">
                            No data yet. Run &quot;Research Selected&quot; or use Research more with a prompt.
                          </p>
                          {selectedRowIndex != null && (
                            <button
                              type="button"
                              onClick={() => {
                                setResearchMoreOpen(true)
                                if (!researchMorePrompt.trim()) {
                                  setResearchMorePrompt(researchAiQueryInput)
                                }
                              }}
                              className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                            >
                              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              Research this row
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                Select a row in the table to preview its details here.
              </div>
            )}
            </div>
          </div>
        </aside>
        </>
      )}
    </div>
  )
}
