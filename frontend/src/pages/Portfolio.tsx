import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  DollarSign,
  Download,
  ExternalLink,
  Info,
  Loader2,
  Monitor,
  Package,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react"
import { getCurrentUserName, getToken } from "@/lib/auth"
import {
  PortfolioDashboard,
  type PortfolioCoverageRow,
  type PortfolioInsight,
  type PortfolioTopVendor,
} from "@/components/portfolio/PortfolioDashboard"
import {
  excludePortfolioItem,
  getPortfolioSummary,
  listDataSheetSelections,
  listPortfolioItems,
} from "@/lib/api"
import type { PortfolioItem, PortfolioSummary } from "@/lib/api"
import { useBucket } from "@/contexts/BucketContext"
import { useComparison } from "@/contexts/ComparisonContext"
import { COMPARE_NAV_SESSION_KEY, RESEARCH_COMPARE_PATH } from "@/lib/paths"

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PORTFOLIO_REPORT_CONTEXT_KEY = "ir-portfolio-report-context-v1"
const ITEMS_PER_PAGE_OPTIONS = [5, 10, 20, 50] as const

function markCompareNavFromPortfolio(): void {
  try {
    sessionStorage.setItem(COMPARE_NAV_SESSION_KEY, "portfolio")
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function portfolioOfferImageSrc(url: string | null | undefined): string | null {
  if (url == null || typeof url !== "string") return null
  const t = url.trim()
  if (t.length > 2048) return null
  if (!/^https?:\/\//i.test(t)) return null
  return t
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

function vendorUrlLinkLabel(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, "") || href
  } catch {
    return href.length > 36 ? `${href.slice(0, 33)}…` : href
  }
}

function sourceGroupKey(url: string | null | undefined): string {
  if (url && /^https?:\/\//i.test(url)) {
    try {
      const host = new URL(url).hostname.replace(/^www\./i, "").trim()
      if (host) return host
    } catch {
      /* ignore */
    }
  }
  return "Unknown source"
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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

type SourceGroup = {
  rowId: string
  source_label: string | null
  entries: PortfolioItem[]
}

type ViewMode = "part" | "vendor" | "source"

type SortMode = "part-asc" | "part-desc" | "vendors-desc" | "best-asc" | "best-desc"

type VendorSortMode = "vendor-asc" | "vendor-desc" | "parts-desc" | "best-asc" | "best-desc"

type SourceSortMode = "source-asc" | "source-desc" | "offers-desc" | "best-asc" | "best-desc"

function offerFingerprint(e: PortfolioItem): string {
  return `${e.part_number}|${e.vendor_name}|${e.price}|${e.quantity}|${e.url}`
}

type DeleteTarget = {
  partNumber: string | null
  /** True = remove all offers for this part; false = remove one vendor row */
  excludeEntirePart: boolean
  vendorName?: string | null
  url?: string | null
  price?: string | null
  quantity?: number | null
}

/* ------------------------------------------------------------------ */
/*  Pagination                                                         */
/* ------------------------------------------------------------------ */

function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "ellipsis")[] = [1]
  if (current > 3) pages.push("ellipsis")
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push("ellipsis")
  if (total > 1) pages.push(total)
  return pages
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function OfferThumb({ imageUrl }: { imageUrl: string | null | undefined }) {
  const src = portfolioOfferImageSrc(imageUrl)
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400"
        aria-hidden
      >
        <Package className="h-4 w-4" strokeWidth={1.5} />
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
      className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
    />
  )
}

function DeleteConfirmModal({
  target,
  deleting,
  onConfirm,
  onCancel,
}: {
  target: DeleteTarget
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-red-100 bg-red-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                {target.excludeEntirePart
                  ? "Remove Part Research"
                  : "Remove Vendor Offer"}
              </h3>
              <p className="text-sm text-slate-600">
                This can be undone by re-running research.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-6 py-5">
          <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Part
            </p>
            <p className="mt-1 font-medium text-slate-900">{target.partNumber ?? "Unknown"}</p>
          </div>
          {!target.excludeEntirePart && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Vendor
                </p>
                <p className="mt-1 font-medium text-slate-900">
                  {target.vendorName?.trim() ? target.vendorName : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-slate-200/80">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Price
                </p>
                <p className="mt-1 font-medium tabular-nums text-slate-900">
                  {target.price?.trim() ? target.price : "—"}
                </p>
              </div>
            </div>
          )}
          <p className="text-sm leading-relaxed text-slate-600">
            {target.excludeEntirePart
              ? "This will remove all vendor offers for this part from your portfolio view."
              : "This will remove only this vendor line from your portfolio view."}
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {target.excludeEntirePart ? "Remove Part" : "Remove Offer"}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailModal({
  entry,
  onClose,
}: {
  entry: PortfolioItem
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-900/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 bg-slate-900 px-6 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300/90">
            Offer
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">Details</h2>
        </div>
        <dl className="space-y-4 px-6 py-5 text-sm">
          <div className="rounded-xl bg-slate-50/90 px-4 py-3 ring-1 ring-slate-200/80">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Vendor
            </dt>
            <dd className="mt-1 font-medium text-slate-900">
              {entry.vendor_name ?? "—"}
            </dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50/90 px-4 py-3 ring-1 ring-slate-200/80">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Price
              </dt>
              <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                {entry.price ?? "—"}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50/90 px-4 py-3 ring-1 ring-slate-200/80">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Qty
              </dt>
              <dd className="mt-1 font-medium tabular-nums text-slate-900">
                {entry.quantity != null ? String(entry.quantity) : "—"}
              </dd>
            </div>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              URL
            </dt>
            <dd className="mt-1.5 break-all text-sm text-teal-700">
              {entry.url ? (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-teal-700/30 underline-offset-2 hover:decoration-teal-700"
                >
                  {entry.url}
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
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export function PortfolioPage() {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null)

  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("part")
  const [sortMode, setSortMode] = useState<SortMode>("part-asc")
  const [vendorSortMode, setVendorSortMode] = useState<VendorSortMode>("vendor-asc")
  const [sourceSortMode, setSourceSortMode] = useState<SourceSortMode>("source-asc")

  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState<number>(5)

  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(() => new Set())
  const [selectedVendorOfferKey, setSelectedVendorOfferKey] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [detailEntry, setDetailEntry] = useState<PortfolioItem | null>(null)

  const navigate = useNavigate()
  const { items: bucketItems, addItem, showToast } = useBucket()
  const userName = useMemo(() => getCurrentUserName(), [])
  const { openWithItems: openComparison, closeAndClear: clearComparison } = useComparison()
  const token = useMemo(() => getToken(), [])

  /* ---- Part groups ---- */

  const partGroups: PartGroup[] = useMemo(() => {
    const map = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const k = item.part_number ?? "__null_part__"
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

  /* ---- Vendor groups ---- */

  const vendorGroups: VendorGroup[] = useMemo(() => {
    const map = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const k = item.vendor_name ?? "__null_vendor__"
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

  /* ---- Filtered & sorted ---- */

  const filteredSortedPartGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = partGroups
    if (q) {
      list = list.filter((g) => {
        if ((g.part_number ?? "").toLowerCase().includes(q)) return true
        return g.entries.some(
          (e) =>
            (e.vendor_name ?? "").toLowerCase().includes(q) ||
            (e.price ?? "").toLowerCase().includes(q),
        )
      })
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      const partA = (a.part_number ?? "").toLowerCase()
      const partB = (b.part_number ?? "").toLowerCase()
      const minPrice = (g: PartGroup) => {
        const nums = g.entries
          .map((e) => parsePrice(e.price))
          .filter((n): n is number => n != null)
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
            (e.price ?? "").toLowerCase().includes(q),
        )
      })
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      const nameA = (a.vendor_name ?? "").toLowerCase()
      const nameB = (b.vendor_name ?? "").toLowerCase()
      const minPrice = (vg: VendorGroup) => {
        const nums = vg.entries
          .map((e) => parsePrice(e.price))
          .filter((n): n is number => n != null)
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

  const sourceGroups: SourceGroup[] = useMemo(() => {
    const map = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const k = sourceGroupKey(item.url)
      const arr = map.get(k)
      if (arr) arr.push(item)
      else map.set(k, [item])
    }
    const out: SourceGroup[] = []
    let i = 0
    for (const [k, entries] of map.entries()) {
      const source_label = k || null
      out.push({
        rowId: source_label != null ? `source:${source_label}` : `source:null:${i}`,
        source_label,
        entries,
      })
      i += 1
    }
    return out
  }, [portfolioItems])

  const filteredSortedSourceGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = sourceGroups
    if (q) {
      list = list.filter((sg) => {
        const sn = (sg.source_label ?? "").toLowerCase()
        if (sn.includes(q)) return true
        return sg.entries.some(
          (e) =>
            (e.part_number ?? "").toLowerCase().includes(q) ||
            (e.vendor_name ?? "").toLowerCase().includes(q) ||
            (e.price ?? "").toLowerCase().includes(q),
        )
      })
    }
    const sorted = [...list]
    sorted.sort((a, b) => {
      const nameA = (a.source_label ?? "").toLowerCase()
      const nameB = (b.source_label ?? "").toLowerCase()
      const minPrice = (sg: SourceGroup) => {
        const nums = sg.entries
          .map((e) => parsePrice(e.price))
          .filter((n): n is number => n != null)
        return nums.length ? Math.min(...nums) : Number.POSITIVE_INFINITY
      }
      switch (sourceSortMode) {
        case "source-desc":
          return nameB.localeCompare(nameA)
        case "offers-desc":
          return b.entries.length - a.entries.length
        case "best-asc":
          return minPrice(a) - minPrice(b)
        case "best-desc":
          return minPrice(b) - minPrice(a)
        case "source-asc":
        default:
          return nameA.localeCompare(nameB)
      }
    })
    return sorted
  }, [search, sourceGroups, sourceSortMode])

  const activeFilteredList =
    viewMode === "part"
      ? filteredSortedPartGroups
      : viewMode === "vendor"
        ? filteredSortedVendorGroups
        : filteredSortedSourceGroups

  const sharedVendorMatrix = useMemo(() => {
    const vendors = filteredSortedVendorGroups.filter((vg) => {
      const partCount = new Set(
        vg.entries
          .map((e) => (e.part_number ?? "").trim())
          .filter((p) => p.length > 0),
      ).size
      return partCount >= 2
    })
    const partSet = new Set<string>()
    for (const vg of vendors) {
      for (const e of vg.entries) {
        const pn = (e.part_number ?? "").trim()
        if (pn) partSet.add(pn)
      }
    }
    const parts = [...partSet].sort((a, b) => a.localeCompare(b))
    const rows = vendors.map((vg) => {
      const priceByPart = new Map<string, PortfolioItem>()
      for (const e of vg.entries) {
        const pn = (e.part_number ?? "").trim()
        if (!pn) continue
        const existing = priceByPart.get(pn)
        if (!existing) {
          priceByPart.set(pn, e)
          continue
        }
        const current = parsePrice(e.price)
        const prev = parsePrice(existing.price)
        if (current != null && (prev == null || current < prev)) {
          priceByPart.set(pn, e)
        }
      }
      return { vendor: vg.vendor_name ?? "—", priceByPart }
    })
    return { rows, parts }
  }, [filteredSortedVendorGroups])

  /* ---- Resolve part row for vendor view actions ---- */

  const findPartGroupForOffer = useCallback(
    (item: PortfolioItem): PartGroup | undefined => {
      const fp = offerFingerprint(item)
      for (const g of partGroups) {
        if (g.entries.some((e) => offerFingerprint(e) === fp)) return g
      }
      return undefined
    },
    [partGroups],
  )

  const partRowIdForOffer = useCallback(
    (item: PortfolioItem): string | undefined => findPartGroupForOffer(item)?.rowId,
    [findPartGroupForOffer],
  )

  /* ---- Pagination ---- */

  const totalPages = Math.max(1, Math.ceil(activeFilteredList.length / itemsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const paginatedPartGroups =
    viewMode === "part"
      ? (activeFilteredList as PartGroup[]).slice(
          (safePage - 1) * itemsPerPage,
          safePage * itemsPerPage,
        )
      : []
  const paginatedVendorGroups =
    viewMode === "vendor"
      ? (activeFilteredList as VendorGroup[]).slice(
          (safePage - 1) * itemsPerPage,
          safePage * itemsPerPage,
        )
      : []
  const paginatedSourceGroups =
    viewMode === "source"
      ? (activeFilteredList as SourceGroup[]).slice(
          (safePage - 1) * itemsPerPage,
          safePage * itemsPerPage,
        )
      : []
  const showingFrom =
    activeFilteredList.length > 0 ? (safePage - 1) * itemsPerPage + 1 : 0
  const showingTo = Math.min(safePage * itemsPerPage, activeFilteredList.length)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, sortMode, vendorSortMode, sourceSortMode, itemsPerPage, viewMode])

  const dashboardSavings = useMemo(() => {
    let total = 0
    for (const g of partGroups) {
      const prices = g.entries
        .map((e) => parsePrice(e.price))
        .filter((n): n is number => n != null && n > 0)
      if (prices.length < 2) continue
      const best = Math.min(...prices)
      const avg = prices.reduce((s, p) => s + p, 0) / prices.length
      total += Math.max(0, avg - best)
    }
    return total
  }, [partGroups])

  const dashboardTopVendors = useMemo((): PortfolioTopVendor[] => {
    return [...vendorGroups]
      .map((vg) => {
        const parts = new Set(
          vg.entries.map((e) => (e.part_number ?? "").trim()).filter(Boolean),
        ).size
        const score = Math.min(94, Math.max(22, 35 + parts * 8 + Math.min(vg.entries.length, 20)))
        return {
          name: vg.vendor_name?.trim() || "Unknown vendor",
          score,
          parts,
        }
      })
      .sort((a, b) => b.parts - a.parts || b.score - a.score)
      .slice(0, 5)
  }, [vendorGroups])

  const dashboardInsights = useMemo((): PortfolioInsight[] => {
    const out: PortfolioInsight[] = []
    if (dashboardSavings > 0) {
      const bestPart = [...partGroups]
        .map((g) => {
          const prices = g.entries
            .map((e) => parsePrice(e.price))
            .filter((n): n is number => n != null && n > 0)
          if (prices.length < 2) return null
          const best = Math.min(...prices)
          const avg = prices.reduce((s, p) => s + p, 0) / prices.length
          return { part: g.part_number, save: avg - best }
        })
        .filter((x): x is { part: string | null; save: number } => x != null)
        .sort((a, b) => b.save - a.save)[0]
      if (bestPart && bestPart.save > 0) {
        out.push({
          title: `${formatUsd(bestPart.save)} savings on ${bestPart.part ?? "a part"}`,
          body: "Switch to the lowest-priced vendor in your portfolio for this part.",
          accent: "green",
        })
      }
    }
    if (vendorGroups.length >= 2) {
      out.push({
        title: `${vendorGroups.length} vendors tracked`,
        body: "Compare pricing across vendors to find the best total cost.",
        accent: "blue",
      })
    }
    const multiVendorParts = partGroups.filter((g) => g.entries.length >= 2).length
    if (multiVendorParts > 0) {
      out.push({
        title: `${multiVendorParts} parts with multiple offers`,
        body: "Use Compare to rank vendors and add winners to your bucket.",
        accent: "yellow",
      })
    }
    return out.slice(0, 3)
  }, [dashboardSavings, partGroups, vendorGroups.length])

  const dashboardCoverageRows = useMemo((): PortfolioCoverageRow[] => {
    const single = partGroups.filter((g) => g.entries.length === 1).length
    const multi = partGroups.filter((g) => g.entries.length >= 2 && g.entries.length <= 5).length
    const dense = partGroups.filter((g) => g.entries.length > 5).length
    const total = Math.max(partGroups.length, 1)
    return [
      { label: "Single vendor", found: single, total },
      { label: "2–5 vendors", found: multi, total },
      { label: "6+ vendors", found: dense, total },
    ]
  }, [partGroups])

  const partsWithPricing = useMemo(() => {
    return partGroups.filter((g) =>
      g.entries.some((e) => {
        const n = parsePrice(e.price)
        return n != null && n > 0
      }),
    ).length
  }, [partGroups])

  const bucketTotal = useMemo(() => {
    return bucketItems.reduce((sum, item) => {
      const n = parsePrice(item.price)
      const qty = item.qty ?? 1
      return sum + (n != null && n > 0 ? n * qty : 0)
    }, 0)
  }, [bucketItems])

  const coveragePct = useMemo(() => {
    if (partGroups.length === 0) return 0
    return Math.round((partsWithPricing / partGroups.length) * 100)
  }, [partGroups.length, partsWithPricing])

  /* ---- Data loading ---- */

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
        ...selections.map((s) =>
          listPortfolioItems(token, { selectionId: s.id }).catch(
            () => [] as PortfolioItem[],
          ),
        ),
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

  /* ---- Best-entry helpers ---- */

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

  const bestEntryForVendorGroup = useCallback((vg: VendorGroup): PortfolioItem | null => {
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
  }, [])

  const bestEntryForSourceGroup = useCallback((sg: SourceGroup): PortfolioItem | null => {
    let best: PortfolioItem | null = null
    let bestN = Number.POSITIVE_INFINITY
    for (const e of sg.entries) {
      const n = parsePrice(e.price)
      if (n != null && n < bestN) {
        bestN = n
        best = e
      }
    }
    return best
  }, [])

  const toggleVendorPartsSelected = useCallback(
    (vg: VendorGroup) => {
      const best = bestEntryForVendorGroup(vg) ?? vg.entries[0]
      if (!best) return
      const id = partRowIdForOffer(best)
      if (!id) return
      const bestKey = offerFingerprint(best)
      const isSelected = selectedVendorOfferKey === bestKey
      setSelectedPartIds(() => {
        if (isSelected) return new Set<string>()
        // Vendor mode: select one representative part for the chosen vendor.
        return new Set([id])
      })
      setSelectedVendorOfferKey(isSelected ? null : bestKey)
    },
    [bestEntryForVendorGroup, partRowIdForOffer, selectedVendorOfferKey],
  )

  /* ---- Report-context sync ---- */

  useEffect(() => {
    try {
      if (selectedPartIds.size === 0) {
        sessionStorage.removeItem(PORTFOLIO_REPORT_CONTEXT_KEY)
        return
      }
      const parts = partGroups
        .filter((g) => selectedPartIds.has(g.rowId))
        .map((g) => {
          const offer = bestEntryForGroup(g) ?? g.entries[0]
          return {
            part_number: g.part_number ?? null,
            selected_offer: {
              vendor_name: offer?.vendor_name ?? null,
              price: offer?.price ?? null,
              quantity: offer?.quantity ?? null,
              url: offer?.url ?? null,
            },
          }
        })
      if (parts.length === 0) {
        sessionStorage.removeItem(PORTFOLIO_REPORT_CONTEXT_KEY)
        return
      }
      sessionStorage.setItem(
        PORTFOLIO_REPORT_CONTEXT_KEY,
        JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), parts }),
      )
    } catch {
      /* ignore */
    }
  }, [partGroups, selectedPartIds, bestEntryForGroup])

  /* ---- Handlers ---- */

  const togglePartSelected = useCallback((id: string) => {
    setSelectedVendorOfferKey(null)
    setSelectedPartIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleVendorOfferRowSelected = useCallback(
    (offer: PortfolioItem) => {
      const partRowId = partRowIdForOffer(offer)
      if (!partRowId) return
      const key = offerFingerprint(offer)
      const isSelected = selectedVendorOfferKey === key
      if (isSelected) {
        setSelectedVendorOfferKey(null)
        setSelectedPartIds(new Set())
        return
      }
      setSelectedVendorOfferKey(key)
      setSelectedPartIds(new Set([partRowId]))
    },
    [partRowIdForOffer, selectedVendorOfferKey],
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || !token) return
    const pn = deleteTarget.partNumber?.trim()
    if (!pn) return
    setDeleting(true)
    try {
      if (deleteTarget.excludeEntirePart) {
        await excludePortfolioItem(token, {
          part_number: pn,
          exclude_entire_part: true,
        })
        setPortfolioItems((prev) =>
          prev.filter((item) => item.part_number !== deleteTarget.partNumber),
        )
        showToast(`Removed ${deleteTarget.partNumber ?? "part"}`)
      } else {
        await excludePortfolioItem(token, {
          part_number: pn,
          exclude_entire_part: false,
          vendor_name: deleteTarget.vendorName ?? null,
          url: deleteTarget.url ?? null,
          price: deleteTarget.price ?? null,
          quantity: deleteTarget.quantity ?? null,
        })
        setPortfolioItems((prev) =>
          prev.filter(
            (item) =>
              !(
                item.part_number === deleteTarget.partNumber &&
                item.vendor_name === deleteTarget.vendorName &&
                item.url === deleteTarget.url &&
                item.price === deleteTarget.price &&
                item.quantity === deleteTarget.quantity
              ),
          ),
        )
        showToast(
          deleteTarget.vendorName?.trim()
            ? `Removed ${deleteTarget.vendorName} offer`
            : "Removed vendor offer",
        )
      }
      setDeleteTarget(null)
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to remove")
    } finally {
      setDeleting(false)
    }
  }, [deleteTarget, token, showToast])

  const handleExportCsv = useCallback(() => {
    const lines = ["Part Number,Vendor,Price,Quantity,URL"]
    const pushRow = (part: string, e: PortfolioItem) => {
      lines.push(
        [
          `"${part.replaceAll('"', '""')}"`,
          `"${(e.vendor_name ?? "").replaceAll('"', '""')}"`,
          `"${(e.price ?? "").replaceAll('"', '""')}"`,
          e.quantity != null ? String(e.quantity) : "",
          `"${(e.url ?? "").replaceAll('"', '""')}"`,
        ].join(","),
      )
    }
    if (viewMode === "part") {
      for (const g of filteredSortedPartGroups) {
        const part = g.part_number ?? ""
        for (const e of g.entries) pushRow(part, e)
      }
    } else if (viewMode === "vendor") {
      for (const vg of filteredSortedVendorGroups) {
        for (const e of vg.entries) {
          pushRow(e.part_number ?? "", e)
        }
      }
    } else {
      for (const sg of filteredSortedSourceGroups) {
        for (const e of sg.entries) {
          pushRow(e.part_number ?? "", e)
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
  }, [filteredSortedPartGroups, filteredSortedSourceGroups, filteredSortedVendorGroups, showToast, viewMode])

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
    markCompareNavFromPortfolio()
    showToast("Opened comparison")
    navigate(RESEARCH_COMPARE_PATH, {
      state: { returnTo: "/portfolio", initialComparisonItems: items },
    })
  }, [
    bestEntryForGroup,
    clearComparison,
    navigate,
    openComparison,
    partGroups,
    selectedPartIds,
    showToast,
  ])

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
      markCompareNavFromPortfolio()
      showToast("Opened comparison")
      navigate(RESEARCH_COMPARE_PATH, {
        state: { returnTo: "/portfolio", initialComparisonItems: items },
      })
    },
    [clearComparison, navigate, openComparison, showToast],
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
      markCompareNavFromPortfolio()
      showToast("Opened comparison")
      navigate(RESEARCH_COMPARE_PATH, {
        state: { returnTo: "/portfolio", initialComparisonItems: items },
      })
    },
    [clearComparison, navigate, openComparison, showToast],
  )

  const openCompareForSourceGroup = useCallback(
    (sg: SourceGroup) => {
      if (sg.entries.length === 0) return
      clearComparison()
      const items = sg.entries.map((e, idx) => ({
        id: `portfolio-${sg.rowId}-o${idx}`,
        title: e.part_number ?? "Part",
        imageUrl: portfolioOfferImageSrc(e.image_url),
        specs: [
          { label: "Source", value: sg.source_label ?? "—" },
          { label: "Vendor", value: e.vendor_name ?? "—" },
          { label: "Price", value: e.price ?? "—" },
          { label: "Quantity", value: e.quantity != null ? String(e.quantity) : "—" },
          ...(e.url ? [{ label: "URL", value: e.url }] : []),
        ],
        sourceName: sg.source_label,
      }))
      openComparison(items)
      markCompareNavFromPortfolio()
      showToast("Opened comparison")
      navigate(RESEARCH_COMPARE_PATH, {
        state: { returnTo: "/portfolio", initialComparisonItems: items },
      })
    },
    [clearComparison, navigate, openComparison, showToast],
  )

  const addToBucket = useCallback(
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
    [addItem, showToast],
  )

  const addToBucketFromVendorRow = useCallback(
    (e: PortfolioItem) => {
      const pg = findPartGroupForOffer(e)
      if (pg) {
        addToBucket(pg, e)
        return
      }
      const r = addItem({
        id: `portfolio-${e.part_number ?? "p"}-${e.vendor_name ?? "v"}-${e.price ?? ""}`,
        title: e.part_number ?? e.vendor_name ?? "Item",
        manufacturer: e.vendor_name ?? "",
        price: e.price ?? "",
        rowIndex: 0,
        tabId: "portfolio",
      })
      showToast(r.added ? "Added to Bucket" : "Already in Bucket")
    },
    [addItem, addToBucket, findPartGroupForOffer, showToast],
  )

  const errorMessage = !token ? "Sign in to view portfolio." : loadError

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const uniquePartsCount =
    portfolioSummary?.unique_parts ?? partGroups.length

  return (
    <div className="min-h-[calc(100vh-3.5rem)] w-full overflow-x-hidden bg-slate-50">
      <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6">
        <PortfolioDashboard
          loading={loading}
          userName={userName}
          uniqueParts={uniquePartsCount}
          vendorCount={vendorGroups.length}
          offerCount={portfolioSummary?.offer_count ?? portfolioItems.length}
          bucketTotal={bucketTotal}
          bucketItems={bucketItems}
          savingsTotal={dashboardSavings}
          coveragePct={coveragePct}
          partsWithOffers={partsWithPricing}
          topVendors={dashboardTopVendors}
          insights={dashboardInsights}
          coverageRows={dashboardCoverageRows}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">Portfolio data</h2>
            <p className="text-xs text-slate-500">
              Review quotes, remove incorrect research, and compare selected parts.
            </p>
          </div>
          {token && !loading && portfolioItems.length > 0 && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              <span className="font-semibold tabular-nums text-slate-900">{activeFilteredList.length}</span>
              {' '}
              {viewMode === "part" ? "parts" : viewMode === "vendor" ? "vendors" : "sources"} in view
            </span>
          )}
        </div>

        {/* ── Selection banner ── */}
        {token && selectedPartIds.size > 0 && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/90 bg-linear-to-r from-amber-50/95 to-orange-50/80 px-4 py-3 text-sm text-amber-950 shadow-sm">
            <span>
              <span className="font-semibold tabular-nums">{selectedPartIds.size}</span>{" "}
              part{selectedPartIds.size === 1 ? "" : "s"} selected for comparison &amp;
              reports
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedPartIds(new Set())
                  setSelectedVendorOfferKey(null)
                }}
                className="font-medium text-amber-900/90 underline decoration-amber-700/40 underline-offset-2 transition hover:text-amber-950"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleCompareSelected}
                className="rounded-lg bg-amber-900/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-900"
              >
                Compare selected
              </button>
            </div>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="mb-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                placeholder="Search parts, vendors, or prices…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50/90 py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-teal-300/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <div
                className="inline-flex rounded-lg border border-slate-200/90 bg-slate-50/80 p-1"
                role="group"
                aria-label="Group by"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("part")}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-all ${
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
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-all ${
                    viewMode === "vendor"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  By vendor
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("source")}
                  className={`rounded-md px-3 py-2 text-sm font-semibold transition-all ${
                    viewMode === "source"
                      ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  By source
                </button>
              </div>
              <div className="relative">
                {viewMode === "part" ? (
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    aria-label="Sort parts"
                  >
                    <option value="part-asc">Sort: Part A–Z</option>
                    <option value="part-desc">Sort: Part Z–A</option>
                    <option value="vendors-desc">Sort: Most vendors</option>
                    <option value="best-asc">Sort: Lowest price</option>
                    <option value="best-desc">Sort: Highest price</option>
                  </select>
                ) : viewMode === "vendor" ? (
                  <select
                    value={vendorSortMode}
                    onChange={(e) => setVendorSortMode(e.target.value as VendorSortMode)}
                    className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    aria-label="Sort vendors"
                  >
                    <option value="vendor-asc">Sort: Vendor A–Z</option>
                    <option value="vendor-desc">Sort: Vendor Z–A</option>
                    <option value="parts-desc">Sort: Most parts</option>
                    <option value="best-asc">Sort: Lowest price</option>
                    <option value="best-desc">Sort: Highest price</option>
                  </select>
                ) : (
                  <select
                    value={sourceSortMode}
                    onChange={(e) => setSourceSortMode(e.target.value as SourceSortMode)}
                    className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    aria-label="Sort sources"
                  >
                    <option value="source-asc">Sort: Source A–Z</option>
                    <option value="source-desc">Sort: Source Z–A</option>
                    <option value="offers-desc">Sort: Most offers</option>
                    <option value="best-asc">Sort: Lowest price</option>
                    <option value="best-desc">Sort: Highest price</option>
                  </select>
                )}
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
              <div className="relative">
                <select
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(Number(e.target.value))}
                  className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  aria-label="Items per page"
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} per page
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!token || activeFilteredList.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* ── Page indicator ── */}
        {token && !loading && !errorMessage && activeFilteredList.length > 0 && (
          <div className="mb-4 flex items-center justify-between px-1 text-sm text-slate-600">
            <span>
              Showing{" "}
              <span className="font-semibold text-slate-800">
                {showingFrom}–{showingTo}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-800">
                {activeFilteredList.length}
              </span>{" "}
              {viewMode === "part" ? "parts" : viewMode === "vendor" ? "vendors" : "sources"}
            </span>
            <span className="text-slate-500">
              Page {safePage} of {totalPages}
            </span>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && token && (
          <div className="flex items-center justify-center rounded-xl border border-slate-200/90 bg-white py-20 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                <Loader2 className="h-7 w-7 animate-spin" />
              </span>
              <span className="text-sm font-medium text-slate-700">
                Loading portfolio…
              </span>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {!loading && errorMessage && (
          <div className="flex items-center justify-center rounded-xl border border-slate-200/90 bg-white py-16 shadow-sm">
            <p
              className={`text-sm ${!token ? "text-slate-600" : "text-red-600"}`}
            >
              {errorMessage}
            </p>
          </div>
        )}

        {/* ── Empty ── */}
        {token && !loading && !errorMessage && portfolioItems.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-slate-200/90 bg-white py-20 shadow-sm">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <Package className="h-8 w-8" strokeWidth={1.5} />
              </span>
              <p className="text-base font-medium text-slate-800">
                No portfolio data yet
              </p>
              <p className="text-sm leading-relaxed text-slate-500">
                Run &quot;Research Selected&quot; from your datasheet workflow to
                populate offers here.
              </p>
            </div>
          </div>
        )}

        {/* ── Part cards ── */}
        {token && !loading && !errorMessage && viewMode === "part" && paginatedPartGroups.length > 0 && (
          <div className="space-y-4">
            {paginatedPartGroups.map((g) => {
              const minForGroup = (() => {
                const nums = g.entries
                  .map((e) => parsePrice(e.price))
                  .filter((n): n is number => n != null)
                return nums.length ? Math.min(...nums) : null
              })()
              const isChecked = selectedPartIds.has(g.rowId)

              return (
                <article
                  key={g.rowId}
                  className={`overflow-hidden rounded-xl border bg-white shadow-sm transition ${
                    isChecked
                      ? "border-teal-300 ring-2 ring-teal-500/20"
                      : "border-slate-200/90 hover:shadow-md"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => togglePartSelected(g.rowId)}
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 focus:ring-teal-500/40"
                        aria-label={`Select ${g.part_number ?? "part"}`}
                      />
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900">
                          {g.part_number ?? "Unknown Part"}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {g.entries.length} vendor{g.entries.length === 1 ? "" : "s"}
                          {minForGroup != null && (
                            <>
                              {" "}
                              &middot; Best:{" "}
                              <span className="font-semibold text-emerald-600">{formatUsd(minForGroup)}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openCompareForGroup(g)}
                        disabled={g.entries.length < 2}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Compare vendors"
                      >
                        <Monitor className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const best = bestEntryForGroup(g) ?? g.entries[0]
                          if (best) addToBucket(g, best)
                        }}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
                        title="Add best to bucket"
                      >
                        <ShoppingBag className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeleteTarget({
                            partNumber: g.part_number,
                            excludeEntirePart: true,
                          })
                        }
                        className="rounded-lg border border-red-200 bg-white p-2 text-red-400 shadow-sm transition hover:bg-red-50 hover:text-red-600"
                        title="Remove part research"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    {g.entries.map((e, vi) => {
                      const n = parsePrice(e.price)
                      const isBest = n != null && minForGroup != null && n === minForGroup
                      const safeUrl = portfolioOfferImageSrc(e.url)
                      return (
                        <div
                          key={`${g.rowId}-v-${vi}`}
                          className={`rounded-xl border bg-white p-3 shadow-sm transition ${
                            isBest
                              ? "border-emerald-200 ring-1 ring-emerald-500/20"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <OfferThumb imageUrl={e.image_url} />
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-800">
                                  {e.vendor_name ?? "—"}
                                </p>
                                {isBest && (
                                  <span className="mt-1 inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    <DollarSign className="h-2.5 w-2.5" />
                                    Best offer
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                              <p className="font-medium uppercase tracking-wider text-slate-500">Price</p>
                              <p className="mt-1 font-semibold tabular-nums text-slate-900">
                                {displayPrice(e.price, n)}
                              </p>
                            </div>
                            <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                              <p className="font-medium uppercase tracking-wider text-slate-500">Qty</p>
                              <p className="mt-1 font-semibold tabular-nums text-slate-900">
                                {e.quantity != null ? e.quantity.toLocaleString() : "—"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            {safeUrl ? (
                              <a
                                href={safeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="max-w-32 truncate">{vendorUrlLinkLabel(safeUrl)}</span>
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400">No source URL</span>
                            )}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => addToBucket(g, e)}
                                className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                title="Add to bucket"
                              >
                                <ShoppingBag className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailEntry(e)}
                                className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                title="View details"
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({
                                    partNumber: g.part_number,
                                    excludeEntirePart: false,
                                    vendorName: e.vendor_name ?? null,
                                    url: e.url ?? null,
                                    price: e.price ?? null,
                                    quantity: e.quantity ?? null,
                                  })
                                }
                                className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                                title="Remove this vendor offer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* ── Vendor cards ── */}
        {token && !loading && !errorMessage && viewMode === "vendor" && paginatedVendorGroups.length > 0 && (
          <div className="space-y-4">
            {sharedVendorMatrix.rows.length > 0 && sharedVendorMatrix.parts.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Shared Vendors - Price By Part
                    </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/30 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="sticky left-0 z-10 min-w-40 bg-slate-50/90 py-2.5 pl-5 pr-3">
                          Vendor
                        </th>
                        {sharedVendorMatrix.parts.map((part) => (
                          <th key={`matrix-head-${part}`} className="px-3 py-2.5">
                            {part}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sharedVendorMatrix.rows.map((row) => (
                        <tr
                          key={`matrix-row-${row.vendor}`}
                          className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50/50"
                        >
                          <td className="sticky left-0 z-10 bg-white py-2.5 pl-5 pr-3 font-medium text-slate-800">
                            {row.vendor}
                          </td>
                          {sharedVendorMatrix.parts.map((part) => {
                            const offer = row.priceByPart.get(part)
                            if (!offer) {
                              return (
                                <td
                                  key={`matrix-cell-${row.vendor}-${part}`}
                                  className="px-3 py-2.5 text-slate-400"
                                >
                                  —
                                </td>
                              )
                            }
                            const safeUrl = portfolioOfferImageSrc(offer.url)
                            return (
                              <td key={`matrix-cell-${row.vendor}-${part}`} className="px-3 py-2.5">
                                {safeUrl ? (
                                  <a
                                    href={safeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-medium tabular-nums text-slate-700 hover:text-teal-700 hover:underline"
                                  >
                                    {displayPrice(offer.price, parsePrice(offer.price))}
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="font-medium tabular-nums text-slate-700">
                                    {displayPrice(offer.price, parsePrice(offer.price))}
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            {paginatedVendorGroups.map((vg) => {
              const minForVendor = (() => {
                const nums = vg.entries
                  .map((e) => parsePrice(e.price))
                  .filter((n): n is number => n != null)
                return nums.length ? Math.min(...nums) : null
              })()
              const vendorOfferKeys = vg.entries.map((e) => offerFingerprint(e))
              const vendorSelected = vendorOfferKeys.some((k) => k === selectedVendorOfferKey)

              return (
                <article
                  key={vg.rowId}
                  className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={vendorSelected}
                        onChange={() => toggleVendorPartsSelected(vg)}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 focus:ring-teal-500/40"
                        aria-label={`Select one part from ${vg.vendor_name ?? "vendor"}`}
                      />
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <Building2 className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900">
                          {vg.vendor_name ?? "Unknown vendor"}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {vg.entries.length} part{vg.entries.length === 1 ? "" : "s"}
                          {minForVendor != null && (
                            <>
                              {" "}
                              &middot; From{" "}
                              <span className="font-semibold text-emerald-600">
                                {formatUsd(minForVendor)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openCompareForVendorGroup(vg)}
                        disabled={vg.entries.length < 2}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Compare parts from this vendor"
                      >
                        <Monitor className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const best = bestEntryForVendorGroup(vg) ?? vg.entries[0]
                          if (best) addToBucketFromVendorRow(best)
                        }}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
                        title="Add best price to bucket"
                      >
                        <ShoppingBag className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/30 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="w-10 py-2.5 pl-5" aria-label="Select" />
                          <th className="py-2.5 pr-3">Part number</th>
                          <th className="px-3 py-2.5">Price</th>
                          <th className="px-3 py-2.5">Qty</th>
                          <th className="px-3 py-2.5">Source</th>
                          <th className="py-2.5 pl-3 pr-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vg.entries.map((e, vi) => {
                          const n = parsePrice(e.price)
                          const isBest =
                            n != null &&
                            minForVendor != null &&
                            n === minForVendor
                          const safeUrl = portfolioOfferImageSrc(e.url)
                          const partRowId = partRowIdForOffer(e)
                          const offerKey = offerFingerprint(e)
                          return (
                            <tr
                              key={`${vg.rowId}-p-${vi}`}
                              className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50/50"
                            >
                              <td className="py-3 pl-5 align-middle">
                                {partRowId ? (
                                  <input
                                    type="checkbox"
                                    checked={selectedVendorOfferKey === offerKey}
                                    onChange={() => toggleVendorOfferRowSelected(e)}
                                    className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 focus:ring-teal-500/40"
                                    aria-label={`Select part ${e.part_number ?? "—"}`}
                                  />
                                ) : null}
                              </td>
                              <td className="py-3 pr-3 align-middle">
                                <div className="flex items-center gap-2.5">
                                  <OfferThumb imageUrl={e.image_url} />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-800">
                                      {e.part_number ?? "—"}
                                    </p>
                                    {isBest && (
                                      <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                        <DollarSign className="h-2.5 w-2.5" />
                                        Best
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 align-middle font-medium tabular-nums text-slate-900">
                                {displayPrice(e.price, n)}
                              </td>
                              <td className="px-3 py-3 align-middle tabular-nums text-slate-600">
                                {e.quantity != null ? e.quantity.toLocaleString() : "—"}
                              </td>
                              <td className="px-3 py-3 align-middle">
                                {safeUrl ? (
                                  <a
                                    href={safeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    <span className="max-w-32 truncate">
                                      {vendorUrlLinkLabel(safeUrl)}
                                    </span>
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3 pl-3 pr-5 align-middle">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => addToBucketFromVendorRow(e)}
                                    className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                    title="Add to bucket"
                                  >
                                    <ShoppingBag className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDetailEntry(e)}
                                    className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                    title="View details"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteTarget({
                                        partNumber: e.part_number,
                                        excludeEntirePart: false,
                                        vendorName: e.vendor_name ?? null,
                                        url: e.url ?? null,
                                        price: e.price ?? null,
                                        quantity: e.quantity ?? null,
                                      })
                                    }
                                    disabled={!e.part_number?.trim()}
                                    className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                                    title={
                                      e.part_number?.trim()
                                        ? "Remove this offer"
                                        : "Part number required to remove"
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* ── Source cards ── */}
        {token && !loading && !errorMessage && viewMode === "source" && paginatedSourceGroups.length > 0 && (
          <div className="space-y-4">
            {paginatedSourceGroups.map((sg) => {
              const minForSource = (() => {
                const nums = sg.entries
                  .map((e) => parsePrice(e.price))
                  .filter((n): n is number => n != null)
                return nums.length ? Math.min(...nums) : null
              })()
              return (
                <article
                  key={sg.rowId}
                  className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <ExternalLink className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900">
                          {sg.source_label ?? "Unknown source"}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {sg.entries.length} offer{sg.entries.length === 1 ? "" : "s"}
                          {minForSource != null && (
                            <>
                              {" "}
                              &middot; From{" "}
                              <span className="font-semibold text-emerald-600">
                                {formatUsd(minForSource)}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openCompareForSourceGroup(sg)}
                        disabled={sg.entries.length < 2}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Compare offers from this source"
                      >
                        <Monitor className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const best = bestEntryForSourceGroup(sg) ?? sg.entries[0]
                          if (best) addToBucketFromVendorRow(best)
                        }}
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700"
                        title="Add best price to bucket"
                      >
                        <ShoppingBag className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/30 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="w-10 py-2.5 pl-5" aria-label="Select" />
                          <th className="py-2.5 pr-3">Part number</th>
                          <th className="px-3 py-2.5">Vendor</th>
                          <th className="px-3 py-2.5">Price</th>
                          <th className="px-3 py-2.5">Qty</th>
                          <th className="px-3 py-2.5">Source</th>
                          <th className="py-2.5 pl-3 pr-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sg.entries.map((e, vi) => {
                          const n = parsePrice(e.price)
                          const isBest =
                            n != null && minForSource != null && n === minForSource
                          const safeUrl = portfolioOfferImageSrc(e.url)
                          const partRowId = partRowIdForOffer(e)
                          const offerKey = offerFingerprint(e)
                          return (
                            <tr
                              key={`${sg.rowId}-o-${vi}`}
                              className="border-b border-slate-50 transition last:border-0 hover:bg-slate-50/50"
                            >
                              <td className="py-3 pl-5 align-middle">
                                {partRowId ? (
                                  <input
                                    type="checkbox"
                                    checked={selectedVendorOfferKey === offerKey}
                                    onChange={() => toggleVendorOfferRowSelected(e)}
                                    className="h-4 w-4 rounded border-slate-300 text-teal-600 accent-teal-600 focus:ring-teal-500/40"
                                    aria-label={`Select part ${e.part_number ?? "—"}`}
                                  />
                                ) : null}
                              </td>
                              <td className="py-3 pr-3 align-middle">
                                <div className="flex items-center gap-2.5">
                                  <OfferThumb imageUrl={e.image_url} />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-800">
                                      {e.part_number ?? "—"}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 align-middle text-slate-700">
                                {e.vendor_name ?? "—"}
                              </td>
                              <td className="px-3 py-3 align-middle font-medium tabular-nums text-slate-900">
                                <span>{displayPrice(e.price, n)}</span>
                                {isBest ? (
                                  <span className="ml-2 inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    <DollarSign className="h-2.5 w-2.5" />
                                    Best
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-3 align-middle tabular-nums text-slate-600">
                                {e.quantity != null ? e.quantity.toLocaleString() : "—"}
                              </td>
                              <td className="px-3 py-3 align-middle">
                                {safeUrl ? (
                                  <a
                                    href={safeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    <span className="max-w-32 truncate">
                                      {vendorUrlLinkLabel(safeUrl)}
                                    </span>
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-3 pl-3 pr-5 align-middle">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => addToBucketFromVendorRow(e)}
                                    className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                    title="Add to bucket"
                                  >
                                    <ShoppingBag className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDetailEntry(e)}
                                    className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                    title="View details"
                                  >
                                    <Info className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteTarget({
                                        partNumber: e.part_number,
                                        excludeEntirePart: false,
                                        vendorName: e.vendor_name ?? null,
                                        url: e.url ?? null,
                                        price: e.price ?? null,
                                        quantity: e.quantity ?? null,
                                      })
                                    }
                                    disabled={!e.part_number?.trim()}
                                    className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                                    title={
                                      e.part_number?.trim()
                                        ? "Remove this offer"
                                        : "Part number required to remove"
                                    }
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {token &&
          !loading &&
          !errorMessage &&
          activeFilteredList.length > itemsPerPage && (
            <nav
              className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-slate-200/90 bg-white/90 px-5 py-4 shadow-sm backdrop-blur-sm sm:flex-row"
              aria-label="Pagination"
            >
              <p className="text-sm text-slate-600">
                Showing{" "}
                <span className="font-medium text-slate-800">{showingFrom}</span>
                –
                <span className="font-medium text-slate-800">{showingTo}</span>{" "}
                of{" "}
                <span className="font-medium text-slate-800">
                  {activeFilteredList.length}
                </span>{" "}
                {viewMode === "part" ? "parts" : viewMode === "vendor" ? "vendors" : "sources"}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage <= 1}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.max(1, p - 1))
                  }
                  disabled={safePage <= 1}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {getPageNumbers(safePage, totalPages).map((pg, idx) =>
                  pg === "ellipsis" ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1 text-slate-400"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={pg}
                      type="button"
                      onClick={() => setCurrentPage(pg)}
                      className={`min-w-9 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                        pg === safePage
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }`}
                    >
                      {pg}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={safePage >= totalPages}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage >= totalPages}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            </nav>
          )}
      </div>

      {/* ── Delete confirmation modal ── */}
      {deleteTarget && (
        <DeleteConfirmModal
          target={deleteTarget}
          deleting={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Detail modal ── */}
      {detailEntry && (
        <DetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />
      )}
    </div>
  )
}
