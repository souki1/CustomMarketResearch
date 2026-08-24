import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  GitCompare,
  Heart,
  Lightbulb,
  Package,
  ShoppingCart,
  TrendingDown,
  Users,
  Zap,
} from 'lucide-react'
import { BUCKET_PATH, RESEARCH_COMPARE_PATH, RESEARCH_PATH, WISHLIST_PATH } from '@/lib/paths'
import type { BucketItem } from '@/contexts/BucketContext'

export type PortfolioInsight = {
  title: string
  body: string
  accent: 'green' | 'blue' | 'yellow'
}

export type PortfolioTopVendor = {
  name: string
  score: number
  parts: number
}

export type PortfolioCoverageRow = {
  label: string
  found: number
  total: number
}

export type PortfolioDashboardProps = {
  loading?: boolean
  userName?: string | null
  uniqueParts: number
  vendorCount: number
  offerCount: number
  bucketTotal: number
  bucketItems: BucketItem[]
  savingsTotal: number
  coveragePct: number
  partsWithOffers: number
  topVendors: PortfolioTopVendor[]
  insights: PortfolioInsight[]
  coverageRows: PortfolioCoverageRow[]
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    n
  )
}

function parseBucketPrice(price: string): number {
  const cleaned = String(price ?? '').replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function Tag({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'blue' }) {
  const styles =
    variant === 'blue'
      ? 'border-blue-100 bg-blue-50 text-blue-800'
      : 'border-slate-200 bg-slate-100 text-slate-600'
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-px text-[11px] font-medium leading-[18px] ${styles}`}
    >
      {children}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  const barColor =
    score >= 70 ? 'bg-emerald-500' : score >= 45 ? 'bg-blue-500' : score >= 25 ? 'bg-amber-500' : 'bg-red-500'
  const textColor =
    score >= 70
      ? 'text-emerald-600'
      : score >= 45
        ? 'text-blue-600'
        : score >= 25
          ? 'text-amber-600'
          : 'text-red-600'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-[3px] w-11 overflow-hidden rounded-sm bg-slate-200">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className={`min-w-[18px] font-mono text-[11px] font-semibold ${textColor}`}>{score}</span>
    </div>
  )
}

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; to: string }
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <span className="text-[13px] font-semibold text-slate-800">{title}</span>
        {action && (
          <Link to={action.to} className="text-[11px] font-medium text-blue-600 hover:text-blue-700">
            {action.label} →
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

function insightBorder(accent: PortfolioInsight['accent']): string {
  switch (accent) {
    case 'green':
      return 'bg-emerald-500'
    case 'blue':
      return 'bg-blue-500'
    case 'yellow':
      return 'bg-amber-500'
    default:
      return 'bg-slate-400'
  }
}

export function PortfolioDashboard({
  loading = false,
  userName,
  uniqueParts,
  vendorCount,
  offerCount,
  bucketTotal,
  bucketItems,
  savingsTotal,
  coveragePct,
  partsWithOffers,
  topVendors,
  insights,
  coverageRows,
}: PortfolioDashboardProps) {
  const displayName = userName?.trim() || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const kpis = [
    {
      label: 'Parts tracked',
      val: loading ? '—' : String(uniqueParts),
      sub: loading ? '' : `${partsWithOffers} with offers`,
      Icon: Package,
      col: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Vendors found',
      val: loading ? '—' : String(vendorCount),
      sub: loading ? '' : `${offerCount} offers`,
      Icon: Users,
      col: 'text-violet-600',
      bg: 'bg-violet-50',
    },
    {
      label: 'Bucket value',
      val: loading ? '—' : formatUsd(bucketTotal),
      sub: loading ? '' : `${bucketItems.length} item${bucketItems.length !== 1 ? 's' : ''}`,
      Icon: ShoppingCart,
      col: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Savings found',
      val: loading ? '—' : formatUsd(savingsTotal),
      sub: 'vs avg per part',
      Icon: TrendingDown,
      col: 'text-amber-700',
      bg: 'bg-amber-50',
    },
    {
      label: 'Offers',
      val: loading ? '—' : String(offerCount),
      sub: 'in portfolio',
      Icon: Heart,
      col: 'text-red-600',
      bg: 'bg-red-50',
    },
  ]

  const activity = [
    {
      Icon: GitCompare,
      col: 'text-blue-600',
      msg: `${uniqueParts} part${uniqueParts !== 1 ? 's' : ''} in portfolio`,
      time: 'Overview',
    },
    {
      Icon: ShoppingCart,
      col: 'text-emerald-600',
      msg:
        bucketItems.length > 0
          ? `${bucketItems.length} item${bucketItems.length !== 1 ? 's' : ''} in procurement bucket`
          : 'Bucket is empty — add from Compare',
      time: 'Bucket',
    },
    {
      Icon: Lightbulb,
      col: 'text-amber-600',
      msg:
        savingsTotal > 0
          ? `${formatUsd(savingsTotal)} potential savings vs average offers`
          : 'Run compare on multi-vendor parts for savings',
      time: 'Insights',
    },
    {
      Icon: Zap,
      col: 'text-blue-600',
      msg: `${vendorCount} vendor${vendorCount !== 1 ? 's' : ''} across your saved research`,
      time: 'Vendors',
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-slate-800 px-5 py-4 sm:px-6">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-slate-400">Welcome back</div>
          <div className="text-xl font-bold tracking-tight text-white">
            {greeting}, {displayName}
          </div>
          <div className="mt-1 text-[13px] text-slate-400">
            <Link to={RESEARCH_PATH} className="font-medium text-blue-400 hover:text-blue-300">
              {uniqueParts} parts
            </Link>
            {' '}
            in portfolio ·{' '}
            <span className="font-medium text-emerald-400">
              {loading ? '…' : formatUsd(savingsTotal)}
            </span>{' '}
            in identified savings
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={RESEARCH_PATH}
            className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
          >
            Research all
          </Link>
          <Link
            to={BUCKET_PATH}
            className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            View bucket →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="flex items-start justify-between rounded-lg border border-slate-200 bg-white px-4 py-3.5"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
              <p className={`mt-1.5 truncate font-mono text-xl font-bold ${k.col}`}>{k.val}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-400">{k.sub}</p>
            </div>
            <div
              className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg ${k.bg}`}
            >
              <k.Icon className={`h-4 w-4 ${k.col}`} strokeWidth={1.75} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr_290px]">
        <Card title="Research coverage" action={{ label: 'Open', to: RESEARCH_PATH }}>
          <div className="px-4 py-3.5">
            <div className="mb-3.5">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Parts with vendor offers</span>
                <span className="font-mono font-semibold text-slate-700">
                  {loading ? '—' : `${partsWithOffers}/${uniqueParts || 0}`}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-slate-100">
                <div
                  className="h-full rounded-sm bg-blue-600 transition-all"
                  style={{ width: `${loading ? 0 : coveragePct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {loading ? 'Loading…' : `${coveragePct}% with pricing · ${offerCount} total offers`}
              </p>
            </div>
            {coverageRows.map((row) => {
              const pct = row.total > 0 ? Math.round((row.found / row.total) * 100) : 0
              return (
                <div key={row.label} className="mb-2">
                  <div className="mb-0.5 flex justify-between text-xs text-slate-500">
                    <span>{row.label}</span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {row.found}/{row.total}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-sm bg-slate-100">
                    <div
                      className="h-full rounded-sm bg-blue-500 opacity-80"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card title="Top vendors" action={{ label: 'Compare', to: RESEARCH_COMPARE_PATH }}>
            {topVendors.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">No vendor data yet</p>
            ) : (
              topVendors.map((v, i) => (
                <div
                  key={v.name}
                  className={`flex items-center gap-2.5 px-4 py-2 ${i < topVendors.length - 1 ? 'border-b border-slate-100' : ''}`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-500">
                    {v.name[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-slate-800">{v.name}</span>
                      {i === 0 && <Tag variant="blue">Top</Tag>}
                    </div>
                    <ScoreBar score={v.score} />
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{v.parts}</span>
                </div>
              ))
            )}
          </Card>

          <Card title="Key insights" action={{ label: 'All', to: RESEARCH_COMPARE_PATH }}>
            <div className="flex flex-col gap-1.5 p-2.5">
              {insights.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-slate-400">Add more vendor offers to see insights</p>
              ) : (
                insights.map((ins, i) => (
                  <div
                    key={i}
                    className="flex gap-2.5 rounded-md border border-slate-200 px-2.5 py-2"
                  >
                    <div className={`w-0.5 shrink-0 rounded-sm ${insightBorder(ins.accent)}`} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800">{ins.title}</div>
                      <div className="text-[11px] leading-snug text-slate-500">{ins.body}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3.5">
          <Card title="Bucket" action={{ label: 'View', to: BUCKET_PATH }}>
            <div className="flex flex-col gap-1.5 p-2.5">
              {bucketItems.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-slate-400">No items in bucket</p>
              ) : (
                bucketItems.slice(0, 4).map((b) => {
                  const unit = parseBucketPrice(b.price)
                  const qty = b.qty ?? 1
                  const ready = unit > 0
                  return (
                    <div
                      key={b.id}
                      className="flex gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5"
                    >
                      <span
                        className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-[11px] font-semibold text-blue-700">
                          {b.title}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">{b.manufacturer}</div>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-bold text-slate-800">
                        {unit > 0 ? formatUsd(unit * qty) : '—'}
                      </span>
                    </div>
                  )
                })
              )}
              {bucketItems.length > 0 && (
                <>
                  <div className="flex justify-between border-t border-slate-200 px-1 pt-2 text-xs">
                    <span className="text-slate-500">Total</span>
                    <span className="font-mono text-sm font-bold text-slate-900">
                      {formatUsd(bucketTotal)}
                    </span>
                  </div>
                  <Link
                    to={BUCKET_PATH}
                    className="block w-full rounded-md bg-blue-600 py-1.5 text-center text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Place order →
                  </Link>
                </>
              )}
            </div>
          </Card>

          <Card title="Activity">
            <div className="px-3 py-2">
              {activity.map((a, i) => (
                <div
                  key={i}
                  className={`flex gap-2 py-1.5 ${i < activity.length - 1 ? 'border-b border-slate-50' : ''}`}
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100">
                    <a.Icon className={`h-3 w-3 ${a.col}`} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] leading-snug text-slate-600">{a.msg}</div>
                    <div className="text-[10px] text-slate-400">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Link
            to={WISHLIST_PATH}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 bg-white py-2 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            <Heart className="h-3.5 w-3.5" strokeWidth={1.75} />
            Open wishlists
          </Link>
        </div>
      </div>
    </div>
  )
}
