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
import { getPortfolioSummary, listPortfolioItems, listWorkspaceItems } from '@/lib/api'
import type { PortfolioItem } from '@/lib/api'

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

const DEMO_CATEGORY_ROWS: DashboardCategoryRow[] = [
  { label: 'Multi-vendor parts', total: 24, found: 18 },
  { label: 'Single vendor', total: 31, found: 12 },
  { label: 'With pricing', total: 55, found: 42 },
  { label: 'Needs research', total: 56, found: 8 },
]

const DEMO_TOP_VENDORS: DashboardTopVendor[] = [
  { name: "Messick's", score: 94, parts: 67, spend: 459.8, trend: 'up' },
  { name: 'Super Parts Factory', score: 76, parts: 44, spend: 174.95, trend: 'up' },
  { name: 'Bahrns.com', score: 58, parts: 38, spend: 47.98, trend: 'down' },
  { name: 'Bingham Equipment', score: 68, parts: 29, spend: 88.5, trend: 'flat' },
]

export function DashboardPage() {
  const { items: bucketItems } = useBucket()
  const [userName, setUserName] = useState(() => getCurrentUserName())
  const [loading, setLoading] = useState(true)
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([])
  const [uniqueParts, setUniqueParts] = useState(0)
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
      setUniqueParts(67)
      setOfferCount(142)
      setFileCount(5)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    Promise.all([
      listPortfolioItems(token),
      getPortfolioSummary(token),
      listWorkspaceItems(null, token),
    ])
      .then(([items, summary, workspace]) => {
        if (cancelled) return
        setPortfolioItems(items)
        setUniqueParts(summary.unique_parts)
        setOfferCount(summary.offer_count)
        setFileCount(workspace.filter((w) => !w.is_folder).length)
      })
      .catch(() => {
        if (!cancelled) {
          setPortfolioItems([])
          setUniqueParts(0)
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
      const key = (item.part_number ?? '').trim() || `row-${item.row_index ?? 'unknown'}`
      const list = byPart.get(key) ?? []
      list.push(item)
      byPart.set(key, list)
    }
    let count = 0
    for (const entries of byPart.values()) {
      const hasPrice = entries.some((e) => {
        const n = parsePrice(e.price)
        return n != null && n > 0
      })
      if (hasPrice) count++
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
      const key = (item.part_number ?? '').trim() || `row-${item.row_index ?? 'unknown'}`
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
    return total > 0 ? total : loading ? 0 : 642
  }, [portfolioItems, loading])

  const totalParts = useMemo(() => {
    if (uniqueParts > 0) return uniqueParts
    return loading ? 0 : 111
  }, [uniqueParts, loading])

  const partsResearched = useMemo(() => {
    if (partsWithOffers > 0) return partsWithOffers
    return loading ? 0 : 67
  }, [partsWithOffers, loading])

  const unresearchedParts = Math.max(0, totalParts - partsResearched)

  const topVendors = useMemo((): DashboardTopVendor[] => {
    if (portfolioItems.length === 0 && !loading) {
      return getToken() ? [] : DEMO_TOP_VENDORS
    }
    const byVendor = new Map<string, { parts: Set<string>; spend: number; offers: number }>()
    for (const item of portfolioItems) {
      const name = item.vendor_name?.trim() || 'Unknown vendor'
      const partKey = (item.part_number ?? '').trim() || `row-${item.row_index ?? 'x'}`
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
  }, [portfolioItems, loading])

  const categoryRows = useMemo((): DashboardCategoryRow[] => {
    if (portfolioItems.length === 0 && !loading) {
      return getToken() ? [] : DEMO_CATEGORY_ROWS
    }
    const byPart = new Map<string, PortfolioItem[]>()
    for (const item of portfolioItems) {
      const key = (item.part_number ?? '').trim() || `row-${item.row_index ?? 'unknown'}`
      const list = byPart.get(key) ?? []
      list.push(item)
      byPart.set(key, list)
    }
    const groups = [...byPart.values()]
    const multi = groups.filter((g) => g.length >= 2).length
    const single = groups.filter((g) => g.length === 1).length
    const withPricing = groups.filter((g) =>
      g.some((e) => {
        const n = parsePrice(e.price)
        return n != null && n > 0
      })
    ).length
    const total = Math.max(groups.length, 1)
    return [
      { label: 'Multi-vendor parts', total, found: multi },
      { label: 'Single vendor', total, found: single },
      { label: 'With pricing', total, found: withPricing },
      { label: 'Needs more offers', total, found: Math.max(0, total - withPricing) },
    ]
  }, [portfolioItems, loading])

  const coveragePct = totalParts > 0 ? Math.round((partsResearched / totalParts) * 100) : 0
  const spendTrend = buildTrend(Math.max(bucketTotal, spendLatestFallback(bucketTotal)))
  const researchTrend = buildTrend(coveragePct)

  function spendLatestFallback(bucket: number): number {
    if (bucket > 0) return bucket
    return loading ? 0 : 2100
  }

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
    offerCount > 0 ? `${offerCount} offers tracked` : fileCount > 0 ? `${fileCount} files` : '340 total rows'

  return (
    <div className="min-h-full overflow-y-auto bg-slate-50 p-5">
      <EnterpriseDashboard
        loading={loading}
        userName={userName}
        dateLabel={dateLabel}
        partsResearched={partsResearched}
        totalParts={totalParts}
        vendorCount={vendorCount || (loading ? 0 : 67)}
        bucketTotal={bucketTotal}
        bucketItemCount={bucketItems.length}
        savingsTotal={savingsTotal}
        fileCount={fileCount || (loading ? 0 : 5)}
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
