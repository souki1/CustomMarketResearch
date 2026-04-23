import { CompareVendorMindMap, type CompareVendorMindMapModel } from '@/components/compare/CompareVendorMindMap'

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
  view: 'table' | 'insights' | 'mindmap'
  onViewChange: (next: 'table' | 'insights' | 'mindmap') => void
  mindMapModel: CompareVendorMindMapModel | null
  onSelectVendorFromMindMap: (vendor: string) => void
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

export function CompareDecisionWorkspace({
  partLabel,
  rows,
  filteredRows,
  vendorFilter,
  vendors,
  onVendorFilterChange,
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
  view,
  onViewChange,
  mindMapModel,
  onSelectVendorFromMindMap,
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
  const lowestShipping = filteredRows.reduce<number | null>((best, r) => {
    if (r.shipping == null) return best
    if (best == null || r.shipping < best) return r.shipping
    return best
  }, null)

  const isEmpty = rows.length === 0
  const activeFields = availableFields

  const previewFields = activeFields.length > 0 ? activeFields.slice(0, 4) : ['price', 'contact', 'delivery', 'location']

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

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 rounded-xl bg-white/90 px-4 py-3 backdrop-blur">
        <p className="text-sm font-semibold text-slate-900">{partLabel || 'Selected part'}</p>
        <p className="text-xs text-slate-500">Compare vendors, pricing, and availability</p>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Best Price</p>
            <p className="text-sm font-semibold text-slate-900">{money(bestPrice, '—')}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Avg Price</p>
            <p className="text-sm font-semibold text-slate-900">{Number.isFinite(avgPrice) ? `$${avgPrice.toFixed(2)}` : '—'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Vendors</p>
            <p className="text-sm font-semibold text-slate-900">{vendorsCount}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Lowest Shipping</p>
            <p className="text-sm font-semibold text-slate-900">{money(lowestShipping, '—')}</p>
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
      ) : (
        <div className="grid min-h-[520px] grid-cols-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-xl bg-white/90 p-3 xl:sticky xl:top-[140px] xl:h-[calc(100vh-220px)] xl:overflow-y-auto">
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Part Info</h4>
              <p className="rounded-md bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800">{partLabel || 'Selected part'}</p>
            </div>
            <div className="mt-4 space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filters</h4>
              <label className="block text-[11px] font-medium text-slate-600">Vendor</label>
              <select
                value={vendorFilter}
                onChange={(e) => onVendorFilterChange(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
              >
                <option value="all">All vendors</option>
                {vendors.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <label className="block text-[11px] font-medium text-slate-600">Price range</label>
              <div className="space-y-1">
                <input
                  type="range"
                  min={minPrice}
                  max={maxPrice}
                  value={priceRange[0]}
                  onChange={(e) => onPriceRangeChange([Number(e.target.value), priceRange[1]])}
                  className="w-full"
                />
                <input
                  type="range"
                  min={minPrice}
                  max={maxPrice}
                  value={priceRange[1]}
                  onChange={(e) => onPriceRangeChange([priceRange[0], Number(e.target.value)])}
                  className="w-full"
                />
                <p className="text-[11px] text-slate-500">
                  {money(priceRange[0], '—')} - {money(priceRange[1], '—')}
                </p>
              </div>
              <label className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(e) => onOnlyAvailableChange(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Availability only
              </label>
            </div>
            <div className="mt-4 space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Actions</h4>
              <button
                type="button"
                onClick={onAddSelectedToBucket}
                className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Add to Bucket
              </button>
              <button
                type="button"
                onClick={onCompareSelected}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Compare Selected
              </button>
            </div>
          </aside>

          <section className="space-y-2 rounded-xl bg-white/90 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
                {(['table', 'insights', 'mindmap'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => onViewChange(tab)}
                    className={`border-r border-slate-300 px-3 py-1.5 text-xs font-medium last:border-r-0 ${
                      view === tab ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {tab === 'table' ? 'Table' : tab === 'insights' ? 'Insights' : 'Mind Map'}
                  </button>
                ))}
              </div>
              <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                Fields (All: {availableFields.length})
              </div>
            </div>
            {view === 'mindmap' && mindMapModel ? (
              <CompareVendorMindMap model={mindMapModel} onSelectVendor={onSelectVendorFromMindMap} />
            ) : view === 'insights' ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {filteredRows.slice(0, 8).map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-900">{r.vendor}</p>
                    {previewFields.map((field) => (
                      <p key={`${r.id}-${field}`} className="text-[11px] text-slate-600">
                        {formatFieldLabel(field)}: {getFieldDisplayValue(r, field)}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-slate-200 [scrollbar-gutter:stable]">
                <table
                  className="w-max min-w-full text-xs"
                  style={{ minWidth: `${Math.max(860, (activeFields.length + 2) * 170)}px` }}
                >
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">Vendor</th>
                      {activeFields.map((field) => (
                        <th key={field} className="px-3 py-2 text-left">
                          {formatFieldLabel(field)}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const isBestPrice = bestPrice != null && row.price != null && row.price === bestPrice
                      const selected = selectedIds.has(row.id)
                      return (
                        <tr
                          key={row.id}
                          className="group border-t border-slate-100 transition-colors hover:bg-blue-50/40"
                        >
                          <td className="px-3 py-2">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  onToggleSelected(row.id)
                                }}
                                className="rounded border-slate-300"
                              />
                              <span className="font-medium text-slate-800">{row.vendor}</span>
                            </label>
                          </td>
                          {activeFields.map((field) => (
                            <td key={`${row.id}-${field}`} className="px-3 py-2 text-slate-700">
                              <span className="font-medium text-slate-800">
                                {renderFieldValue(row, field)}
                                {field.toLowerCase() === 'price' && isBestPrice && (
                                  <span className="ml-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                                    ★ Best
                                  </span>
                                )}
                              </span>
                            </td>
                          ))}
                          <td className="px-3 py-2 text-slate-700">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                onAddSingleToBucket(row.id)
                              }}
                              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Add
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      )}
    </div>
  )
}
