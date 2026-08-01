import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CompareVendorMindMapModel } from '@/components/compare/CompareVendorMindMap'
import { CompareInsightsPanel } from '@/components/compare/CompareInsightsPanel'
import { CompareMindMapPanel } from '@/components/compare/CompareMindMapPanel'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart2,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Filter,
  Heart,
  List,
  Map,
  Search,
  ShoppingCart,
  X,
  Zap,
} from 'lucide-react'

export type CompareDecisionRow = {
  id: string
  url: string
  vendor: string
  price: number | null
  priceLabel: string
  shipping: number | null
  shippingLabel: string
  availability: string
  rating: number | null
  ratingLabel: string
  delivery: string
  location: string
  contact: string
  rawData: Record<string, unknown>
}

export type ComparePartChip = {
  id: string
  label: string
  vendorCount: number
  selected: boolean
  inPortfolio?: boolean
}

export type CompareLoadedFile = {
  fileId: number
  name: string
}

type Props = {
  partLabel: string
  partCategory?: string
  rows: CompareDecisionRow[]
  filteredRows: CompareDecisionRow[]
  vendorFilter: string
  vendors: string[]
  onVendorFilterChange: (vendor: string) => void
  onlyAvailable: boolean
  onOnlyAvailableChange: (checked: boolean) => void
  minPrice: number
  maxPrice: number
  priceRange: [number, number]
  onPriceRangeChange: (next: [number, number]) => void
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onAddSelectedToBucket: () => void
  onCompareSelected: () => void
  onAddSingleToBucket: (id: string) => void
  availableFields: string[]
  selectedFields: string[]
  onSelectedFieldsChange: (fields: string[]) => void
  view: 'table' | 'insights' | 'mindmap'
  onViewChange: (next: 'table' | 'insights' | 'mindmap') => void
  mindMapModel: CompareVendorMindMapModel | null
  onSelectVendorFromMindMap: (vendor: string) => void
  onExportCSV?: () => void
  onSaveView?: () => void
  partChips?: ComparePartChip[]
  activePartId?: string | null
  onActivePartChange?: (id: string) => void
  onPartChipToggle?: (id: string) => void
  onClearPartSelection?: () => void
  selectedPartCount?: number
  fileName?: string
  onChangeFile?: () => void
  loadedFiles?: CompareLoadedFile[]
  activeFileId?: number | null
  onSelectFile?: (fileId: number) => void
  onRemoveFile?: (fileId: number) => void
}

function money(n: number | null, fallback: string): string {
  if (n == null || Number.isNaN(n)) return fallback
  return `$${n.toFixed(2)}`
}

function Tag({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: 'default' | 'blue' | 'green' | 'yellow'
}) {
  const styles = {
    default: 'border-slate-200 bg-slate-100 text-slate-600',
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    yellow: 'border-amber-200 bg-amber-50 text-amber-700',
  }[variant]
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium leading-[18px] border ${styles}`}>
      {children}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  let barColor = 'bg-slate-400'
  let textColor = 'text-slate-500'
  if (score >= 70) {
    barColor = 'bg-emerald-500'
    textColor = 'text-emerald-600'
  } else if (score >= 45) {
    barColor = 'bg-blue-500'
    textColor = 'text-blue-600'
  } else if (score >= 25) {
    barColor = 'bg-amber-500'
    textColor = 'text-amber-600'
  } else {
    barColor = 'bg-red-500'
    textColor = 'text-red-600'
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-[3px] w-12 overflow-hidden rounded-sm bg-slate-200">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <span className={`min-w-[18px] font-mono text-xs font-medium ${textColor}`}>{score}</span>
    </div>
  )
}

function DeliveryDot({ row }: { row: CompareDecisionRow }) {
  const d = (row.delivery || '').toLowerCase()
  const shipsToday = d.includes('today') || d.includes('same day')
  const inStock = /in stock|available|low stock/i.test(row.availability)
  const color = shipsToday ? 'bg-emerald-500' : inStock ? 'bg-amber-500' : 'bg-slate-300'
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
}

export function CompareDecisionWorkspace({
  partLabel,
  partCategory,
  rows,
  filteredRows,
  onlyAvailable,
  onOnlyAvailableChange,
  minPrice,
  maxPrice,
  priceRange,
  onPriceRangeChange,
  selectedIds,
  onToggleSelected,
  onAddSelectedToBucket,
  onCompareSelected,
  onAddSingleToBucket,
  availableFields,
  selectedFields,
  onSelectedFieldsChange,
  view,
  onViewChange,
  onExportCSV,
  onSaveView,
  partChips = [],
  activePartId,
  onActivePartChange,
  selectedPartCount = 0,
  fileName,
  onChangeFile,
  onPartChipToggle,
  onClearPartSelection,
  loadedFiles = [],
  activeFileId: activeWorkspaceFileId,
  onSelectFile,
  onRemoveFile,
}: Props) {
  const isEmpty = rows.length === 0

  const [showParts, setShowParts] = useState(true)
  const [partQ, setPartQ] = useState('')
  const [vendorSearch, setVendorSearch] = useState('')
  const [shipsToday, setShipsToday] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>('price')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [hoverRowId, setHoverRowId] = useState<string | null>(null)
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const fieldPickerRef = useRef<HTMLDivElement | null>(null)

  const allFields = useMemo(
    () =>
      availableFields
        .map((f) => f.trim())
        .filter(Boolean)
        .filter((f, i, arr) => arr.indexOf(f) === i),
    [availableFields]
  )
  useEffect(() => {
    const trimmedAll = new Set(allFields.map((f) => f.trim()).filter(Boolean))
    const cleaned = selectedFields.filter((f) => trimmedAll.has(f.trim()))
    if (cleaned.length !== selectedFields.length) onSelectedFieldsChange(cleaned)
  }, [allFields, selectedFields, onSelectedFieldsChange])

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (!fieldPickerOpen) return
      if (!fieldPickerRef.current?.contains(e.target as Node)) setFieldPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [fieldPickerOpen])

  const displayRows = useMemo(() => {
    let result = filteredRows
    if (vendorSearch.trim()) {
      const q = vendorSearch.trim().toLowerCase()
      result = result.filter((r) => r.vendor.toLowerCase().includes(q))
    }
    if (shipsToday) {
      result = result.filter((r) => {
        const d = (r.delivery || '').toLowerCase()
        return d.includes('today') || d.includes('same day')
      })
    }
    return result
  }, [filteredRows, vendorSearch, shipsToday])

  const sortedRows = useMemo(() => {
    const arr = [...displayRows]
    if (!sortKey) return arr
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'vendor') cmp = a.vendor.localeCompare(b.vendor)
      else if (sortKey === 'price') cmp = (a.price ?? Infinity) - (b.price ?? Infinity)
      else if (sortKey === 'score') cmp = (getScore(a) ?? -1) - (getScore(b) ?? -1)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [displayRows, sortKey, sortDir])

  const bestPrice = useMemo(() => {
    const prices = displayRows.map((r) => r.price).filter((n): n is number => n != null)
    return prices.length ? Math.min(...prices) : null
  }, [displayRows])

  const avgPrice = useMemo(() => {
    const prices = displayRows.map((r) => r.price).filter((n): n is number => n != null)
    return prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0
  }, [displayRows])

  const bestRow = useMemo(
    () => (bestPrice != null ? displayRows.find((r) => r.price === bestPrice) ?? null : null),
    [displayRows, bestPrice]
  )

  const saving = avgPrice > 0 && bestPrice != null ? avgPrice - bestPrice : 0
  const freeShipRow = displayRows.find((r) => r.shipping === 0)
  const totalVendorSources = rows.length

  const filtParts = useMemo(() => {
    if (!partQ.trim()) return partChips
    const q = partQ.trim().toLowerCase()
    return partChips.filter((p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
  }, [partChips, partQ])

  const activeChips = partChips.filter((p) => p.selected)
  const selectedChipCount = activeChips.length

  function getScore(row: CompareDecisionRow): number | null {
    if (row.rating != null && !Number.isNaN(row.rating)) return Math.round(row.rating)
    return null
  }

  function getVsAvg(row: CompareDecisionRow): number | null {
    if (row.price == null || !Number.isFinite(avgPrice) || avgPrice === 0) return null
    return ((row.price - avgPrice) / avgPrice) * 100
  }

  function getDeliverySub(row: CompareDecisionRow): string {
    if (row.shipping === 0) return 'Free shipping'
    if (row.shipping != null) return `+$${row.shipping.toFixed(2)} shipping`
    if (row.shippingLabel && row.shippingLabel !== '—') return row.shippingLabel
    return 'Shipping: TBD'
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'price' ? 'asc' : 'desc')
    }
  }

  function toggleAllRows() {
    if (selectedIds.size === sortedRows.length) {
      sortedRows.forEach((r) => {
        if (selectedIds.has(r.id)) onToggleSelected(r.id)
      })
    } else {
      sortedRows.forEach((r) => {
        if (!selectedIds.has(r.id)) onToggleSelected(r.id)
      })
    }
  }

  function handleExportCSV() {
    if (onExportCSV) {
      onExportCSV()
      return
    }
    const headers = ['Vendor', 'Price', 'VS Avg', 'Contact', 'Delivery', 'Score']
    const csvRows = [headers.join(',')]
    for (const row of sortedRows) {
      const vsAvg = getVsAvg(row)
      const score = getScore(row)
      csvRows.push(
        [
          `"${row.vendor.replace(/"/g, '""')}"`,
          row.price != null ? row.price.toFixed(2) : '',
          vsAvg != null ? `${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)}%` : '',
          `"${(row.contact || '').replace(/"/g, '""')}"`,
          `"${(row.delivery || '').replace(/"/g, '""')}"`,
          score != null ? String(score) : '',
        ].join(',')
      )
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${partLabel || 'compare'}_vendors.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function SortIcon({ field }: { field: string }) {
    if (sortKey !== field) return <ArrowUpDown className="h-2.5 w-2.5 text-slate-400" strokeWidth={1.75} />
    return sortDir === 'asc' ? (
      <ArrowUp className="h-2.5 w-2.5 text-blue-600" strokeWidth={2} />
    ) : (
      <ArrowDown className="h-2.5 w-2.5 text-blue-600" strokeWidth={2} />
    )
  }

  const maxPriceLimit = maxPrice > minPrice ? maxPrice : minPrice + 5000
  const priceSliderMax = Math.max(maxPriceLimit, priceRange[1], 100)

  const pageHeader = (
    <>
      <div className="-mx-4 border-b border-slate-200 bg-white px-6 py-4 sm:-mx-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-xl font-bold tracking-tight text-slate-900">Product Comparison</h1>
              {selectedPartCount != null && selectedPartCount > 0 && (
                <Tag variant="blue">
                  {selectedPartCount} part{selectedPartCount !== 1 ? 's' : ''} selected
                </Tag>
              )}
              {fileName && loadedFiles.length <= 1 && <Tag>{fileName}</Tag>}
            </div>
            {loadedFiles.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {loadedFiles.map((file) => {
                  const isActive = file.fileId === activeWorkspaceFileId
                  return (
                    <span
                      key={file.fileId}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-[5px] border px-2 py-0.5 text-[11px] font-medium ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                      onClick={() => onSelectFile?.(file.fileId)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelectFile?.(file.fileId)}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      {onRemoveFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveFile(file.fileId)
                          }}
                          className={`rounded px-0.5 leading-none ${isActive ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                          aria-label={`Remove ${file.name}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
            <p className="m-0 mt-1 text-[13px] text-slate-500">
              Compare vendors, pricing, and availability across your selected parts.
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {onChangeFile && (
              <button
                type="button"
                onClick={onChangeFile}
                className="rounded-[5px] border border-slate-200 bg-white px-2.5 py-[5px] text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Change file
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowParts((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-slate-200 bg-white px-2.5 py-[5px] text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              {showParts ? (
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {showParts ? 'Collapse' : 'Parts'}
            </button>
          </div>
        </div>
      </div>

      {showParts && (
        <div className="-mx-4 border-b border-slate-200 bg-white px-6 py-3.5 sm:-mx-6">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Select parts</span>
            <span className="text-[11px] text-slate-400">
              {filtParts.length} parts · {selectedChipCount} selected
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1 rounded-[5px] border border-slate-200 bg-slate-50 px-2 py-1">
              <Search className="h-2.5 w-2.5 text-slate-400" strokeWidth={2} />
              <input
                value={partQ}
                onChange={(e) => setPartQ(e.target.value)}
                placeholder="Filter…"
                className="w-[90px] border-0 bg-transparent text-xs text-slate-800 outline-none"
              />
            </div>
            {selectedChipCount > 0 && onClearPartSelection && (
              <button
                type="button"
                onClick={onClearPartSelection}
                className="inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2} />
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-[5px]">
            {filtParts.map((p) => {
              const isSel = p.selected
              const isAct = activePartId === p.id
              const hasRes = p.vendorCount > 0
              return (
                <button
                  key={p.id}
                  type="button"
                  title={p.label}
                  onClick={() => {
                    if (onPartChipToggle) onPartChipToggle(p.id)
                    else onActivePartChange?.(p.id)
                  }}
                  className={`inline-flex items-center gap-[5px] rounded-[5px] border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    isAct
                      ? 'border-blue-600 bg-blue-600 font-semibold text-white outline outline-1 outline-offset-1 outline-blue-200'
                      : isSel
                        ? 'border-slate-300 bg-slate-900 font-semibold text-white'
                        : p.inPortfolio
                          ? 'cursor-pointer border-emerald-300 bg-emerald-50 font-normal text-emerald-900 hover:border-emerald-400'
                          : hasRes
                            ? 'cursor-pointer border-slate-200 bg-white font-normal text-slate-700 hover:border-slate-300'
                            : 'cursor-default border-[#ededf0] bg-slate-50 font-normal text-slate-400'
                  }`}
                >
                  {isSel && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />}
                  <span className="font-semibold">{p.label}</span>
                  {hasRes && !isSel && (
                    <span className={`text-[10px] font-normal ${isAct ? 'text-blue-100' : 'text-slate-400'}`}>
                      {p.vendorCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {filtParts.length === 0 && (
            <p className="text-xs text-slate-500">No parts match the filter. Use Change file to load a parts list.</p>
          )}
        </div>
      )}
    </>
  )

  if (isEmpty) {
    return (
      <div className="flex flex-col">
        {pageHeader}
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800">No vendor data yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Select parts above with research results, or run Research to collect vendor pricing.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {pageHeader}

      <div className="flex flex-col gap-3 pt-4">
      {/* Part tabs + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {activeChips.length > 0 && (
          <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
            {activeChips.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onActivePartChange?.(p.id)}
                className={`rounded px-3 py-1 font-mono text-[11px] transition-colors ${
                  activePartId === p.id ? 'bg-slate-900 font-semibold text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {activeChips.length > 0 && <span className="text-slate-300">·</span>}
        <span className="text-sm text-slate-500">{partLabel}</span>
        {partCategory && <Tag>{partCategory}</Tag>}
        <div className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <Heart className="h-3.5 w-3.5" strokeWidth={1.75} />
          Wishlist
        </button>
        <button
          type="button"
          onClick={onAddSelectedToBucket}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <ShoppingCart className="h-3.5 w-3.5" strokeWidth={1.75} />
          Add to bucket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-4">
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Best price</p>
          <p className="truncate font-mono text-xl font-bold text-emerald-600">{money(bestPrice, '—')}</p>
          <p className="truncate text-[11px] text-slate-400">{bestRow?.vendor ?? '—'}</p>
        </div>
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Avg price</p>
          <p className="font-mono text-xl font-bold text-slate-900">
            {Number.isFinite(avgPrice) ? `$${avgPrice.toFixed(2)}` : '—'}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {saving > 0 ? `$${saving.toFixed(2)} above best` : 'At best price'}
          </p>
        </div>
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Vendors</p>
          <p className="font-mono text-xl font-bold text-slate-900">
            {displayRows.length} / {totalVendorSources}
          </p>
          <p className="text-[11px] text-slate-400">matching filters</p>
        </div>
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Free shipping</p>
          <p className={`truncate text-sm font-bold ${freeShipRow ? 'text-emerald-600' : 'text-slate-400'}`}>
            {freeShipRow ? freeShipRow.vendor : 'Not available'}
          </p>
          <p className="text-[11px] text-slate-400">{freeShipRow ? 'Qualifies' : 'No free ship'}</p>
        </div>
      </div>

      {/* Main card */}
      <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-3.5 py-2.5">
          <div className="mr-1.5 inline-flex gap-0.5">
            {(
              [
                { k: 'table' as const, Icon: List, label: 'Table' },
                { k: 'insights' as const, Icon: BarChart2, label: 'Insights' },
                { k: 'mindmap' as const, Icon: Map, label: 'Mind map' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => onViewChange(t.k)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  view === t.k ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <t.Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t.label}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
            <Search className="h-3 w-3 text-slate-400" strokeWidth={2} />
            <input
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              placeholder="Filter vendors…"
              className="w-32 border-0 bg-transparent text-xs text-slate-800 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShipsToday((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              shipsToday ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Zap className="h-3 w-3" strokeWidth={1.75} />
            Ships today
          </button>
          <button
            type="button"
            onClick={() => onOnlyAvailableChange(!onlyAvailable)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              onlyAvailable ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Check className="h-3 w-3" strokeWidth={1.75} />
            In stock
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((f) => !f)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              showFilters ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-3 w-3" strokeWidth={1.75} />
            Filters
          </button>
          <div className="relative" ref={fieldPickerRef}>
            <button
              type="button"
              onClick={() => setFieldPickerOpen((v) => !v)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Fields ({selectedFields.length > 0 ? selectedFields.length : allFields.length})
            </button>
            {fieldPickerOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5">
                <input
                  type="search"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields…"
                  className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                />
                <div className="mb-2 flex justify-between px-1 text-[11px] text-slate-500">
                  <button type="button" onClick={() => onSelectedFieldsChange(allFields)} className="hover:text-slate-700">
                    Select all
                  </button>
                  <button type="button" onClick={() => onSelectedFieldsChange([])} className="hover:text-slate-700">
                    Clear
                  </button>
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {allFields
                    .filter((f) =>
                      fieldSearch.trim() ? f.toLowerCase().includes(fieldSearch.trim().toLowerCase()) : true
                    )
                    .map((field) => (
                      <label key={field} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(field)}
                          onChange={(e) =>
                            onSelectedFieldsChange(
                              e.target.checked
                                ? [...selectedFields, field]
                                : selectedFields.filter((v) => v !== field)
                            )
                          }
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span className="truncate text-slate-700">{field}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400">
            {displayRows.length} vendor{displayRows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-3.5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filters</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Max price</span>
              <input
                type="range"
                min={minPrice}
                max={priceSliderMax}
                step={10}
                value={priceRange[1]}
                onChange={(e) => onPriceRangeChange([priceRange[0], Number(e.target.value)])}
                className="w-24 accent-blue-600"
              />
              <span className="min-w-[60px] font-mono text-xs font-medium text-slate-700">
                {priceRange[1] >= priceSliderMax ? 'No limit' : `$${priceRange[1]}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onOnlyAvailableChange(false)
                setShipsToday(false)
                onPriceRangeChange([minPrice, maxPrice])
                setVendorSearch('')
              }}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
            >
              Reset all
            </button>
          </div>
        )}

        {/* Selection bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-3.5 py-1.5">
            <span className="text-xs font-semibold text-blue-800">{selectedIds.size} selected</span>
            <div className="h-3.5 w-px bg-blue-200" />
            <button
              type="button"
              onClick={onAddSelectedToBucket}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
            >
              <ShoppingCart className="h-3 w-3" />
              Add to bucket
            </button>
            <button
              type="button"
              onClick={onCompareSelected}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
            >
              Compare
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                selectedIds.forEach((id) => onToggleSelected(id))
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        {view === 'table' && (
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[700px] table-fixed border-collapse">
              <thead className="sticky top-0 z-[5] bg-slate-50">
                <tr>
                  <th className="h-9 w-10 border-b border-slate-200 pl-3.5">
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < sortedRows.length
                      }}
                      checked={selectedIds.size === sortedRows.length && sortedRows.length > 0}
                      onChange={toggleAllRows}
                      className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                    />
                  </th>
                  {(
                    [
                      { label: 'Vendor', key: 'vendor', w: '27%' },
                      { label: 'Score', key: 'score', w: '13%' },
                      { label: 'Price', key: 'price', w: '11%' },
                      { label: 'vs Avg', key: null, w: '9%' },
                      { label: 'Contact', key: null, w: '14%' },
                      { label: 'Delivery', key: null, w: '18%' },
                    ] as const
                  ).map((col) => (
                    <th
                      key={col.label}
                      className="h-9 cursor-pointer select-none border-b border-slate-200 px-3.5 text-left"
                      style={col.w ? { width: col.w } : undefined}
                      onClick={col.key ? () => toggleSort(col.key) : undefined}
                    >
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${
                          sortKey === col.key ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      >
                        {col.label}
                        {col.key && <SortIcon field={col.key} />}
                      </span>
                    </th>
                  ))}
                  <th className="h-9 w-[90px] border-b border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="py-12 text-center">
                        <AlertCircle className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">No vendors match current filters</p>
                        <p className="text-xs text-slate-400">Adjust your search or clear filters</p>
                      </div>
                    </td>
                  </tr>
                )}
                {sortedRows.map((row) => {
                  const isSel = selectedIds.has(row.id)
                  const isHov = hoverRowId === row.id
                  const isBest = bestPrice != null && row.price === bestPrice
                  const vsAvg = getVsAvg(row)
                  const vsCol = vsAvg != null && vsAvg <= -5 ? 'text-emerald-600' : vsAvg != null && vsAvg >= 5 ? 'text-red-600' : 'text-slate-500'
                  const score = getScore(row)
                  const d = (row.delivery || '').toLowerCase()
                  const shipsTodayRow = d.includes('today') || d.includes('same day')

                  return (
                    <tr
                      key={row.id}
                      onMouseEnter={() => setHoverRowId(row.id)}
                      onMouseLeave={() => setHoverRowId(null)}
                      onClick={() => onToggleSelected(row.id)}
                      className={`cursor-pointer border-b border-slate-100 transition-colors ${
                        isSel ? 'bg-blue-50' : isHov ? 'bg-slate-50' : 'bg-white'
                      }`}
                    >
                      <td className="h-11 pl-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => onToggleSelected(row.id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                        />
                      </td>
                      <td className="h-11 px-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-500">
                            {row.vendor[0]?.toUpperCase() ?? '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="mb-0.5 flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-slate-800">{row.vendor}</span>
                              {isBest && <Tag variant="green">Best price</Tag>}
                              {shipsTodayRow && <Tag variant="blue">Ships today</Tag>}
                            </div>
                            <span className="text-[11px] text-slate-400">{getDeliverySub(row)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="h-11 px-3.5">
                        {score != null ? <ScoreBar score={score} /> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="h-11 px-3.5">
                        <span className={`font-mono text-[15px] font-bold ${isBest ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {money(row.price, '—')}
                        </span>
                      </td>
                      <td className="h-11 px-3.5">
                        {vsAvg != null ? (
                          <span className={`font-mono text-xs font-semibold ${vsCol}`}>
                            {vsAvg >= 0 ? '+' : ''}
                            {vsAvg.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="h-11 px-3.5 font-mono text-xs text-slate-600">
                        {row.contact && row.contact !== '—' ? row.contact : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="h-11 max-w-0 px-3.5">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                          <DeliveryDot row={row} />
                          <span
                            className="truncate text-[11px] leading-snug text-slate-600"
                            title={row.delivery?.trim() || undefined}
                          >
                            {row.delivery || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="h-11 px-2.5" onClick={(e) => e.stopPropagation()}>
                        <div
                          className={`flex justify-end gap-1 transition-opacity ${
                            isHov || isSel ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onAddSingleToBucket(row.id)}
                            className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                            aria-label="Add to bucket"
                          >
                            <ShoppingCart className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-600 hover:bg-slate-100"
                            aria-label="Wishlist"
                          >
                            <Heart className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {view === 'insights' && (
          <div className="flex-1 overflow-y-auto p-4">
            <CompareInsightsPanel
              partLabel={partLabel}
              rows={filteredRows}
              onViewChange={onViewChange}
              onAddToBucket={onAddSingleToBucket}
            />
          </div>
        )}

        {view === 'mindmap' && (
          <div className="flex-1 overflow-hidden bg-slate-50 p-4">
            <CompareMindMapPanel
              partLabel={partLabel}
              rows={displayRows}
              onViewChange={onViewChange}
              onAddToBucket={onAddSingleToBucket}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-3.5 py-2">
          <span className="text-xs text-slate-400">
            {displayRows.length} vendor{displayRows.length !== 1 ? 's' : ''} · {totalVendorSources} found
          </span>
          {selectedIds.size > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-medium text-blue-600">{selectedIds.size} selected</span>
            </>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
          {onSaveView && (
            <button
              type="button"
              onClick={onSaveView}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="h-3 w-3" />
              Save view
            </button>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
