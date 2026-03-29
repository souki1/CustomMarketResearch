import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDown,
  ArrowRight,
  Building2,
  ChevronDown,
  DollarSign,
  Download,
  ExternalLink,
  Loader2,
  Monitor,
  MoreHorizontal,
  Package,
  Search,
  ShoppingBag,
  Info,
} from "lucide-react"
import { getToken } from "@/lib/auth"
import { getPortfolioSummary, listDataSheetSelections, listPortfolioItems } from "@/lib/api"
import type { PortfolioItem, PortfolioSummary } from "@/lib/api"
import { useBucket } from "@/contexts/BucketContext"
import { useComparison } from "@/contexts/ComparisonContext"
import { RESEARCH_COMPARE_PATH } from "@/lib/paths"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const PORTFOLIO_REPORT_CONTEXT_KEY = "ir-portfolio-report-context-v1"

/** Shared table row styles */
const ROW_MAIN =
  "border-b border-slate-100/90 bg-white transition-colors hover:bg-teal-50/40"
const ROW_NESTED = "border-b border-slate-100/80 bg-slate-50/[0.85]"
const CHECK =
  "h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 focus:ring-teal-500/40"

function portfolioOfferImageSrc(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string") return null
  const t = url.trim()
  if (t.length > 2048) return null
  if (!/^https?:\/\//i.test(t)) return null
  return t
}

function PortfolioOfferThumb({ imageUrl }: { imageUrl: string | null | undefined }) {
  const src = portfolioOfferImageSrc(imageUrl)
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-100/90 text-slate-400"
        aria-hidden
      >
        <Package className="h-5 w-5" strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-10 w-10 shrink-0 rounded-lg border border-slate-200/90 bg-white object-cover"
    />
  )
}

function vendorUrlLinkLabel(href: string): string {
  try {
    const u = new URL(href)
    return u.hostname.replace(/^www\./i, "") || href
  } catch {
    return href.length > 36 ? `${href.slice(0, 33)}…` : href
  }
}

function PortfolioThumbWithVendorLink({
  imageUrl,
  vendorUrl,
}: {
  imageUrl: string | null | undefined
  vendorUrl: string | null | undefined
}) {
  const href = portfolioOfferImageSrc(vendorUrl)
  return (
    <div className="flex min-w-0 max-w-[min(100%,18rem)] items-center gap-2.5 sm:max-w-sm">
      <PortfolioOfferThumb imageUrl={imageUrl} />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={href}
          className="flex min-w-0 items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-teal-600/90" aria-hidden />
          <span className="min-w-0 truncate">{vendorUrlLinkLabel(href)}</span>
        </a>
      ) : (
        <span className="text-xs text-slate-400">—</span>
      )}
    </div>
  )
}

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

type VendorGroup = {
  rowId: string
  vendor_name: string | null
  entries: PortfolioItem[]
}

type SortMode = "part-asc" | "part-desc" | "vendors-desc" | "best-asc" | "best-desc"

type VendorSortMode = "vendor-asc" | "vendor-desc" | "parts-desc" | "best-asc" | "best-desc"

type ViewMode = "part" | "vendor"

function offerKey(e: PortfolioItem): string {
  return `${e.part_number}|${e.vendor_name}|${e.price}|${e.quantity}`
}

function bestEntryForVendorGroup(vg: VendorGroup): PortfolioItem | null {
  let best: PortfolioItem | null = null
  let bestN = Number.POSITIVE_INFINITY
  for (const e of vg.entries) {
    const n = parsePrice(e.price)
    if (n != null && n < bestN) {
      bestN = n
      best = e
    }
  }
  return best
}

export function PortfolioPage() {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [search, setSearch] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("part-asc")
  const [vendorSortMode, setVendorSortMode] = useState<VendorSortMode>("vendor-asc")
  const [viewMode, setViewMode] = useState<ViewMode>("part")
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(() => new Set())
  /** Collapsed row: which vendor offer is selected in the dropdown (per part group). */
  const [vendorChoiceByPart, setVendorChoiceByPart] = useState<Record<string, number>>({})
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null)
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

  const vendorGroups: VendorGroup[] = useMemo(() => {
    const keyFor = (item: PortfolioItem): string => item.vendor_name ?? "__null_vendor__"
    const map = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const k = keyFor(item)
      const arr = map.get(k)
      if (arr) arr.push(item)
      else map.set(k, [item])
    }
    const out: VendorGroup[] = []
    let i = 0
    for (const [k, entries] of map.entries()) {
      const vendor_name = k === "__null_vendor__" ? null : k
      out.push({
        rowId: vendor_name != null ? `vendor:${vendor_name}` : `vendor:null:${i}`,
        vendor_name,
        entries,
      })
      i += 1
    }
    return out
  }, [portfolioItems])

  const partRowIdForOffer = useCallback(
    (item: PortfolioItem): string | undefined => {
      const want = offerKey(item)
      for (const g of partGroups) {
        if (g.entries.some((e) => offerKey(e) === want)) return g.rowId
      }
      return undefined
    },
    [partGroups]
  )

  const findPartGroupForOffer = useCallback(
    (item: PortfolioItem): PartGroup | undefined => {
      const want = offerKey(item)
      for (const g of partGroups) {
        if (g.entries.some((e) => offerKey(e) === want)) return g
      }
      return undefined
    },
    [partGroups]
  )

  /** Selection-only metrics (when user checks parts). Portfolio-wide totals come from `portfolioSummary` (API). */
  const selectionStats = useMemo(() => {
    const hasPartSelection = selectedPartIds.size > 0
    const selectedNums: number[] = []
    if (hasPartSelection) {
      for (const g of partGroups) {
        if (!selectedPartIds.has(g.rowId)) continue
        for (const e of g.entries) {
          const n = parsePrice(e.price)
          if (n != null && n > 0) selectedNums.push(n)
        }
      }
    }

    let best = 0
    let avg = 0
    let avgOfferCount = 0
    if (hasPartSelection) {
      avgOfferCount = selectedNums.length
      if (selectedNums.length) {
        best = Math.min(...selectedNums)
        avg = selectedNums.reduce((a, b) => a + b, 0) / selectedNums.length
      }
    }

    return { best, avg, avgUsesSelection: hasPartSelection, avgOfferCount }
  }, [partGroups, selectedPartIds])

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

  const filteredSortedVendorGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = vendorGroups
    if (q) {
      list = list.filter((vg) => {
        const vn = (vg.vendor_name ?? "").toLowerCase()
        if (vn.includes(q)) return true
        return vg.entries.some(
          (e) =>
            (e.part_number ?? "").toLowerCase().includes(q) ||
            (e.price ?? "").toLowerCase().includes(q)
        )
      })
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      const nameA = (a.vendor_name ?? "").toLowerCase()
      const nameB = (b.vendor_name ?? "").toLowerCase()
      const minPrice = (vg: VendorGroup) => {
        const nums = vg.entries.map((e) => parsePrice(e.price)).filter((n): n is number => n != null)
        return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY
      }
      switch (vendorSortMode) {
        case "vendor-desc":
          return nameB.localeCompare(nameA)
        case "parts-desc":
          return b.entries.length - a.entries.length
        case "best-asc":
          return minPrice(a) - minPrice(b)
        case "best-desc":
          return minPrice(b) - minPrice(a)
        case "vendor-asc":
        default:
          return nameA.localeCompare(nameB)
      }
    })
    return sorted
  }, [vendorGroups, search, vendorSortMode])

  const loadPortfolio = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(null)
    setPortfolioItems([])
    setPortfolioSummary(null)
    try {
      const selections = await listDataSheetSelections(token)
      if (selections.length === 0) return
      const [summary, ...results] = await Promise.all([
        getPortfolioSummary(token).catch(() => null),
        ...selections.map((s) => listPortfolioItems(token, s.id).catch(() => [] as PortfolioItem[])),
      ])
      setPortfolioSummary(summary)
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

  const bestEntryIndexForGroup = useCallback((g: PartGroup): number => {
    let bestI = 0
    let bestN = Number.POSITIVE_INFINITY
    for (let i = 0; i < g.entries.length; i++) {
      const n = parsePrice(g.entries[i]!.price)
      if (n != null && n < bestN) {
        bestN = n
        bestI = i
      }
    }
    return bestI
  }, [])

  useEffect(() => {
    try {
      if (selectedPartIds.size === 0) {
        sessionStorage.removeItem(PORTFOLIO_REPORT_CONTEXT_KEY)
        return
      }

      const parts = partGroups
        .filter((g) => selectedPartIds.has(g.rowId))
        .map((g) => {
          const savedChoice = vendorChoiceByPart[g.rowId]
          const choiceIdx =
            savedChoice != null && savedChoice >= 0 && savedChoice < g.entries.length
              ? savedChoice
              : bestEntryIndexForGroup(g)
          const selectedOffer = g.entries[choiceIdx] ?? g.entries[0]

          return {
            part_number: g.part_number ?? null,
            selected_offer: {
              vendor_name: selectedOffer?.vendor_name ?? null,
              price: selectedOffer?.price ?? null,
              quantity: selectedOffer?.quantity ?? null,
              url: selectedOffer?.url ?? null,
            },
          }
        })

      if (parts.length === 0) {
        sessionStorage.removeItem(PORTFOLIO_REPORT_CONTEXT_KEY)
        return
      }

      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        parts,
      }
      sessionStorage.setItem(PORTFOLIO_REPORT_CONTEXT_KEY, JSON.stringify(payload))
    } catch {
      // ignore (private mode, storage disabled, etc.)
    }
  }, [partGroups, selectedPartIds, vendorChoiceByPart, bestEntryIndexForGroup])

  const handleExportCsv = useCallback(() => {
    const lines = ["Part Number,Vendor,Price,Quantity,URL"]
    const pushGroup = (g: PartGroup) => {
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
    if (viewMode === "part") {
      for (const g of filteredSortedGroups) pushGroup(g)
    } else {
      for (const vg of filteredSortedVendorGroups) {
        for (const e of vg.entries) {
          const part = (e.part_number ?? "").replaceAll('"', '""')
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
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `portfolio-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    showToast("Exported CSV")
  }, [filteredSortedGroups, filteredSortedVendorGroups, showToast, viewMode])

  const openCompareForGroup = useCallback(
    (g: PartGroup) => {
      if (g.entries.length === 0) return
      clearComparison()
      const items = g.entries.map((e, idx) => ({
        id: `portfolio-${g.rowId}-v${idx}`,
        title: e.vendor_name ?? "Vendor",
        imageUrl: portfolioOfferImageSrc(e.image_url),
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

  const openCompareForVendorGroup = useCallback(
    (vg: VendorGroup) => {
      if (vg.entries.length === 0) return
      clearComparison()
      const items = vg.entries.map((e, idx) => ({
        id: `portfolio-${vg.rowId}-p${idx}`,
        title: e.part_number ?? "Part",
        imageUrl: portfolioOfferImageSrc(e.image_url),
        specs: [
          { label: "Vendor", value: e.vendor_name ?? "—" },
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

  const toggleVendorPartsSelected = useCallback(
    (vg: VendorGroup) => {
      const ids = vg.entries
        .map((e) => partRowIdForOffer(e))
        .filter((id): id is string => id != null)
      if (ids.length === 0) return
      const allSelected = ids.every((id) => selectedPartIds.has(id))
      setSelectedPartIds((prev) => {
        const next = new Set(prev)
        if (allSelected) for (const id of ids) next.delete(id)
        else for (const id of ids) next.add(id)
        return next
      })
    },
    [partRowIdForOffer, selectedPartIds]
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
        imageUrl: portfolioOfferImageSrc(best.image_url),
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
    <div className="relative min-h-[calc(100vh-3.5rem)] overflow-x-hidden bg-[linear-gradient(165deg,#e8eef5_0%,#f8fafc_38%,#ffffff_100%)]">
      <div className="relative mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-10 flex flex-col gap-6 border-b border-slate-200/90 pb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-800/90">
              Sourcing overview
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Portfolio
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-[15px]">
              Compare vendor quotes side by side, track best and average pricing for your
              selection, then export or send parts to comparison and reports.
            </p>
          </div>
          {token && !loading && portfolioItems.length > 0 && (
            <div className="flex shrink-0 items-center gap-2 self-start rounded-full border border-slate-200/90 bg-white/90 px-4 py-2 text-sm shadow-sm ring-1  backdrop-blur-sm sm:self-auto">
              <span className="font-semibold tabular-nums text-slate-900">
                {viewMode === "part"
                  ? filteredSortedGroups.length
                  : filteredSortedVendorGroups.length}
              </span>
              <span className="text-slate-500">
                {viewMode === "part" ? "parts in view" : "vendors in view"}
              </span>
            </div>
          )}
        </header>

        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 to-cyan-500" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Unique parts
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                  {!token || loading
                    ? "—"
                    : portfolioSummary != null
                      ? portfolioSummary.unique_parts
                      : partGroups.length}
                </p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-700/10">
                <Package className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
          </article>
          <article className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-1  from-slate-600 to-slate-400" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Line items
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                  {!token || loading
                    ? "—"
                    : portfolioSummary != null
                      ? portfolioSummary.offer_count
                      : portfolioItems.length}
                </p>
                <p className="mt-1 text-xs text-slate-500">Vendor offers loaded</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 ring-1 ring-slate-900/5">
                <Building2 className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
          </article>
          <article className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-1  from-emerald-500 to-teal-500" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Best price
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-emerald-600">
                  {!token || loading
                    ? "—"
                    : selectionStats.avgUsesSelection
                      ? selectionStats.avgOfferCount > 0
                        ? formatUsd(selectionStats.best)
                        : "—"
                      : portfolioSummary?.best_price != null
                        ? formatUsd(portfolioSummary.best_price)
                        : "—"}
                </p>
                {!loading && token && (
                  <p className="mt-1.5 text-xs leading-snug text-slate-500">
                    {selectionStats.avgUsesSelection
                      ? selectionStats.avgOfferCount > 0
                        ? `Lowest of ${selectionStats.avgOfferCount} price${selectionStats.avgOfferCount === 1 ? "" : "s"} from ${selectedPartIds.size} checked part${selectedPartIds.size === 1 ? "" : "s"}.`
                        : `No positive prices on ${selectedPartIds.size} checked part${selectedPartIds.size === 1 ? "" : "s"}.`
                      : portfolioSummary != null && portfolioSummary.prices_included > 0
                        ? `Lowest across ${portfolioSummary.prices_included} offer${portfolioSummary.prices_included === 1 ? "" : "s"} with valid prices (server).`
                        : "No positive prices in portfolio yet."}
                  </p>
                )}
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-600/20">
                <DollarSign className="h-5 w-5" strokeWidth={2} />
              </span>
            </div>
          </article>
          <article className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-md">
            <div className="absolute inset-x-0 top-0 h-1  from-indigo-500 to-slate-500" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Average price
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-800">
                  {!token || loading
                    ? "—"
                    : selectionStats.avgUsesSelection
                      ? selectionStats.avgOfferCount > 0
                        ? formatUsd(selectionStats.avg)
                        : "—"
                      : portfolioSummary?.average_price != null
                        ? formatUsd(portfolioSummary.average_price)
                        : "—"}
                </p>
                {!loading && token && (
                  <p className="mt-1.5 text-xs leading-snug text-slate-500">
                    {selectionStats.avgUsesSelection
                      ? selectionStats.avgOfferCount > 0
                        ? `Mean of ${selectionStats.avgOfferCount} price${selectionStats.avgOfferCount === 1 ? "" : "s"} from ${selectedPartIds.size} checked part${selectedPartIds.size === 1 ? "" : "s"}.`
                        : `No positive prices on checked parts.`
                      : portfolioSummary != null && portfolioSummary.prices_included > 0
                        ? `Mean across ${portfolioSummary.prices_included} offer${portfolioSummary.prices_included === 1 ? "" : "s"} with valid prices (server).`
                        : "No positive prices to average yet."}
                  </p>
                )}
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-800 text-white shadow-sm ring-2 ring-slate-800/15">
                <DollarSign className="h-5 w-5" strokeWidth={2} />
              </span>
            </div>
          </article>
        </div>

        {token && selectedPartIds.size > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/90  from-amber-50/95 to-orange-50/80 px-4 py-3 text-sm text-amber-950 shadow-sm ring-1 ring-amber-900/[0.06]">
            <span>
              <span className="font-semibold tabular-nums">{selectedPartIds.size}</span> part
              {selectedPartIds.size === 1 ? "" : "s"} selected for comparison and reports
            </span>
            <button
              type="button"
              onClick={() => setSelectedPartIds(new Set())}
              className="font-medium text-amber-900/90 underline decoration-amber-700/40 underline-offset-2 transition hover:text-amber-950"
            >
              Clear selection
            </button>
          </div>
        )}

        <div className="mb-5 rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm ring-1  backdrop-blur-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search parts, vendors, or prices…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/90 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-300/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div
                className="inline-flex rounded-xl border border-slate-200/90 bg-slate-50/80 p-1"
                role="group"
                aria-label="Group by"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("part")}
                  className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
                    viewMode === "part"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  By part
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("vendor")}
                  className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
                    viewMode === "vendor"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  By vendor
                </button>
              </div>
              <div className="relative ">
                {viewMode === "part" ? (
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    aria-label="Sort"
                  >
                    <option value="part-asc">Sort: Part A–Z</option>
                    <option value="part-desc">Sort: Part Z–A</option>
                    <option value="vendors-desc">Sort: Most vendors</option>
                    <option value="best-asc">Sort: Lowest best price</option>
                    <option value="best-desc">Sort: Highest best price</option>
                  </select>
                ) : (
                  <select
                    value={vendorSortMode}
                    onChange={(e) => setVendorSortMode(e.target.value as VendorSortMode)}
                    className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    aria-label="Sort vendors"
                  >
                    <option value="vendor-asc">Sort: Vendor A–Z</option>
                    <option value="vendor-desc">Sort: Vendor Z–A</option>
                    <option value="parts-desc">Sort: Most parts</option>
                    <option value="best-asc">Sort: Lowest price</option>
                    <option value="best-desc">Sort: Highest price</option>
                  </select>
                )}
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={
                  !token ||
                  (viewMode === "part"
                    ? filteredSortedGroups.length === 0
                    : filteredSortedVendorGroups.length === 0)
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={handleCompareSelected}
                disabled={!token || selectedPartIds.size === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-slate-900/15 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Compare selected
              </button>
            </div>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] ring-1 ">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-3 sm:px-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Offer matrix</h2>
              <p className="text-xs text-slate-500">
                Expand rows for every vendor line. Checkbox parts to include in metrics and
                downstream flows.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-[#0f172a] text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <th className="w-10 px-3 py-3.5 sm:px-4" aria-label="Select" />
                  {viewMode === "part" ? (
                    <>
                      <th className="px-3 py-3.5 sm:px-4">Part number</th>
                      <th className="px-3 py-3.5 sm:px-4">Vendor</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-3.5 sm:px-4">Vendor</th>
                      <th className="px-3 py-3.5 sm:px-4">Part number</th>
                    </>
                  )}
                  <th className="px-3 py-3.5 sm:px-4">Price</th>
                  <th className="w-12 px-3 py-3.5 text-right sm:px-4" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {loading && token && (
                  <tr className={ROW_MAIN}>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <span className="inline-flex flex-col items-center gap-3 text-slate-600">
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </span>
                        <span className="text-sm font-medium">Loading portfolio…</span>
                      </span>
                    </td>
                  </tr>
                )}

                {!loading && errorMessage && (
                  <tr className={ROW_MAIN}>
                    <td
                      colSpan={5}
                      className={`px-6 py-14 text-center text-sm ${!token ? "text-slate-600" : "text-red-600"}`}
                    >
                      {errorMessage}
                    </td>
                  </tr>
                )}

                {token && !loading && !errorMessage && portfolioItems.length === 0 && (
                  <tr className={ROW_MAIN}>
                    <td colSpan={5} className="px-6 py-16 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                          <Package className="h-7 w-7" strokeWidth={1.5} />
                        </span>
                        <p className="text-sm font-medium text-slate-800">No portfolio data yet</p>
                        <p className="text-xs leading-relaxed text-slate-500">
                          Run &quot;Research Selected&quot; from your datasheet workflow to populate
                          offers here.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {token &&
                  !loading &&
                  !errorMessage &&
                  viewMode === "part" &&
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
                    const savedChoice = vendorChoiceByPart[g.rowId]
                    const choiceIdx =
                      savedChoice != null && savedChoice >= 0 && savedChoice < g.entries.length
                        ? savedChoice
                        : bestEntryIndexForGroup(g)
                    const selectedOffer = g.entries[choiceIdx] ?? g.entries[0]

                    return (
                      <Fragment key={g.rowId}>
                        <tr className={ROW_MAIN}>
                          <td className="px-3 py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={selectedPartIds.has(g.rowId)}
                              onChange={() => togglePartSelected(g.rowId)}
                              onClick={(e) => e.stopPropagation()}
                              className={CHECK}
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
                                  className="h-4 w-4 shrink-0 text-teal-600"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              ) : (
                                <ArrowRight
                                  className="h-4 w-4 shrink-0 text-teal-600"
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
                            ) : g.entries.length > 1 ? (
                              <div className="min-w-0 max-w-[min(100%,16rem)]">
                                <label htmlFor={`portfolio-vendor-${g.rowId}`} className="sr-only">
                                  Vendor offer for part {g.part_number ?? "—"}
                                </label>
                                <div className="relative">
                                  <select
                                    id={`portfolio-vendor-${g.rowId}`}
                                    value={choiceIdx}
                                    onChange={(e) =>
                                      setVendorChoiceByPart((prev) => ({
                                        ...prev,
                                        [g.rowId]: Number(e.target.value),
                                      }))
                                    }
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full cursor-pointer appearance-none truncate rounded-lg border border-slate-200 bg-white py-2 pl-2.5 pr-8 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                  >
                                    {g.entries.map((entry, ei) => {
                                      const pn = parsePrice(entry.price)
                                      return (
                                        <option key={`${g.rowId}-vopt-${ei}`} value={ei}>
                                          {(entry.vendor_name ?? "Vendor")} —{" "}
                                          {displayPrice(entry.price, pn)}
                                        </option>
                                      )
                                    })}
                                  </select>
                                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                </div>
                                <p className="mt-1 text-xs text-slate-500">
                                  {g.entries.length} vendor{g.entries.length === 1 ? "" : "s"} — expand for all
                                </p>
                              </div>
                            ) : (
                              <span className="line-clamp-2">{collapsedDisplay}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-middle tabular-nums text-slate-900">
                            {expanded
                              ? "—"
                              : g.entries.length > 1 && selectedOffer
                                ? displayPrice(selectedOffer.price, parsePrice(selectedOffer.price))
                                : collapsedPrice}
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
                            const safeOfferUrl = portfolioOfferImageSrc(e.url)
                            return (
                              <tr
                                key={`${g.rowId}-v-${vi}`}
                                className={ROW_NESTED}
                              >
                                <td className="px-3 py-2" />
                                <td className="px-3 py-2 align-middle">
                                  <PortfolioThumbWithVendorLink
                                    imageUrl={e.image_url}
                                    vendorUrl={e.url}
                                  />
                                </td>
                                <td className="px-3 py-2 pl-12">
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium text-slate-800">
                                      {e.vendor_name ? (
                                        safeOfferUrl ? (
                                          <a
                                            href={safeOfferUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-slate-800 hover:text-teal-700 hover:underline"
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
                                              imageUrl: portfolioOfferImageSrc(e.image_url),
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

                {token &&
                  !loading &&
                  !errorMessage &&
                  viewMode === "vendor" &&
                  filteredSortedVendorGroups.map((vg) => {
                    const expanded = expandedIds.has(vg.rowId)
                    const minForVendor = (() => {
                      const nums = vg.entries
                        .map((e) => parsePrice(e.price))
                        .filter((n): n is number => n != null)
                      return nums.length ? Math.min(...nums) : null
                    })()
                    const collapsedPart = vg.entries[0]
                    const collapsedPrice = collapsedPart
                      ? displayPrice(collapsedPart.price, parsePrice(collapsedPart.price))
                      : "—"
                    const vendorPartIds = vg.entries
                      .map((e) => partRowIdForOffer(e))
                      .filter((id): id is string => id != null)
                    const allVendorPartsSelected =
                      vendorPartIds.length > 0 &&
                      vendorPartIds.every((id) => selectedPartIds.has(id))
                    const someVendorPartsSelected = vendorPartIds.some((id) =>
                      selectedPartIds.has(id)
                    )
                    const bestV = bestEntryForVendorGroup(vg)

                    return (
                      <Fragment key={vg.rowId}>
                        <tr className={ROW_MAIN}>
                          <td className="px-3 py-3 align-middle">
                            <input
                              ref={(el) => {
                                if (el)
                                  el.indeterminate =
                                    someVendorPartsSelected && !allVendorPartsSelected
                              }}
                              type="checkbox"
                              checked={allVendorPartsSelected}
                              onChange={() => toggleVendorPartsSelected(vg)}
                              onClick={(e) => e.stopPropagation()}
                              className={CHECK}
                              aria-label={`Select all parts from ${vg.vendor_name ?? "vendor"}`}
                            />
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(vg.rowId)}
                              aria-expanded={expanded}
                              className="flex w-full items-center gap-2 text-left font-medium text-slate-900"
                            >
                              {expanded ? (
                                <ArrowDown
                                  className="h-4 w-4 shrink-0 text-teal-600"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              ) : (
                                <ArrowRight
                                  className="h-4 w-4 shrink-0 text-teal-600"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {vg.vendor_name ?? "—"}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-3 align-middle text-slate-700">
                            {expanded ? (
                              <span className="text-slate-400">—</span>
                            ) : vg.entries.length > 1 ? (
                              <div className="min-w-0 max-w-md">
                                <textarea
                                  id={`portfolio-part-list-${vg.rowId.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                                  readOnly
                                  rows={Math.min(8, Math.max(2, vg.entries.length))}
                                  value={vg.entries
                                    .map((entry) => {
                                      const pn = parsePrice(entry.price)
                                      return `${entry.part_number ?? "—"} — ${displayPrice(entry.price, pn)}`
                                    })
                                    .join("\n")}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={`Parts from ${vg.vendor_name ?? "vendor"}`}
                                  className="w-full resize-none overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 py-2 px-2.5 text-sm leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                  {vg.entries.length} part{vg.entries.length === 1 ? "" : "s"} — expand
                                  row for actions
                                </p>
                              </div>
                            ) : (
                              <span className="font-medium text-slate-800">
                                {collapsedPart?.part_number ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 align-middle tabular-nums text-slate-900">
                            {expanded ? (
                              "—"
                            ) : vg.entries.length > 1 ? (
                              <div>
                                <span>
                                  {minForVendor != null
                                    ? formatUsd(minForVendor)
                                    : "—"}
                                </span>
                                {minForVendor != null && (
                                  <p className="mt-0.5 text-xs font-normal text-slate-500">
                                    Lowest price
                                  </p>
                                )}
                              </div>
                            ) : (
                              collapsedPrice
                            )}
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
                                    const e = bestV ?? vg.entries[0]
                                    const pg = e ? findPartGroupForOffer(e) : undefined
                                    if (e && pg) addVendorToBucket(pg, e)
                                  }}
                                >
                                  <ShoppingBag className="h-4 w-4" />
                                  Add to Bucket
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="flex cursor-pointer items-center gap-2"
                                  onSelect={() => openCompareForVendorGroup(vg)}
                                >
                                  <Monitor className="h-4 w-4" />
                                  Compare
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="flex cursor-pointer items-center gap-2"
                                  onSelect={() => {
                                    const e = bestV ?? vg.entries[0]
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
                          vg.entries.map((e, vi) => {
                            const n = parsePrice(e.price)
                            const isBest =
                              n != null && minForVendor != null && n === minForVendor
                            const partRowId = partRowIdForOffer(e)
                            const pg = findPartGroupForOffer(e)
                            return (
                              <tr
                                key={`${vg.rowId}-p-${vi}`}
                                className={ROW_NESTED}
                              >
                                <td className="px-3 py-2 align-middle">
                                  {partRowId ? (
                                    <input
                                      type="checkbox"
                                      checked={selectedPartIds.has(partRowId)}
                                      onChange={() => togglePartSelected(partRowId)}
                                      onClick={(ev) => ev.stopPropagation()}
                                      className={CHECK}
                                      aria-label={`Select part ${e.part_number ?? "—"}`}
                                    />
                                  ) : null}
                                </td>
                                <td className="px-3 py-2 align-middle">
                                  <PortfolioThumbWithVendorLink
                                    imageUrl={e.image_url}
                                    vendorUrl={e.url}
                                  />
                                </td>
                                <td className="px-3 py-2 pl-12">
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium text-slate-800">
                                      {e.part_number ?? "—"}
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
                                        aria-label="Part row actions"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="min-w-[200px]" align="end">
                                      <DropdownMenuItem
                                        className="flex cursor-pointer items-center gap-2"
                                        onSelect={() => {
                                          if (pg) addVendorToBucket(pg, e)
                                        }}
                                        disabled={!pg}
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
                                              id: `portfolio-vendor-one-${vg.rowId}-${vi}`,
                                              title: e.part_number ?? "Part",
                                              imageUrl: portfolioOfferImageSrc(e.image_url),
                                              specs: [
                                                {
                                                  label: "Vendor",
                                                  value: e.vendor_name ?? "—",
                                                },
                                                { label: "Price", value: e.price ?? "—" },
                                                {
                                                  label: "Quantity",
                                                  value:
                                                    e.quantity != null
                                                      ? String(e.quantity)
                                                      : "—",
                                                },
                                                ...(e.url
                                                  ? [{ label: "URL", value: e.url }]
                                                  : []),
                                              ],
                                              sourceName: e.vendor_name,
                                            },
                                          ])
                                          showToast("Opened comparison")
                                          navigate(RESEARCH_COMPARE_PATH, {
                                            state: { returnTo: "/portfolio" },
                                          })
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
        </section>
      </div>

      {detailEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portfolio-detail-title"
          onClick={() => setDetailEntry(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 bg-slate-900 px-6 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300/90">
                Offer
              </p>
              <h2 id="portfolio-detail-title" className="mt-1 text-lg font-semibold text-white">
                Details
              </h2>
            </div>
            <dl className="space-y-4 px-6 py-5 text-sm">
              <div className="rounded-xl bg-slate-50/90 px-4 py-3 ring-1 ring-slate-200/80">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Vendor
                </dt>
                <dd className="mt-1 font-medium text-slate-900">{detailEntry.vendor_name ?? "—"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50/90 px-4 py-3 ring-1 ring-slate-200/80">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Price
                  </dt>
                  <dd className="mt-1 tabular-nums font-semibold text-slate-900">
                    {detailEntry.price ?? "—"}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50/90 px-4 py-3 ring-1 ring-slate-200/80">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Qty
                  </dt>
                  <dd className="mt-1 tabular-nums font-medium text-slate-900">
                    {detailEntry.quantity != null ? String(detailEntry.quantity) : "—"}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  URL
                </dt>
                <dd className="mt-1.5 break-all text-sm text-teal-700">
                  {detailEntry.url ? (
                    <a
                      href={detailEntry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700"
                    >
                      {detailEntry.url}
                    </a>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </dd>
              </div>
            </dl>
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                type="button"
                onClick={() => setDetailEntry(null)}
                className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
