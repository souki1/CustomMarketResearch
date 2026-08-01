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
import { DonutChart, LineChart } from './DashboardCharts'

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
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
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
  topVendors,
  categoryRows,
  recentActivity,
}: EnterpriseDashboardProps) {
  const displayName = userName?.trim() || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const coveragePct = totalParts > 0 ? Math.round((partsResearched / totalParts) * 100) : 0
  const spendLatest = spendTrend[spendTrend.length - 1] ?? 0
  const researchLatest = researchTrend[researchTrend.length - 1] ?? coveragePct

  const kpis = [
    {
      label: 'Parts Researched',
      value: loading ? '—' : `${partsResearched}/${totalParts}`,
      sub: loading
        ? ''
        : unresearchedParts > 0
          ? `${unresearchedParts} still pending`
          : totalParts > 0
            ? 'All parts researched'
            : 'No parts yet',
      trend: partsResearched > 0 ? `${coveragePct}% coverage` : '—',
      trendUp: partsResearched > 0,
      color: 'text-blue-600',
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
      color: 'text-slate-600',
    },
  ]

  const quickActions = [
    {
      icon: FileUp,
      label: 'Upload new file',
      sub: 'CSV or XLSX',
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-600/15',
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
      color: 'text-slate-600',
      bg: 'bg-slate-50',
      border: 'border-slate-300/40',
      to: BUCKET_PATH,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-slate-800 px-5 py-4 sm:px-6">
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-[0.06em] text-slate-400">{dateLabel}</div>
          <div className="text-xl font-bold tracking-tight text-white">
            {greeting}, {displayName} 👋
          </div>
          <div className="mt-1.5 text-[13px] text-slate-400">
            <span className="font-medium text-blue-400">{unresearchedParts} parts</span> still unresearched
            {' · '}
            <span className="font-medium text-emerald-400">{formatUsd(savingsTotal)}</span> in savings ready to
            action
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={FILES_PATH}
            className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
          >
            Upload file
          </Link>
          <Link
            to={RESEARCH_PATH}
            className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Research all →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{k.label}</p>
            <p className={`mt-1.5 font-mono text-[22px] font-bold ${k.color}`}>{k.value}</p>
            <p className={`text-[11px] font-medium ${k.trendUp ? 'text-emerald-600' : 'text-slate-500'}`}>
              {k.trend}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-[1fr_1fr_220px]">
        <DashboardCard title="Procurement Spend" action={{ label: 'View bucket', to: BUCKET_PATH }}>
          <div className="px-4 py-3.5">
            <div className="mb-2.5 flex items-end gap-2.5">
              <span className="font-mono text-2xl font-bold text-slate-900">
                {formatUsd(spendLatest)}
              </span>
              <span className="mb-0.5 text-xs font-medium text-emerald-600">↑ 18% vs last month</span>
            </div>
            <LineChart data={spendTrend} color="#2563eb" height={72} width={280} />
            <div className="mt-1 flex justify-between">
              {MONTH_LABELS.map((l) => (
                <span key={l} className="text-[9px] text-slate-400">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Research Progress" action={{ label: 'Open research', to: RESEARCH_PATH }}>
          <div className="px-4 py-3.5">
            <div className="mb-2.5 flex items-end gap-2.5">
              <span className="font-mono text-2xl font-bold text-slate-900">{researchLatest}%</span>
              <span className="mb-0.5 text-xs font-medium text-emerald-600">↑ 7% this week</span>
            </div>
            <LineChart data={researchTrend} color="#16a34a" height={72} width={280} />
            <div className="mt-1 flex justify-between">
              {MONTH_LABELS.map((l) => (
                <span key={l} className="text-[9px] text-slate-400">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Coverage">
          <div className="flex flex-col items-center gap-3 px-4 py-3.5">
            <DonutChart
              segments={[
                { value: partsResearched, color: '#2563eb' },
                { value: Math.max(0, totalParts - partsResearched), color: '#e5e7eb' },
              ]}
              size={90}
            />
            <div className="flex w-full flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
                  <span className="text-[11px] text-slate-600">Researched</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-slate-800">{partsResearched}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-slate-200" />
                  <span className="text-[11px] text-slate-600">Pending</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-slate-800">
                  {Math.max(0, totalParts - partsResearched)}
                </span>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <DashboardCard title="Research by Category">
          <div className="flex flex-col gap-2 px-4 py-3">
            {categoryRows.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">No category data yet</p>
            ) : (
              categoryRows.map((row) => {
                const pct = row.total > 0 ? Math.round((row.found / row.total) * 100) : 0
                const barColor = pct === 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                const textColor =
                  pct === 100 ? 'text-emerald-600' : pct >= 50 ? 'text-blue-600' : 'text-amber-600'
                return (
                  <div key={row.label}>
                    <div className="mb-0.5 flex justify-between">
                      <span className="text-xs text-slate-600">{row.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">
                          {row.found}/{row.total}
                        </span>
                        <span className={`text-[11px] font-semibold ${textColor}`}>{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1 overflow-hidden rounded-sm bg-slate-100">
                      <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Top Vendors" action={{ label: 'Compare', to: RESEARCH_COMPARE_PATH }}>
          {topVendors.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">No vendor data yet</p>
          ) : (
            topVendors.map((v, i) => (
              <div
                key={v.name}
                className={`flex items-center gap-2.5 px-4 py-2.5 ${i < topVendors.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-500">
                  {v.name[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-slate-800">{v.name}</div>
                  <ScoreBar score={v.score} />
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-xs font-semibold text-slate-800">
                    {formatUsd(v.spend, 2)}
                  </div>
                  <div
                    className={`text-[11px] ${
                      v.trend === 'up'
                        ? 'text-emerald-600'
                        : v.trend === 'down'
                          ? 'text-red-600'
                          : 'text-slate-400'
                    }`}
                  >
                    {v.trend === 'up' ? '↑' : v.trend === 'down' ? '↓' : '→'} {v.parts} parts
                  </div>
                </div>
              </div>
            ))
          )}
        </DashboardCard>

        <DashboardCard title="Recent Activity">
          <div className="px-3 py-2">
            {recentActivity.map((a, i) => (
              <div
                key={i}
                className={`flex gap-2 py-1.5 ${i < recentActivity.length - 1 ? 'border-b border-slate-50' : ''}`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${a.accentClass}`}
                >
                  {a.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] leading-snug text-slate-600">{a.message}</div>
                  <div className="text-[10px] text-slate-400">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick actions</p>
        <div className="flex flex-wrap gap-2.5">
          {quickActions.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              className={`flex min-w-[160px] flex-1 items-center gap-2.5 rounded-lg border px-3.5 py-2.5 transition-colors hover:opacity-90 ${q.bg} ${q.border}`}
            >
              <q.icon className={`h-[18px] w-[18px] shrink-0 ${q.color}`} strokeWidth={1.75} />
              <div className="min-w-0 text-left">
                <div className={`text-xs font-semibold ${q.color}`}>{q.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{q.sub}</div>
              </div>
            </Link>
          ))}
          <Link
            to={WISHLIST_PATH}
            className="flex min-w-[140px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700"
          >
            <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.75} />
            Wishlists
          </Link>
        </div>
      </div>
    </div>
  )
}
