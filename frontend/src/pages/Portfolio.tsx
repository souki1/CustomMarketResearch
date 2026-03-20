import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDown,
  ArrowRight,
  Building2,
  ChevronDown,
  DollarSign,
  Download,
  Filter,
  Loader2,
  Monitor,
  MoreHorizontal,
  Package,
  Search,
  ShoppingBag,
  Info,
} from "lucide-react"
import { getToken } from "@/lib/auth"
import { listDataSheetSelections, listPortfolioItems } from "@/lib/api"
import type { PortfolioItem } from "@/lib/api"
import { useBucket } from "@/contexts/BucketContext"
import { useComparison } from "@/contexts/ComparisonContext"
import { RESEARCH_COMPARE_PATH } from "@/lib/paths"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const PAGE_BG = "bg-[#f8fafc]"
const BORDER = "border-slate-200"
const BEST_PRICE_GREEN = "text-[#16a34a]"
const AVG_PRICE_SLATE = "text-[#334155]"

function parsePrice(s: string | null): number | null {
  if (s == null || !String(s).trim()) return null
  const cleaned = String(s).replace(/[^0-9.]/g, "")
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function displayPrice(s: string | null, fallbackNum: number | null): string {
  if (s != null && String(s).trim()) return String(s).trim()
  if (fallbackNum != null) return formatUsd(fallbackNum)
  return "—"
}

type PartGroup = {
  rowId: string
  part_number: string | null
  entries: PortfolioItem[]
}

type SortMode = "part-asc" | "part-desc" | "vendors-desc" | "best-asc" | "best-desc"

export function PortfolioPage() {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [search, setSearch] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("part-asc")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(() => new Set())
  const [detailEntry, setDetailEntry] = useState<PortfolioItem | null>(null)

  const navigate = useNavigate()
  const { addItem, showToast } = useBucket()
  const { openWithItems: openComparison, closeAndClear: clearComparison } = useComparison()

  const token = useMemo(() => getToken(), [])

  const partGroups: PartGroup[] = useMemo(() => {
    const keyFor = (item: PortfolioItem): string => item.part_number ?? "__null_part__"
    const map = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const k = keyFor(item)
      const arr = map.get(k)
      if (arr) arr.push(item)
      else map.set(k, [item])
    }
    const out: PartGroup[] = []
    let i = 0
    for (const [k, entries] of map.entries()) {
      const part_number = k === "__null_part__" ? null : k
      out.push({
        rowId: part_number != null ? `part:${part_number}` : `part:null:${i}`,
        part_number,
        entries,
      })
      i += 1
    }
    return out
  }, [portfolioItems])

  const stats = useMemo(() => {
    const uniqueParts = partGroups.length
    const vendorRows = portfolioItems.length
    const allNums = portfolioItems.map((p) => parsePrice(p.price)).filter((n): n is number => n != null)
    const best = allNums.length ? Math.min(...allNums) : null

    let avg: number | null = null
    const hasPartSelection = selectedPartIds.size > 0
    if (hasPartSelection) {
      const selectedNums: number[] = []
      for (const g of partGroups) {
        if (!selectedPartIds.has(g.rowId)) continue
        for (const e of g.entries) {
          const n = parsePrice(e.price)
          if (n != null) selectedNums.push(n)
        }
      }
      avg = selectedNums.length ? selectedNums.reduce((a, b) => a + b, 0) / selectedNums.length : null
    } else {
      avg = allNums.length ? allNums.reduce((a, b) => a + b, 0) / allNums.length : null
    }

    return { uniqueParts, vendorRows, best, avg, avgUsesSelection: hasPartSelection }
  }, [partGroups, portfolioItems, selectedPartIds])

  const filteredSortedGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = partGroups
    if (q) {
      list = list.filter((g) => {
        const part = (g.part_number ?? "").toLowerCase()
        if (part.includes(q)) return true
        return g.entries.some(
          (e) =>
            (e.vendor_name ?? "").toLowerCase().includes(q) ||
            (e.price ?? "").toLowerCase().includes(q)
        )
      })
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      const partA = (a.part_number ?? "").toLowerCase()
      const partB = (b.part_number ?? "").toLowerCase()
      const minPrice = (g: PartGroup) => {
        const nums = g.entries.map((e) => parsePrice(e.price)).filter((n): n is number => n != null)
        return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY
      }
      switch (sortMode) {
        case "part-desc":
          return partB.localeCompare(partA)
        case "vendors-desc":
          return b.entries.length - a.entries.length
        case "best-asc":
          return minPrice(a) - minPrice(b)
        case "best-desc":
          return minPrice(b) - minPrice(a)
        case "part-asc":
        default:
          return partA.localeCompare(partB)
      }
    })
    return sorted
  }, [partGroups, search, sortMode])

  const loadPortfolio = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(null)
    setPortfolioItems([])
    try {
      const selections = await listDataSheetSelections(token)
      if (selections.length === 0) return
      const results = await Promise.all(
        selections.map((s) => listPortfolioItems(token, s.id).catch(() => [] as PortfolioItem[]))
      )
      const seen = new Set<string>()
      const merged: PortfolioItem[] = []
      for (const batch of results) {
        for (const item of batch) {
          const key = `${item.part_number}|${item.vendor_name}|${item.price}|${item.quantity}`
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(item)
          }
        }
      }
      setPortfolioItems(merged)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load portfolio")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadPortfolio()
  }, [loadPortfolio])

  const errorMessage = !token ? "Sign in to view portfolio." : loadError

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const togglePartSelected = useCallback((id: string) => {
    setSelectedPartIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const bestEntryForGroup = useCallback((g: PartGroup): PortfolioItem | null => {
    let best: PortfolioItem | null = null
    let bestN = Number.POSITIVE_INFINITY
    for (const e of g.entries) {
      const n = parsePrice(e.price)
      if (n != null && n < bestN) {
        bestN = n
        best = e
      }
    }
    return best
  }, [])

  const handleExportCsv = useCallback(() => {
    const lines = ["Part Number,Vendor,Price,Quantity,URL"]
    for (const g of filteredSortedGroups) {
      const part = (g.part_number ?? "").replaceAll('"', '""')
      for (const e of g.entries) {
        const row = [
          `"${part}"`,
          `"${(e.vendor_name ?? "").replaceAll('"', '""')}"`,
          `"${(e.price ?? "").replaceAll('"', '""')}"`,
          e.quantity != null ? String(e.quantity) : "",
          `"${(e.url ?? "").replaceAll('"', '""')}"`,
        ]
        lines.push(row.join(","))
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `portfolio-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast("Exported CSV")
  }, [filteredSortedGroups, showToast])

  const openCompareForGroup = useCallback(
    (g: PartGroup) => {
      if (g.entries.length === 0) return
      clearComparison()
      const items = g.entries.map((e, idx) => ({
        id: `portfolio-${g.rowId}-v${idx}`,
        title: e.vendor_name ?? "Vendor",
        imageUrl: null,
        specs: [
          { label: "Part", value: g.part_number ?? "—" },
          { label: "Price", value: e.price ?? "—" },
          { label: "Quantity", value: e.quantity != null ? String(e.quantity) : "—" },
          ...(e.url ? [{ label: "URL", value: e.url }] : []),
        ],
        sourceName: e.vendor_name,
      }))
      openComparison(items)
      showToast("Opened comparison")
      navigate(RESEARCH_COMPARE_PATH, { state: { returnTo: "/portfolio" } })
    },
    [clearComparison, navigate, openComparison, showToast]
  )

  const handleCompareSelected = useCallback(() => {
    const chosen = partGroups.filter((g) => selectedPartIds.has(g.rowId))
    if (chosen.length === 0) {
      showToast("Select at least one part")
      return
    }
    clearComparison()
    const items = chosen.map((g) => {
      const best = bestEntryForGroup(g) ?? g.entries[0]!
      const n = parsePrice(best.price)
      return {
        id: `portfolio-compare-${g.rowId}`,
        title: g.part_number ?? "—",
        imageUrl: null,
        specs: [
          { label: "Vendor", value: best.vendor_name ?? "—" },
          { label: "Price", value: displayPrice(best.price, n) },
          { label: "Quantity", value: best.quantity != null ? String(best.quantity) : "—" },
          ...(best.url ? [{ label: "URL", value: best.url }] : []),
        ],
        sourceName: best.vendor_name,
      }
    })
    openComparison(items)
    showToast("Opened comparison")
    navigate(RESEARCH_COMPARE_PATH, { state: { returnTo: "/portfolio" } })
  }, [
    bestEntryForGroup,
    clearComparison,
    navigate,
    openComparison,
    partGroups,
    selectedPartIds,
    showToast,
  ])

  const addVendorToBucket = useCallback(
    (g: PartGroup, e: PortfolioItem) => {
      const id = `portfolio-${g.part_number ?? "p"}-${e.vendor_name ?? "v"}-${e.price ?? ""}`
      const r = addItem({
        id,
        title: g.part_number ?? e.vendor_name ?? "Item",
        manufacturer: e.vendor_name ?? "",
        price: e.price ?? "",
        rowIndex: 0,
        tabId: "portfolio",
      })
      showToast(r.added ? "Added to Bucket" : "Already in Bucket")
    },
    [addItem, showToast]
  )

  return (
    <div className={`min-h-[calc(100vh-3.5rem)] ${PAGE_BG}`}>
      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Portfolio</h1>
          <p className="mt-2 text-sm text-slate-600">
            Compare vendors, pricing, and availability across your selected parts.
          </p>
        </header>

        {/* Summary cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`rounded-xl border ${BORDER} bg-white p-5 shadow-sm`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Parts</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
                  {!token || loading ? "—" : stats.uniqueParts}
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Package className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
          </div>
          <div className={`rounded-xl border ${BORDER} bg-white p-5 shadow-sm`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendors Found</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
                  {!token || loading ? "—" : stats.vendorRows}
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Building2 className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
          </div>
          <div className={`rounded-xl border ${BORDER} bg-white p-5 shadow-sm`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Best Price</p>
                <p className={`mt-2 text-3xl font-semibold tabular-nums ${BEST_PRICE_GREEN}`}>
                  {!token || loading ? "—" : stats.best != null ? formatUsd(stats.best) : "—"}
                </p>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#16a34a] text-white shadow-sm">
                <DollarSign className="h-5 w-5" strokeWidth={2} />
              </span>
            </div>
          </div>
          <div className={`rounded-xl border ${BORDER} bg-white p-5 shadow-sm`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Average Price</p>
                <p className={`mt-2 text-3xl font-semibold tabular-nums ${AVG_PRICE_SLATE}`}>
                  {!token || loading ? "—" : stats.avg != null ? formatUsd(stats.avg) : "—"}
                </p>
                {!loading && token && (
                  <p className="mt-1 text-xs font-normal normal-case text-slate-500">
                    {stats.avgUsesSelection
                      ? stats.avg != null
                        ? `Checked parts (${selectedPartIds.size}) · all offers for those parts`
                        : `Checked parts (${selectedPartIds.size}) · no parseable prices`
                      : "All vendor offers"}
                  </p>
                )}
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#334155] text-white shadow-sm">
                <DollarSign className="h-5 w-5" strokeWidth={2} />
              </span>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div
          className={`mb-3 flex flex-col gap-3 rounded-t-xl border border-b-0 ${BORDER} bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between`}
        >
          <div className="relative min-w-0 flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search parts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Filter className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Filter</span>
            </span>
            <div className="relative">
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                aria-label="Sort"
              >
                <option value="part-asc">Sort: Part A–Z</option>
                <option value="part-desc">Sort: Part Z–A</option>
                <option value="vendors-desc">Sort: Most vendors</option>
                <option value="best-asc">Sort: Lowest best price</option>
                <option value="best-desc">Sort: Highest best price</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!token || filteredSortedGroups.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
            <button
              type="button"
              onClick={handleCompareSelected}
              disabled={!token || selectedPartIds.size === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Compare Selected
            </button>
          </div>
        </div>

        {/* Table */}
        <div className={`overflow-hidden rounded-b-xl border ${BORDER} bg-white shadow-sm`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-3" aria-label="Select" />
                  <th className="px-3 py-3">Part Number</th>
                  <th className="px-3 py-3">Vendor</th>
                  <th className="px-3 py-3">Price</th>
                  <th className="w-12 px-3 py-3 text-right" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && token && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Loading…
                      </span>
                    </td>
                  </tr>
                )}

                {!loading && errorMessage && (
                  <tr>
                    <td
                      colSpan={5}
                      className={`px-4 py-12 text-center ${!token ? "text-slate-500" : "text-red-600"}`}
                    >
                      {errorMessage}
                    </td>
                  </tr>
                )}

                {token && !loading && !errorMessage && portfolioItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      No portfolio items found. Run &quot;Research Selected&quot; first.
                    </td>
                  </tr>
                )}

                {token &&
                  !loading &&
                  !errorMessage &&
                  filteredSortedGroups.map((g) => {
                    const expanded = expandedIds.has(g.rowId)
                    const best = bestEntryForGroup(g)
                    const collapsedVendor = g.entries[0]
                    const collapsedPrice = collapsedVendor
                      ? displayPrice(collapsedVendor.price, parsePrice(collapsedVendor.price))
                      : "—"
                    const minForGroup = (() => {
                      const nums = g.entries.map((e) => parsePrice(e.price)).filter((n): n is number => n != null)
                      return nums.length ? Math.min(...nums) : null
                    })()
                    const collapsedDisplay =
                      g.entries.length > 1
                        ? `${g.entries.length} vendors`
                        : collapsedVendor?.vendor_name ?? "—"

                    return (
                      <Fragment key={g.rowId}>
                        <tr className="bg-white hover:bg-slate-50/80">
                          <td className="px-3 py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={selectedPartIds.has(g.rowId)}
                              onChange={() => togglePartSelected(g.rowId)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                              aria-label={`Select ${g.part_number ?? "part"}`}
                            />
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(g.rowId)}
                              aria-expanded={expanded}
                              className="flex w-full items-center gap-2 text-left font-medium text-slate-900"
                            >
                              {expanded ? (
                                <ArrowDown
                                  className="h-4 w-4 shrink-0 text-violet-500"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              ) : (
                                <ArrowRight
                                  className="h-4 w-4 shrink-0 text-violet-500"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              )}
                              <span className="min-w-0 flex-1 truncate">{g.part_number ?? "—"}</span>
                            </button>
                          </td>
                          <td className="px-3 py-3 align-middle text-slate-700">
                            {expanded ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span className="line-clamp-2">{collapsedDisplay}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-middle tabular-nums text-slate-900">
                            {expanded ? "—" : g.entries.length > 1 && minForGroup != null ? formatUsd(minForGroup) : collapsedPrice}
                          </td>
                          <td className="px-3 py-3 text-right align-middle">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                  aria-label="Row actions"
                                >
                                  <MoreHorizontal className="h-5 w-5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="min-w-[200px]" align="end">
                                <DropdownMenuItem
                                  className="flex cursor-pointer items-center gap-2"
                                  onSelect={() => {
                                    const e = best ?? g.entries[0]
                                    if (e) addVendorToBucket(g, e)
                                  }}
                                >
                                  <ShoppingBag className="h-4 w-4" />
                                  Add to Bucket
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="flex cursor-pointer items-center gap-2"
                                  onSelect={() => openCompareForGroup(g)}
                                >
                                  <Monitor className="h-4 w-4" />
                                  Compare
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="flex cursor-pointer items-center gap-2"
                                  onSelect={() => {
                                    const e = best ?? g.entries[0]
                                    if (e) setDetailEntry(e)
                                  }}
                                >
                                  <Info className="h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                        {expanded &&
                          g.entries.map((e, vi) => {
                            const n = parsePrice(e.price)
                            const isBest = n != null && minForGroup != null && n === minForGroup
                            return (
                              <tr
                                key={`${g.rowId}-v-${vi}`}
                                className="bg-slate-50/60"
                              >
                                <td className="px-3 py-2" />
                                <td className="px-3 py-2" />
                                <td className="px-3 py-2 pl-12">
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium text-slate-800">
                                      {e.vendor_name ? (
                                        e.url ? (
                                          <a
                                            href={e.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-slate-800 hover:text-violet-600 hover:underline"
                                          >
                                            {e.vendor_name}
                                          </a>
                                        ) : (
                                          e.vendor_name
                                        )
                                      ) : (
                                        "—"
                                      )}
                                    </span>
                                    {isBest && (
                                      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-[#16a34a]">
                                        <DollarSign className="h-3 w-3" />
                                        Best Price
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 tabular-nums text-slate-900">
                                  {displayPrice(e.price, n)}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200/80 hover:text-slate-800"
                                        aria-label="Vendor row actions"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="min-w-[200px]" align="end">
                                      <DropdownMenuItem
                                        className="flex cursor-pointer items-center gap-2"
                                        onSelect={() => addVendorToBucket(g, e)}
                                      >
                                        <ShoppingBag className="h-4 w-4" />
                                        Add to Bucket
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="flex cursor-pointer items-center gap-2"
                                        onSelect={() => {
                                          clearComparison()
                                          openComparison([
                                            {
                                              id: `portfolio-one-${g.rowId}-${vi}`,
                                              title: e.vendor_name ?? "Vendor",
                                              imageUrl: null,
                                              specs: [
                                                { label: "Part", value: g.part_number ?? "—" },
                                                { label: "Price", value: e.price ?? "—" },
                                                {
                                                  label: "Quantity",
                                                  value: e.quantity != null ? String(e.quantity) : "—",
                                                },
                                                ...(e.url ? [{ label: "URL", value: e.url }] : []),
                                              ],
                                              sourceName: e.vendor_name,
                                            },
                                          ])
                                          showToast("Opened comparison")
                                          navigate(RESEARCH_COMPARE_PATH, { state: { returnTo: "/portfolio" } })
                                        }}
                                      >
                                        <Monitor className="h-4 w-4" />
                                        Compare
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        className="flex cursor-pointer items-center gap-2"
                                        onSelect={() => setDetailEntry(e)}
                                      >
                                        <Info className="h-4 w-4" />
                                        View Details
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            )
                          })}
                      </Fragment>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detailEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portfolio-detail-title"
          onClick={() => setDetailEntry(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="portfolio-detail-title" className="text-lg font-semibold text-slate-900">
              Offer details
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Vendor</dt>
                <dd className="mt-0.5 text-slate-900">{detailEntry.vendor_name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Price</dt>
                <dd className="mt-0.5 text-slate-900">{detailEntry.price ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Quantity</dt>
                <dd className="mt-0.5 text-slate-900">
                  {detailEntry.quantity != null ? String(detailEntry.quantity) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">URL</dt>
                <dd className="mt-0.5 break-all text-violet-600">
                  {detailEntry.url ? (
                    <a href={detailEntry.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {detailEntry.url}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setDetailEntry(null)}
              className="mt-6 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
