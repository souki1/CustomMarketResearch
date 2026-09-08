import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  FileUp,
  FlaskConical,
  GitCompare,
  Lightbulb,
  ShoppingCart,
} from 'lucide-react'
import {
  BUCKET_PATH,
  FILES_PATH,
  RESEARCH_COMPARE_PATH,
  RESEARCH_PATH,
  WISHLIST_PATH,
} from '@/lib/paths'
import { BarChart, DonutChart, LineChart } from './DashboardCharts'

export type DashboardTopVendor = {
  name: string
  score: number
  parts: number
  spend: number
  trend: 'up' | 'down' | 'flat'
}

export type DashboardCategoryRow = {
  label: string
  total: number
  found: number
}

export type DashboardActivity = {
  message: string
  time: string
  accentClass: string
  icon: ReactNode
}

export type EnterpriseDashboardProps = {
  loading?: boolean
  userName?: string | null
  dateLabel: string
  partsResearched: number
  totalParts: number
  vendorCount: number
  bucketTotal: number
  bucketItemCount: number
  savingsTotal: number
  fileCount: number
  fileRowsHint: string
  unresearchedParts: number
  spendTrend: number[]
  researchTrend: number[]
  researchDayLabels: string[]
  topVendors: DashboardTopVendor[]
  categoryRows: DashboardCategoryRow[]
  recentActivity: DashboardActivity[]
}

function formatUsd(n: number, maxFraction = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: maxFraction,
  }).format(n)
}

function ScoreBar({ score }: { score: number }) {
  const barColor =
    score >= 70 ? 'bg-emerald-500' : score >= 45 ? 'bg-app-accent' : score >= 25 ? 'bg-amber-500' : 'bg-red-500'
  const textColor =
    score >= 70
      ? 'text-emerald-600'
      : score >= 45
        ? 'text-app-accent'
        : score >= 25
          ? 'text-amber-600'
          : 'text-red-600'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-11 overflow-hidden rounded-full bg-app-fill">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className={`min-w-[18px] font-medium tabular-nums text-xs ${textColor}`}>{score}</span>
    </div>
  )
}

function DashboardCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: { label: string; to: string }
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`overflow-hidden rounded-[12px] border border-app-separator bg-app-surface ${className}`}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-app-label">{title}</span>
        {action && (
          <Link to={action.to} className="text-[13px] font-medium text-app-accent hover:text-app-accent-hover">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul']

export function EnterpriseDashboard({
  loading = false,
  userName,
  dateLabel,
  partsResearched,
  totalParts,
  vendorCount,
  bucketTotal,
  bucketItemCount,
  savingsTotal,
  fileCount,
  fileRowsHint,
  unresearchedParts,
  spendTrend,
  researchTrend,
  researchDayLabels,
  topVendors,
  categoryRows,
  recentActivity,
}: EnterpriseDashboardProps) {
  const displayName = userName?.trim() || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const coveragePct = totalParts > 0 ? Math.round((partsResearched / totalParts) * 100) : 0
  const spendLatest = spendTrend[spendTrend.length - 1] ?? 0
  const spendHasHistory = spendLatest > 0
  const researchHasHistory = totalParts > 0 || researchTrend.some((n) => n > 0)
  const researchedToday = researchTrend[researchTrend.length - 1] ?? 0
  const researchedThisWeek = researchTrend.reduce((sum, n) => sum + n, 0)

  const kpis = [
    {
      label: 'Parts researched',
      value: loading ? '—' : `${partsResearched} / ${totalParts}`,
      sub: loading
        ? ''
        : totalParts > 0
          ? `${partsResearched} researched · ${unresearchedParts} remaining`
          : 'No parts in sheets yet',
      trend: partsResearched > 0 ? `${coveragePct}% coverage` : '—',
      trendUp: partsResearched > 0,
      color: 'text-app-accent',
    },
    {
      label: 'Active Vendors',
      value: loading ? '—' : String(vendorCount),
      sub: 'across all parts',
      trend: vendorCount > 0 ? `${vendorCount} vendor${vendorCount !== 1 ? 's' : ''}` : '—',
      trendUp: vendorCount > 0,
      color: 'text-violet-600',
    },
    {
      label: 'Bucket Value',
      value: loading ? '—' : formatUsd(bucketTotal),
      sub: loading ? '' : `${bucketItemCount} line items`,
      trend: bucketTotal > 0 ? `${bucketItemCount} items` : '—',
      trendUp: bucketTotal > 0,
      color: 'text-emerald-600',
    },
    {
      label: 'Savings Identified',
      value: loading ? '—' : formatUsd(savingsTotal),
      sub: 'vs avg market price',
      trend: savingsTotal > 0 ? 'Opportunity found' : '—',
      trendUp: savingsTotal > 0,
      color: 'text-amber-600',
    },
    {
      label: 'Files Uploaded',
      value: loading ? '—' : String(fileCount),
      sub: fileRowsHint,
      trend:
        fileCount === 0
          ? '—'
          : unresearchedParts > 0
            ? `${unresearchedParts} pending research`
            : 'All caught up',
      trendUp: false,
      color: 'text-app-secondary',
    },
  ]

  const quickActions = [
    {
      icon: FileUp,
      label: 'Upload new file',
      sub: 'CSV or XLSX',
      color: 'text-app-accent',
      bg: 'bg-app-accent-soft',
      border: 'border-app-accent/15',
      to: FILES_PATH,
    },
    {
      icon: FlaskConical,
      label: 'Research pending parts',
      sub: `${unresearchedParts} unresearched`,
      color: 'text-violet-600',
      bg: 'bg-violet-50',
      border: 'border-violet-600/15',
      to: RESEARCH_PATH,
    },
    {
      icon: GitCompare,
      label: 'Compare top vendors',
      sub: topVendors[0] ? `${topVendors[0].name} ready` : 'Open compare',
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-emerald-600/15',
      to: RESEARCH_COMPARE_PATH,
    },
    {
      icon: Lightbulb,
      label: 'View savings opportunities',
      sub: `${formatUsd(savingsTotal)} identified`,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-600/15',
      to: '/portfolio',
    },
    {
      icon: ShoppingCart,
      label: 'Finalize bucket order',
      sub: `${formatUsd(bucketTotal, 2)} ready`,
      color: 'text-app-secondary',
      bg: 'bg-app-fill',
      border: 'border-app-separator/40',
      to: BUCKET_PATH,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4 px-0.5 pt-1">
        <div>
          <p className="text-xs font-medium tracking-[0.02em] text-app-tertiary">{dateLabel}</p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-app-label">
            {greeting}, {displayName}
          </h1>
          <p className="mt-1.5 text-[13px] text-app-secondary">
            {unresearchedParts > 0 ? (
              <>
                <span className="font-medium text-app-label">{unresearchedParts} parts</span> still need
                research
              </>
            ) : totalParts > 0 ? (
              'All tracked parts are researched'
            ) : (
              'Upload a file to start researching parts'
            )}
            {savingsTotal > 0 ? (
              <>
                {' · '}
                <span className="font-medium text-app-label">{formatUsd(savingsTotal)}</span> in savings
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={FILES_PATH}
            className="inline-flex h-9 items-center rounded-[10px] bg-app-fill px-3.5 text-[13px] font-medium text-app-label hover:bg-app-fill-strong"
          >
            Upload file
          </Link>
          <Link
            to={RESEARCH_PATH}
            className="inline-flex h-9 items-center rounded-[10px] bg-app-accent px-3.5 text-[13px] font-semibold text-white hover:bg-app-accent-hover"
          >
            Open research
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-[12px] border border-app-separator bg-app-surface px-4 py-3.5">
            <p className="text-xs font-medium text-app-secondary">{k.label}</p>
            <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-app-label">
              {k.value}
            </p>
            <p className="mt-1 text-xs text-app-secondary">
              {k.sub || k.trend}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[1fr_1fr_220px]">
        <DashboardCard title="Procurement spend" action={{ label: 'View bucket', to: BUCKET_PATH }}>
          <div className="px-4 pb-4">
            <p className="text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-app-label">
              {formatUsd(spendLatest)}
            </p>
            {spendHasHistory ? (
              <>
                <LineChart data={spendTrend} color="#007aff" height={72} width={280} />
                <div className="mt-1 flex justify-between">
                  {MONTH_LABELS.map((l) => (
                    <span key={l} className="text-xs text-app-tertiary">
                      {l}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-app-secondary">
                Spend appears here after you add priced parts to the bucket.
              </p>
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Parts researched / day" action={{ label: 'Open research', to: RESEARCH_PATH }}>
          <div className="px-4 pb-4">
            <p className="text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-app-label">
              {researchedToday}
              <span className="ml-1.5 text-[13px] font-medium text-app-secondary">today</span>
            </p>
            <p className="mt-0.5 text-xs text-app-secondary">
              {researchedThisWeek} in the last 7 days
              {partsResearched > researchedThisWeek ? ` · ${partsResearched} total researched` : ''}
            </p>
            {researchHasHistory ? (
              <>
                <div className="mt-2">
                  <BarChart data={researchTrend} color="var(--app-ok)" height={72} width={280} />
                </div>
                <div
                  className="mt-1 grid text-center"
                  style={{ gridTemplateColumns: `repeat(${researchDayLabels.length}, minmax(0, 1fr))` }}
                >
                  {researchDayLabels.map((l, i) => (
                    <span key={`${l}-${i}`} className="text-xs text-app-secondary">
                      {l}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-[13px] text-app-secondary">
                Daily counts appear after you research parts in a sheet.
              </p>
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Coverage">
          <div className="flex flex-col items-center gap-3 px-4 pb-4">
            <DonutChart
              segments={[
                { value: partsResearched, color: 'var(--app-accent)' },
                { value: Math.max(0, totalParts - partsResearched), color: 'var(--app-separator)' },
              ]}
              size={96}
              centerLabel={`${coveragePct}%`}
            />
            <div className="flex w-full flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-app-accent" />
                  <span className="text-[13px] text-app-label">Researched</span>
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-app-label">{partsResearched}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-app-tertiary" />
                  <span className="text-[13px] text-app-label">Remaining parts</span>
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-app-label">
                  {Math.max(0, totalParts - partsResearched)}
                </span>
              </div>
              <p className="pt-0.5 text-[13px] text-app-secondary">{totalParts} parts in sheets</p>
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <DashboardCard title="Research by category">
          <div className="flex flex-col gap-2.5 px-4 pb-4">
            {categoryRows.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-app-secondary">No category data yet</p>
            ) : (
              categoryRows.map((row) => {
                const pct = row.total > 0 ? Math.round((row.found / row.total) * 100) : 0
                const barColor = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-app-accent' : 'bg-amber-500'
                return (
                  <div key={row.label}>
                    <div className="mb-1 flex justify-between gap-2">
                      <span className="text-[13px] text-app-label">{row.label}</span>
                      <span className="text-xs tabular-nums text-app-secondary">
                        {row.found}/{row.total} · {pct}%
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-app-fill">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Top vendors" action={{ label: 'Compare', to: RESEARCH_COMPARE_PATH }}>
          {topVendors.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-app-secondary">No vendor data yet</p>
          ) : (
            topVendors.map((v, i) => (
              <div
                key={v.name}
                className={`flex items-center gap-2.5 px-4 py-2.5 ${i < topVendors.length - 1 ? 'border-b border-app-separator' : ''}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-app-fill text-xs font-semibold text-app-secondary">
                  {v.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-app-label">{v.name}</div>
                  <ScoreBar score={v.score} />
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-semibold tabular-nums text-app-label">
                    {formatUsd(v.spend, 2)}
                  </div>
                  <div className="text-xs text-app-secondary">{v.parts} parts</div>
                </div>
              </div>
            ))
          )}
        </DashboardCard>

        <DashboardCard title="Recent activity">
          <div className="px-3 pb-3">
            {recentActivity.length === 0 ? (
              <p className="px-1 py-8 text-center text-[13px] text-app-secondary">
                Activity from research and the bucket will show up here.
              </p>
            ) : (
              recentActivity.map((a, i) => (
                <div
                  key={i}
                  className={`flex gap-2.5 py-2 ${i < recentActivity.length - 1 ? 'border-b border-app-separator' : ''}`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] ${a.accentClass}`}
                  >
                    {a.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] leading-snug text-app-label">{a.message}</div>
                    <div className="mt-0.5 text-xs text-app-secondary">{a.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </DashboardCard>
      </div>

      <div className="rounded-[12px] border border-app-separator bg-app-surface px-4 py-4">
        <p className="mb-3 text-xs font-semibold tracking-[0.04em] text-app-tertiary">Quick actions</p>
        <div className="flex flex-wrap gap-2.5">
          {quickActions.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              className="flex min-w-[160px] flex-1 items-center gap-2.5 rounded-[10px] bg-app-fill px-3.5 py-2.5 transition-colors hover:bg-app-fill-strong"
            >
              <q.icon className="h-[18px] w-[18px] shrink-0 text-app-accent" strokeWidth={1.75} />
              <div className="min-w-0 text-left">
                <div className="text-[13px] font-medium text-app-label">{q.label}</div>
                <div className="mt-0.5 text-xs text-app-secondary">{q.sub}</div>
              </div>
            </Link>
          ))}
          <Link
            to={WISHLIST_PATH}
            className="flex min-w-[140px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-app-separator px-3 py-2.5 text-[13px] font-medium text-app-secondary hover:bg-app-fill hover:text-app-label"
          >
            <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
            Wishlists
          </Link>
        </div>
      </div>
    </div>
  )
}
