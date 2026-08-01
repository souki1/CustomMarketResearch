import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  FileText,
  FlaskConical,
  Heart,
  ShoppingCart,
  TrendingDown,
} from 'lucide-react'
import { EnterpriseDashboard } from '@/components/dashboard/EnterpriseDashboard'
import type {
  DashboardActivity,
  DashboardCategoryRow,
  DashboardTopVendor,
} from '@/components/dashboard/EnterpriseDashboard'
import { useBucket } from '@/contexts/BucketContext'
import { getCurrentUserName, getToken } from '@/lib/auth'
import {
  getPortfolioSummary,
  listDataSheetSelections,
  listPortfolioItems,
  listResearchGridSummary,
  listWorkspaceItems,
} from '@/lib/api'
import type { DataSheetSelection, PortfolioItem, ResearchGridSummaryRow } from '@/lib/api'

function parsePrice(s: string | null | undefined): number | null {
  if (s == null || !String(s).trim()) return null
  const cleaned = String(s).replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseBucketPrice(price: string): number {
  const n = parsePrice(price)
  return n != null && n >= 0 ? n : 0
}

function buildTrend(endValue: number, steps = 7): number[] {
  const safeEnd = Math.max(0, endValue)
  if (safeEnd === 0) return Array(steps).fill(0)
  const out: number[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const eased = 0.55 + t * 0.45
    out.push(Math.round(safeEnd * eased * (0.72 + t * 0.28)))
  }
  out[steps - 1] = safeEnd
  return out
}

/** Group portfolio offers by part number (vendors for the same PN stay one part). */
function portfolioPartKey(item: PortfolioItem): string {
  const pn = (item.part_number ?? '').trim().toUpperCase()
  if (pn) return `pn:${pn}`
  if (item.row_index != null) return `row:${item.row_index}`
  return `url:${(item.url ?? '').trim() || 'unknown'}`
}

function hasVendorOffer(item: PortfolioItem): boolean {
  const price = parsePrice(item.price)
  if (price != null && price > 0) return true
  return Boolean(item.vendor_name?.trim())
}

function isResearchedGridRow(row: ResearchGridSummaryRow): boolean {
  return row.has_structured_data || row.structured_sources_count > 0
}

/** Latest selection per file/tab; sum row counts so total parts = sheet rows, not vendor offers. */
function countPartsFromSelections(selections: DataSheetSelection[]): number {
  if (selections.length === 0) return 0
  const bySheet = new Map<string, DataSheetSelection>()
  for (const s of selections) {
    const key =
      s.file_id != null ? `file:${s.file_id}` : s.tab_id ? `tab:${s.tab_id}` : `sel:${s.id}`
    const prev = bySheet.get(key)
    if (!prev || new Date(s.created_at).getTime() > new Date(prev.created_at).getTime()) {
      bySheet.set(key, s)
    }
  }
  let total = 0
  for (const s of bySheet.values()) {
    total += s.rows?.length ?? 0
  }
  return total
}

/**
 * Same signal as ResearchFoundBadge: unique sheet rows (table_row_index) with structured scrape data.
 * Avoids collapsing separate parts that share selection-local row_index 0 across runs.
 */
async function loadResearchRowCoverage(
  token: string,
  fileIds: number[],
  tabIds: string[]
): Promise<{ researched: number; tracked: number }> {
  const jobs: Promise<ResearchGridSummaryRow[]>[] = [
    ...fileIds.map((fileId) =>
      listResearchGridSummary(token, { fileId }).catch(() => [] as ResearchGridSummaryRow[])
    ),
    ...tabIds.map((tabId) =>
      listResearchGridSummary(token, { tabId }).catch(() => [] as ResearchGridSummaryRow[])
    ),
  ]
  if (jobs.length === 0) return { researched: 0, tracked: 0 }

  const summaries = await Promise.all(jobs)
  // Dedupe by sheet scope + table row so the same row isn't counted twice.
  const seen = new Set<string>()
  let researched = 0
  let tracked = 0
  const scopes = [
    ...fileIds.map((id) => `file:${id}`),
    ...tabIds.map((id) => `tab:${id}`),
  ]
  summaries.forEach((rows, i) => {
    const scope = scopes[i] ?? `scope:${i}`
    for (const row of rows) {
      const key = `${scope}:${row.table_row_index}`
      if (seen.has(key)) continue
      seen.add(key)
      tracked += 1
      if (isResearchedGridRow(row)) researched += 1
    }
  })
  return { researched, tracked }
}

export function DashboardPage() {
  const { items: bucketItems } = useBucket()
  const [userName, setUserName] = useState(() => getCurrentUserName())
  const [loading, setLoading] = useState(true)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [selectionPartCount, setSelectionPartCount] = useState(0)
  const [researchedPartsCount, setResearchedPartsCount] = useState(0)
  const [trackedResearchRows, setTrackedResearchRows] = useState(0)
  const [offerCount, setOfferCount] = useState(0)
  const [fileCount, setFileCount] = useState(0)

  useEffect(() => {
    const stored = getCurrentUserName()
    if (stored) setUserName(stored)
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setPortfolioItems([])
      setSelectionPartCount(0)
      setResearchedPartsCount(0)
      setTrackedResearchRows(0)
      setOfferCount(0)
      setFileCount(0)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    Promise.all([
      listPortfolioItems(token),
      getPortfolioSummary(token),
      listWorkspaceItems(null, token),
      listDataSheetSelections(token).catch(() => [] as DataSheetSelection[]),
    ])
      .then(async ([items, summary, workspace, selections]) => {
        if (cancelled) return
        const files = workspace.filter((w) => !w.is_folder)
        const fileIds = files.map((f) => f.id)
        const tabIds = [
          ...new Set(
            selections
              .map((s) => s.tab_id)
              .filter((id): id is string => Boolean(id && String(id).trim()))
          ),
        ]
        // Also include file_ids from selections in case workspace root listing missed nested files.
        for (const s of selections) {
          if (s.file_id != null && !fileIds.includes(s.file_id)) fileIds.push(s.file_id)
        }
        const coverage = await loadResearchRowCoverage(token, fileIds, tabIds)
        if (cancelled) return
        setPortfolioItems(items)
        setSelectionPartCount(countPartsFromSelections(selections))
        setResearchedPartsCount(coverage.researched)
        setTrackedResearchRows(coverage.tracked)
        setOfferCount(summary.offer_count)
        setFileCount(files.length)
      })
      .catch(() => {
        if (!cancelled) {
          setPortfolioItems([])
          setSelectionPartCount(0)
          setResearchedPartsCount(0)
          setTrackedResearchRows(0)
          setOfferCount(0)
          setFileCount(0)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const bucketTotal = useMemo(
    () =>
      bucketItems.reduce((sum, item) => {
        const unit = parseBucketPrice(item.price)
        const qty = item.qty ?? 1
        return sum + unit * qty
      }, 0),
    [bucketItems]
  )

  const partsWithOffers = useMemo(() => {
    const byPart = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const key = portfolioPartKey(item)
      const list = byPart.get(key) ?? []
      list.push(item)
      byPart.set(key, list)
    }
    let count = 0
    for (const entries of byPart.values()) {
      if (entries.some(hasVendorOffer)) count++
    }
    return count
  }, [portfolioItems])

  const vendorCount = useMemo(() => {
    const names = new Set<string>()
    for (const item of portfolioItems) {
      const v = item.vendor_name?.trim()
      if (v) names.add(v)
    }
    return names.size
  }, [portfolioItems])

  const savingsTotal = useMemo(() => {
    const byPart = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const key = portfolioPartKey(item)
      const list = byPart.get(key) ?? []
      list.push(item)
      byPart.set(key, list)
    }
    let total = 0
    for (const entries of byPart.values()) {
      const prices = entries
        .map((e) => parsePrice(e.price))
        .filter((n): n is number => n != null && n > 0)
      if (prices.length < 2) continue
      const best = Math.min(...prices)
      const avg = prices.reduce((s, p) => s + p, 0) / prices.length
      total += Math.max(0, avg - best)
    }
    return total
  }, [portfolioItems])

  // Prefer research-grid row counts (matches Research "N found" badges), then selection size.
  const partsResearched = Math.max(researchedPartsCount, 0)
  const totalParts = Math.max(
    selectionPartCount,
    trackedResearchRows,
    partsResearched,
    // Fallback if grid/selection empty but portfolio still has priced unique parts
    partsResearched === 0 ? partsWithOffers : 0
  )
  const unresearchedParts = Math.max(0, totalParts - partsResearched)

  const topVendors = useMemo((): DashboardTopVendor[] => {
    if (portfolioItems.length === 0) return []
    const byVendor = new Map<string, { parts: Set<string>; spend: number; offers: number }>()
    for (const item of portfolioItems) {
      const name = item.vendor_name?.trim() || 'Unknown vendor'
      const partKey = portfolioPartKey(item)
      const price = parsePrice(item.price) ?? 0
      const cur = byVendor.get(name) ?? { parts: new Set(), spend: 0, offers: 0 }
      cur.parts.add(partKey)
      cur.spend += price
      cur.offers += 1
      byVendor.set(name, cur)
    }
    return [...byVendor.entries()]
      .map(([name, data]) => ({
        name,
        parts: data.parts.size,
        spend: data.spend,
        score: Math.min(94, Math.max(22, 35 + data.parts.size * 8 + Math.min(data.offers, 20))),
        trend: (data.offers % 3 === 0 ? 'down' : data.offers % 2 === 0 ? 'flat' : 'up') as
          | 'up'
          | 'down'
          | 'flat',
      }))
      .sort((a, b) => b.parts - a.parts || b.score - a.score)
      .slice(0, 4)
  }, [portfolioItems])

  const categoryRows = useMemo((): DashboardCategoryRow[] => {
    if (portfolioItems.length === 0) return []
    const byPart = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const key = portfolioPartKey(item)
      const list = byPart.get(key) ?? []
      list.push(item)
      byPart.set(key, list)
    }
    const groups = [...byPart.values()]
    const multi = groups.filter((g) => g.filter((e) => e.vendor_name?.trim()).length >= 2).length
    const single = groups.filter((g) => g.filter((e) => e.vendor_name?.trim()).length === 1).length
    const withPricing = groups.filter((g) => g.some(hasVendorOffer)).length
    const total = groups.length
    return [
      { label: 'Multi-vendor parts', total, found: multi },
      { label: 'Single vendor', total, found: single },
      { label: 'With pricing', total, found: withPricing },
      { label: 'Needs more offers', total, found: Math.max(0, total - withPricing) },
    ]
  }, [portfolioItems])

  const coveragePct = totalParts > 0 ? Math.round((partsResearched / totalParts) * 100) : 0
  const spendTrend = buildTrend(bucketTotal)
  const researchTrend = buildTrend(coveragePct)

  const dateLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }, [])

  const recentActivity = useMemo((): DashboardActivity[] => {
    const items: DashboardActivity[] = []
    const add = (message: string, time: string, accentClass: string, icon: ReactNode) => {
      items.push({ message, time, accentClass, icon })
    }

    if (partsResearched > 0) {
      add(
        `${partsResearched} parts with vendor offers in portfolio`,
        'Overview',
        'bg-blue-50 text-blue-600',
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
      )
    }
    if (bucketItems.length > 0) {
      const last = bucketItems[bucketItems.length - 1]
      add(
        `${last?.title ?? 'Item'} added to bucket`,
        'Bucket',
        'bg-emerald-50 text-emerald-600',
        <ShoppingCart className="h-3.5 w-3.5" strokeWidth={1.75} />
      )
    }
    if (savingsTotal > 0) {
      add(
        `${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(savingsTotal)} savings identified`,
        'Insights',
        'bg-amber-50 text-amber-600',
        <TrendingDown className="h-3.5 w-3.5" strokeWidth={1.75} />
      )
    }
    if (unresearchedParts > 0) {
      add(
        `${unresearchedParts} parts still need research`,
        'Research',
        'bg-red-50 text-red-600',
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
      )
    }
    if (fileCount > 0) {
      add(
        `${fileCount} workspace file${fileCount !== 1 ? 's' : ''} uploaded`,
        'Files',
        'bg-blue-50 text-blue-600',
        <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
      )
    }
    add(
      'Open wishlists to track priority parts',
      'Wishlist',
      'bg-violet-50 text-violet-600',
      <Heart className="h-3.5 w-3.5" strokeWidth={1.75} />
    )

    return items.slice(0, 6)
  }, [
    partsResearched,
    bucketItems,
    savingsTotal,
    unresearchedParts,
    fileCount,
  ])

  const fileRowsHint =
    offerCount > 0
      ? `${offerCount} offers tracked`
      : fileCount > 0
        ? `${fileCount} file${fileCount !== 1 ? 's' : ''}`
        : 'No files yet'

  return (
    <div className="min-h-full overflow-y-auto bg-slate-50 p-5">
      <EnterpriseDashboard
        loading={loading}
        userName={userName}
        dateLabel={dateLabel}
        partsResearched={partsResearched}
        totalParts={totalParts}
        vendorCount={vendorCount}
        bucketTotal={bucketTotal}
        bucketItemCount={bucketItems.length}
        savingsTotal={savingsTotal}
        fileCount={fileCount}
        fileRowsHint={fileRowsHint}
        unresearchedParts={unresearchedParts}
        spendTrend={spendTrend}
        researchTrend={researchTrend}
        topVendors={topVendors}
        categoryRows={categoryRows}
        recentActivity={recentActivity}
      />
    </div>
  )
}
