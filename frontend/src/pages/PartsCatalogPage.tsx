import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bolt,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MoreVertical,
  Search,
  Sparkles,
  Tag,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useComparison } from '@/contexts/ComparisonContext'
import { getToken } from '@/lib/auth'
import { RESEARCH_COMPARE_PATH } from '@/lib/paths'
import {
  fetchWishlistCatalogItems,
  type WishlistCatalogItem,
} from '@/lib/wishlistCatalog'

const PAGE_SIZE = 25

type CatalogFilters = {
  inStockOnly: boolean
  commonVendorsOnly: boolean
  bestPriceOnly: boolean
  shipsTodayOnly: boolean
  hasPriceOnly: boolean
  fastDeliveryOnly: boolean
}

const EMPTY_FILTERS: CatalogFilters = {
  inStockOnly: false,
  commonVendorsOnly: false,
  bestPriceOnly: false,
  shipsTodayOnly: false,
  hasPriceOnly: false,
  fastDeliveryOnly: false,
}

const FILTER_OPTIONS: {
  key: keyof CatalogFilters
  label: string
  hint: string
}[] = [
  { key: 'inStockOnly', label: 'In stock only', hint: 'Hide unavailable listings' },
  { key: 'commonVendorsOnly', label: 'Common vendors only', hint: 'Vendors with multiple listings' },
  { key: 'bestPriceOnly', label: 'Best price per part', hint: 'Cheapest offer for each part' },
  { key: 'shipsTodayOnly', label: 'Ships today', hint: 'Same-day or ships-today delivery' },
  { key: 'hasPriceOnly', label: 'Priced only', hint: 'Hide rows without a price' },
  { key: 'fastDeliveryOnly', label: 'Fast delivery', hint: 'Delivered in 3 days or less' },
]

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(2)}`
}

function deliveryDays(delivery: string): number | null {
  const m = delivery.match(/(\d+)\s*(day|days|hr|hrs|hour|hours)/i)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  if (/hr|hour/i.test(m[2] ?? '')) return Math.max(1, Math.ceil(n / 24))
  return n
}

function countActiveFilters(filters: CatalogFilters): number {
  return (Object.keys(EMPTY_FILTERS) as (keyof CatalogFilters)[]).filter((k) => filters[k]).length
}

export function PartsCatalogPage() {
  const navigate = useNavigate()
  const { openWithItems } = useComparison()
  const token = useMemo(() => getToken(), [])

  const [items, setItems] = useState<WishlistCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS)
  const [smartSuggestions, setSmartSuggestions] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!token) {
      setItems([])
      setLoading(false)
      setError('Sign in to browse your parts catalog.')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchWishlistCatalogItems(token)
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load catalog')
        setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const commonVendors = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) {
      const key = item.vendor.trim().toLowerCase()
      if (!key) continue
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const common = new Set<string>()
    for (const [vendor, count] of counts) {
      if (count >= 2) common.add(vendor)
    }
    return common
  }, [items])

  const bestPriceIds = useMemo(() => {
    const bestByPart = new Map<string, WishlistCatalogItem>()
    for (const item of items) {
      if (item.price == null) continue
      const partKey = item.part.trim().toLowerCase()
      if (!partKey) continue
      const existing = bestByPart.get(partKey)
      if (!existing || (existing.price ?? Infinity) > item.price) {
        bestByPart.set(partKey, item)
      }
    }
    return new Set([...bestByPart.values()].map((item) => item.id))
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (filters.inStockOnly && !item.available) return false
      if (filters.shipsTodayOnly && !item.shipsToday) return false
      if (filters.hasPriceOnly && item.price == null) return false
      if (filters.fastDeliveryOnly) {
        const days = deliveryDays(item.delivery)
        if (days == null || days > 3) return false
      }
      if (filters.commonVendorsOnly) {
        const vendorKey = item.vendor.trim().toLowerCase()
        if (!commonVendors.has(vendorKey)) return false
      }
      if (filters.bestPriceOnly && !bestPriceIds.has(item.id)) return false
      if (!q) return true
      return (
        item.part.toLowerCase().includes(q) ||
        item.vendor.toLowerCase().includes(q) ||
        item.companyBrand.toLowerCase().includes(q) ||
        item.delivery.toLowerCase().includes(q)
      )
    })
  }, [items, search, filters, commonVendors, bestPriceIds])

  const fastestId = useMemo(() => {
    if (!smartSuggestions || filtered.length === 0) return null
    let best: WishlistCatalogItem | null = null
    let bestDays = Infinity
    for (const item of filtered) {
      const days = deliveryDays(item.delivery)
      if (days == null) continue
      if (days < bestDays) {
        bestDays = days
        best = item
      }
    }
    return best?.id ?? null
  }, [filtered, smartSuggestions])

  const bestPriceId = useMemo(() => {
    if (!smartSuggestions || filtered.length === 0) return null
    let best: WishlistCatalogItem | null = null
    let bestPrice = Infinity
    for (const item of filtered) {
      if (item.price == null) continue
      if (item.price < bestPrice) {
        bestPrice = item.price
        best = item
      }
    }
    return best?.id ?? null
  }, [filtered, smartSuggestions])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE)
  const activeFilterCount = countActiveFilters(filters)
  const hasActiveChips = activeFilterCount > 0 || Boolean(search.trim())

  useEffect(() => {
    setPage(1)
  }, [search, filters])

  const toggleFilter = (key: keyof CatalogFilters) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS)
    setSearch('')
  }

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllPage = () => {
    const ids = pageItems.map((i) => i.id)
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id))
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const compareSelected = () => {
    const chosen = items.filter((i) => selected.has(i.id))
    if (chosen.length === 0) return
    openWithItems(
      chosen.map((item) => ({
        id: item.id,
        title: item.part,
        imageUrl: item.imageUrl ?? null,
        sourceName: item.vendor,
        specs: [
          { label: 'Vendor', value: item.vendor },
          { label: 'Price', value: money(item.price) },
          { label: 'Delivery', value: item.delivery || '—' },
          { label: 'Contact', value: item.contact || '—' },
        ],
      }))
    )
    navigate(RESEARCH_COMPARE_PATH)
  }

  const pageAllSelected =
    pageItems.length > 0 && pageItems.every((item) => selected.has(item.id))

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full min-w-0 flex-col overflow-hidden bg-slate-50">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5">
        <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
          Catalog Browser
          <span className="ml-2 font-medium text-slate-400">
            ({filtered.length.toLocaleString()} parts)
          </span>
        </h1>
        <div className="flex items-center gap-3">
          {!loading && !error && (
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 sm:inline-flex">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Synced
            </div>
          )}
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, vendor, or description…"
              className="w-56 rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-80"
              aria-label="Search catalog"
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Active filters
            </span>
            {FILTER_OPTIONS.filter((opt) => filters[opt.key]).map((opt) => (
              <div
                key={opt.key}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
              >
                {opt.label}
                <button
                  type="button"
                  onClick={() => toggleFilter(opt.key)}
                  className="ml-0.5 text-blue-500 hover:text-red-600"
                  aria-label={`Remove ${opt.label} filter`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {search.trim() && (
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
                Search: {search.trim()}
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="ml-0.5 text-slate-400 hover:text-red-600"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {hasActiveChips && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 text-xs font-medium text-blue-600 hover:underline"
              >
                Clear all
              </button>
            )}
            {!hasActiveChips && <span className="text-xs text-slate-400">None</span>}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 transition-colors hover:bg-slate-50">
              <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={smartSuggestions}
                  onChange={(e) => setSmartSuggestions(e.target.checked)}
                />
                <span className="h-5 w-9 rounded-full bg-slate-300 transition-colors peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                Smart suggestions
              </span>
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`relative inline-flex items-center justify-center rounded-md border p-1.5 transition-colors ${
                    activeFilterCount > 0
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  title="Catalog filters"
                  aria-label="Catalog filters"
                >
                  <Filter className="h-4 w-4" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Filter catalog</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {FILTER_OPTIONS.map((opt) => {
                  const on = filters[opt.key]
                  return (
                    <DropdownMenuItem
                      key={opt.key}
                      onSelect={(e) => {
                        e.preventDefault()
                        toggleFilter(opt.key)
                      }}
                      className="cursor-pointer items-start gap-2.5 py-2"
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          on
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 bg-white text-transparent'
                        }`}
                        aria-hidden
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800">{opt.label}</span>
                        <span className="block text-xs text-slate-500">{opt.hint}</span>
                      </span>
                    </DropdownMenuItem>
                  )
                })}
                {activeFilterCount > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setFilters(EMPTY_FILTERS)}
                      className="cursor-pointer text-blue-700 focus:text-blue-800"
                    >
                      Clear filters
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex min-h-105 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading catalog…
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm font-medium text-slate-700">{error}</p>
              <p className="text-xs text-slate-400">
                Run Research or add Portfolio items to populate the catalog.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
              <p className="text-sm font-medium text-slate-700">No parts match</p>
              <p className="text-xs text-slate-400">
                {items.length === 0
                  ? 'Research vendors or add portfolio parts to build your catalog.'
                  : 'Try clearing filters or search.'}
              </p>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-180 border-collapse text-left">
                  <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                    <tr>
                      <th className="w-12 px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={pageAllSelected}
                          onChange={toggleAllPage}
                          className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                          aria-label="Select all on page"
                        />
                      </th>
                      {['Part ID', 'Description', 'Vendor', 'Delivery time', 'Price (USD)', ''].map(
                        (h) => (
                          <th
                            key={h || 'actions'}
                            className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${
                              h === 'Price (USD)' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {pageItems.map((item) => {
                      const isSel = selected.has(item.id)
                      const isFastest = item.id === fastestId
                      const isBestPrice = item.id === bestPriceId
                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors hover:bg-slate-50 ${
                            isSel ? 'bg-blue-50/60' : 'bg-white'
                          }`}
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleSel(item.id)}
                              className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                              aria-label={`Select ${item.part}`}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] font-medium text-slate-900">
                            {item.part}
                          </td>
                          <td className="max-w-xs truncate px-3 py-2 text-slate-700">
                            {item.companyBrand && item.companyBrand !== item.part
                              ? item.companyBrand
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-700">{item.vendor}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-700">{item.delivery || '—'}</span>
                              {isFastest && (
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700">
                                  <Bolt className="h-3 w-3 fill-current" aria-hidden />
                                  Fastest
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isBestPrice && (
                                <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-blue-700">
                                  <Tag className="h-3 w-3" aria-hidden />
                                  Best price
                                </span>
                              )}
                              <span className="font-mono text-[12px] text-slate-800">
                                {money(item.price)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex rounded p-1 text-slate-400 hover:text-slate-800"
                                title="Open source"
                                aria-label={`Open source for ${item.part}`}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </a>
                            ) : (
                              <span className="inline-flex p-1 text-slate-300" aria-hidden>
                                <MoreVertical className="h-4 w-4" />
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-xs font-semibold text-slate-600">
                  Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length.toLocaleString()} parts
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-slate-200 bg-white p-1 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-1 text-xs text-slate-600">
                    Page {safePage} of {totalPages.toLocaleString()}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="rounded border border-slate-200 bg-white p-1 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className={`fixed bottom-8 right-8 z-50 transition-all duration-300 ease-out ${
          selected.size > 0
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-8 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={compareSelected}
          className="inline-flex items-center gap-3 rounded-full border border-slate-800/20 bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition-colors hover:bg-slate-800"
        >
          Compare selected ({selected.size})
        </button>
      </div>
    </div>
  )
}
