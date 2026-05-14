import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompareVendorMindMapModel } from '@/components/compare/CompareVendorMindMap'
import { CompareInsightsPanel } from '@/components/compare/CompareInsightsPanel'
import { CompareMindMapPanel } from '@/components/compare/CompareMindMapPanel'
import { ArrowUpDown, ExternalLink } from 'lucide-react'

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

type Props = {
  partLabel: string
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
}

function money(n: number | null, fallback: string): string {
  if (n == null || Number.isNaN(n)) return fallback
  return `$${n.toFixed(2)}`
}

function isImageUrl(value: string): boolean {
  const s = value.trim().toLowerCase()
  if (!s.startsWith('http://') && !s.startsWith('https://')) return false
  return (
    /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(s) ||
    /\/images?\//i.test(s) ||
    /imagedelivery\.net|cloudflare.*\/images?/i.test(s)
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 translate-y-0.5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  let barColor = 'bg-slate-400'
  if (score >= 70) barColor = 'bg-emerald-500'
  else if (score >= 40) barColor = 'bg-blue-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-slate-700">{score}</span>
    </div>
  )
}

function SortableHeader({
  label,
  field,
  activeKey,
  onSort,
}: {
  label: string
  field: string
  activeKey: string | null
  onSort: (field: string) => void
}) {
  const isActive = activeKey === field
  return (
    <th
      className="cursor-pointer select-none px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${isActive ? 'text-slate-700' : 'text-slate-400'}`} />
      </span>
    </th>
  )
}

export function CompareDecisionWorkspace({
  partLabel,
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
}: Props) {
  const bestPrice = filteredRows.reduce<number | null>((best, r) => {
    if (r.price == null) return best
    if (best == null || r.price < best) return r.price
    return best
  }, null)
  const avgPrice =
    filteredRows.filter((r) => r.price != null).reduce((sum, r) => sum + (r.price ?? 0), 0) /
    Math.max(1, filteredRows.filter((r) => r.price != null).length)
  const vendorsCount = new Set(filteredRows.map((r) => r.vendor).filter(Boolean)).size
  const totalVendors = new Set(rows.map((r) => r.vendor).filter(Boolean)).size
  const lowestShipping = filteredRows.reduce<number | null>((best, r) => {
    if (r.shipping == null) return best
    if (best == null || r.shipping < best) return r.shipping
    return best
  }, null)

  const isEmpty = rows.length === 0

  const [fieldPickerOpen, setFieldPickerOpen] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const fieldPickerRef = useRef<HTMLDivElement | null>(null)
  const [vendorSearch, setVendorSearch] = useState('')
  const [shipsToday, setShipsToday] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const allFields = useMemo(
    () =>
      availableFields
        .map((field) => field.trim())
        .filter(Boolean)
        .filter((field, index, arr) => arr.indexOf(field) === index),
    [availableFields]
  )
  const activeFields =
    selectedFields.length > 0 ? allFields.filter((field) => selectedFields.includes(field)) : allFields

  useEffect(() => {
    const trimmedAll = new Set(allFields.map((field) => field.trim()).filter(Boolean))
    const cleanedSelection = selectedFields.filter((field) => trimmedAll.has(field.trim()))
    if (cleanedSelection.length !== selectedFields.length) {
      onSelectedFieldsChange(cleanedSelection)
    }
  }, [allFields, selectedFields, onSelectedFieldsChange])

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!fieldPickerOpen) return
      if (!fieldPickerRef.current?.contains(event.target as Node)) {
        setFieldPickerOpen(false)
      }
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

  function getScore(row: CompareDecisionRow): number | null {
    if (row.rating != null && !Number.isNaN(row.rating)) return Math.round(row.rating)
    return null
  }

  function getVsAvg(row: CompareDecisionRow): number | null {
    if (row.price == null || !Number.isFinite(avgPrice) || avgPrice === 0) return null
    return ((row.price - avgPrice) / avgPrice) * 100
  }

  function getDeliveryDisplay(row: CompareDecisionRow): string {
    if (row.delivery && row.delivery !== '—') return row.delivery
    if (row.shipping === 0) return 'Free ship'
    if (row.shippingLabel && row.shippingLabel !== '—') return row.shippingLabel
    return '—'
  }

  function isInStock(row: CompareDecisionRow): boolean | null {
    if (!row.availability) return null
    const a = row.availability.toLowerCase()
    if (a.includes('in stock') || a.includes('yes') || a === 'available') return true
    if (a.includes('out of stock') || a.includes('no') || a === 'unavailable') return false
    return null
  }

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'price' ? 'asc' : 'desc')
    }
  }

  const sortedRows = useMemo(() => {
    const arr = [...displayRows]
    if (!sortKey) return arr
    const key = sortKey
    arr.sort((a, b) => {
      let cmp = 0
      if (key === 'vendor') {
        cmp = a.vendor.localeCompare(b.vendor)
      } else if (key === 'price') {
        cmp = (a.price ?? Infinity) - (b.price ?? Infinity)
      } else if (key === 'score') {
        cmp = (getScore(a) ?? -1) - (getScore(b) ?? -1)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [displayRows, sortKey, sortDir])

  function formatFieldLabel(field: string): string {
    return field
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
  }

  function getFieldDisplayValue(row: CompareDecisionRow, field: string): string {
    const candidate = row.rawData[field]
    if (candidate == null) return '—'
    if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean') {
      const text = String(candidate).trim()
      return text || '—'
    }
    if (Array.isArray(candidate)) {
      const text = candidate
        .filter((x) => x != null)
        .map((x) => String(x).trim())
        .filter(Boolean)
        .join(', ')
      return text || '—'
    }
    return '—'
  }

  function renderFieldValue(row: CompareDecisionRow, field: string) {
    const value = getFieldDisplayValue(row, field)
    if (value !== '—' && isImageUrl(value)) {
      return (
        <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center">
          <img
            src={value}
            alt={`${row.vendor} ${formatFieldLabel(field)}`}
            className="h-8 w-8 rounded-md border border-slate-200 object-cover"
            loading="lazy"
          />
        </a>
      )
    }
    return value
  }

  function renderDelivery(row: CompareDecisionRow) {
    const text = getDeliveryDisplay(row)
    if (text === '—') return <span className="text-slate-400">—</span>
    const lower = text.toLowerCase()
    if (lower.includes('today') || lower.includes('same day')) {
      return (
        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          Ships today
        </span>
      )
    }
    if (lower.includes('free') && (lower.includes('ship') || lower.includes('delivery'))) {
      return (
        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
          Free ship
        </span>
      )
    }
    return <span className="text-slate-700">{text}</span>
  }

  const coreFieldNames = new Set([
    'vendor', 'price', 'contact', 'delivery', 'shipping', 'availability', 'rating', 'location', 'score',
  ])
  const extraFields = activeFields.filter((f) => !coreFieldNames.has(f.toLowerCase()))

  function handleExportCSV() {
    if (onExportCSV) {
      onExportCSV()
      return
    }
    const headers = ['Vendor', 'Price', 'VS Avg', 'Contact', 'Delivery', 'Score', 'In Stock']
    const csvRows = [headers.join(',')]
    for (const row of sortedRows) {
      const vsAvg = getVsAvg(row)
      const score = getScore(row)
      const stock = isInStock(row)
      csvRows.push(
        [
          `"${row.vendor.replace(/"/g, '""')}"`,
          row.price != null ? row.price.toFixed(2) : '',
          vsAvg != null ? `${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(0)}%` : '',
          `"${(row.contact || '').replace(/"/g, '""')}"`,
          `"${getDeliveryDisplay(row).replace(/"/g, '""')}"`,
          score != null ? String(score) : '',
          stock === true ? 'Yes' : stock === false ? 'No' : '',
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

  return (
    <div className="space-y-3">
      {/* ——— STICKY HEADER ——— */}
      <div className="sticky top-0 z-20 rounded-xl bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <h2 className="truncate text-base font-bold text-slate-900">{partLabel || 'Selected part'}</h2>
            <span className="text-sm text-slate-500">Compare vendors, pricing, and availability</span>
          </div>

          <div className="relative shrink-0" ref={fieldPickerRef}>
            <button
              type="button"
              onClick={() => setFieldPickerOpen((v) => !v)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
            >
              Fields ({selectedFields.length > 0 ? selectedFields.length : allFields.length} / {allFields.length})
            </button>
            {fieldPickerOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-30 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5">
                <input
                  type="search"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields..."
                  className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                />
                <div className="mb-2 flex items-center justify-between px-1 text-[11px] text-slate-500">
                  <button type="button" onClick={() => onSelectedFieldsChange(allFields)} className="hover:text-slate-700">
                    Select all
                  </button>
                  <button type="button" onClick={() => onSelectedFieldsChange([])} className="hover:text-slate-700">
                    Clear
                  </button>
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto pr-1">
                  {allFields
                    .filter((field) =>
                      fieldSearch.trim() ? field.toLowerCase().includes(fieldSearch.trim().toLowerCase()) : true
                    )
                    .map((field) => {
                      const checked = selectedFields.includes(field)
                      return (
                        <label key={field} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              onSelectedFieldsChange(
                                e.target.checked
                                  ? [...selectedFields, field]
                                  : selectedFields.filter((v) => v !== field)
                              )
                            }
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                          />
                          <span className="truncate text-slate-700" title={field}>
                            {formatFieldLabel(field)}
                          </span>
                        </label>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-4">
          <div className="bg-white px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Best Price</p>
            <p className="text-lg font-bold text-emerald-600">{money(bestPrice, '—')}</p>
          </div>
          <div className="bg-white px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Avg Price</p>
            <p className="text-lg font-bold text-slate-800">
              {Number.isFinite(avgPrice) ? `$${avgPrice.toFixed(2)}` : '—'}
            </p>
          </div>
          <div className="bg-white px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Vendors</p>
            <p className="text-lg font-bold text-slate-800">
              {vendorsCount} / {totalVendors}
            </p>
          </div>
          <div className="bg-white px-4 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Lowest Ship</p>
            <p className="text-lg font-bold text-slate-800">
              {lowestShipping === 0 ? 'Free' : money(lowestShipping, '—')}
            </p>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-semibold text-slate-800">Start comparing parts</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <button className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">Add from Research</button>
            <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700">Upload CSV</button>
          </div>
        </div>
      ) : view === 'insights' ? (
        <CompareInsightsPanel
          partLabel={partLabel}
          rows={filteredRows}
          onViewChange={onViewChange}
          onAddToBucket={onAddSingleToBucket}
        />
      ) : view === 'mindmap' ? (
        <CompareMindMapPanel
          partLabel={partLabel}
          rows={displayRows}
          onViewChange={onViewChange}
          onAddToBucket={onAddSingleToBucket}
        />
      ) : (
        <div className="grid min-h-[520px] grid-cols-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
          {/* ——— SIDEBAR ——— */}
          <aside className="space-y-5 rounded-xl bg-white/90 p-3 xl:sticky xl:top-[140px] xl:h-[calc(100vh-220px)] xl:overflow-y-auto">
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Part Info</h4>
              <p className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800">
                {partLabel || 'Selected part'}
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filters</h4>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600">Vendor</label>
                <input
                  type="text"
                  placeholder="Search vendors..."
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-600">Price range</label>
                <input
                  type="range"
                  min={minPrice}
                  max={maxPrice}
                  value={priceRange[1]}
                  onChange={(e) => onPriceRangeChange([priceRange[0], Number(e.target.value)])}
                  className="w-full accent-teal-500"
                />
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>{money(minPrice, '—')}</span>
                  <span>{money(maxPrice, '—')}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700">In-stock only</span>
                <ToggleSwitch checked={onlyAvailable} onChange={onOnlyAvailableChange} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700">Ships today</span>
                <ToggleSwitch checked={shipsToday} onChange={setShipsToday} />
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions</h4>
              <button
                type="button"
                onClick={onAddSelectedToBucket}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                Add to bucket
                <ExternalLink className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onCompareSelected}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              >
                Compare selected
                <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          </aside>

          {/* ——— MAIN CONTENT ——— */}
          <section className="space-y-2 rounded-xl bg-white/90 p-3">
            <div className="flex items-center gap-6 border-b border-slate-200">
              {(['table', 'insights', 'mindmap'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => onViewChange(tab)}
                  className={`pb-2 text-sm font-medium transition-colors ${
                    view === tab
                      ? 'border-b-2 border-slate-900 text-slate-900'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab === 'table' ? 'Table' : tab === 'insights' ? 'Insights' : 'Mind map'}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200 [scrollbar-gutter:stable]">
                <table
                  className="w-max min-w-full text-xs"
                  style={{ minWidth: `${Math.max(860, (8 + extraFields.length) * 130)}px` }}
                >
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="w-10 px-3 py-2.5">
                        <span className="sr-only">Select</span>
                      </th>
                      <SortableHeader label="Vendor" field="vendor" activeKey={sortKey} onSort={toggleSort} />
                      <SortableHeader label="Price" field="price" activeKey={sortKey} onSort={toggleSort} />
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        VS Avg
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Contact
                      </th>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Delivery
                      </th>
                      <SortableHeader label="Score" field="score" activeKey={sortKey} onSort={toggleSort} />
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        In Stock
                      </th>
                      {extraFields.map((field) => (
                        <th
                          key={field}
                          className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                        >
                          {formatFieldLabel(field)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => {
                      const isBest = bestPrice != null && row.price != null && row.price === bestPrice
                      const selected = selectedIds.has(row.id)
                      const vsAvg = getVsAvg(row)
                      const score = getScore(row)
                      const inStock = isInStock(row)

                      return (
                        <tr
                          key={row.id}
                          className="group border-t border-slate-100 transition-colors hover:bg-blue-50/30"
                        >
                          <td className="px-3 py-2.5">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => onToggleSelected(row.id)}
                              className="rounded border-slate-300"
                            />
                          </td>

                          <td className="px-3 py-2.5">
                            <span className="font-medium text-slate-800">{row.vendor}</span>
                            {isBest && (
                              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                Best
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2.5 font-semibold text-slate-800">
                            {money(row.price, '—')}
                          </td>

                          <td className="px-3 py-2.5">
                            {vsAvg != null ? (
                              <span className={`font-medium ${vsAvg <= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {vsAvg >= 0 ? '+' : ''}{vsAvg.toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="px-3 py-2.5 text-slate-600">
                            {row.contact || <span className="text-slate-400">—</span>}
                          </td>

                          <td className="px-3 py-2.5">{renderDelivery(row)}</td>

                          <td className="px-3 py-2.5">
                            {score != null ? <ScoreBar score={score} /> : <span className="text-slate-400">—</span>}
                          </td>

                          <td className="px-3 py-2.5">
                            {inStock === true ? (
                              <span className="font-medium text-emerald-600">Yes</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {extraFields.map((field) => (
                            <td key={`${row.id}-${field}`} className="px-3 py-2.5 text-slate-700">
                              {renderFieldValue(row, field)}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
          </section>
        </div>
      )}

      {!isEmpty && view !== 'insights' && view !== 'mindmap' && (
        <div className="flex items-center justify-between rounded-xl bg-white/90 px-4 py-2.5 backdrop-blur">
          <span className="text-xs font-medium text-teal-700">
            {displayRows.length} vendor{displayRows.length !== 1 ? 's' : ''} shown
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Export CSV
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onSaveView}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              Save view
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
