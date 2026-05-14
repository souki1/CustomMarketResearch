import { useMemo } from 'react'
import { ExternalLink, Info, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { type CompareDecisionRow } from './CompareDecisionWorkspace'

type Props = {
  partLabel: string
  rows: CompareDecisionRow[]
  onViewChange: (v: 'table' | 'insights' | 'mindmap') => void
  onAddToBucket: (id: string) => void
}

function fmt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—'
  return `$${n.toFixed(2)}`
}

function computeMedian(sorted: number[]): number {
  const n = sorted.length
  if (n === 0) return 0
  const mid = Math.floor(n / 2)
  return n % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function scoreBarColor(score: number): string {
  if (score >= 70) return '#10b981'
  if (score >= 40) return '#3b82f6'
  return '#475569'
}

function priceBarColor(index: number, total: number): string {
  if (index === 0) return '#10b981'
  const t = index / Math.max(1, total - 1)
  if (t < 0.4) return '#3b82f6'
  if (t < 0.7) return '#2563eb'
  return '#1e40af'
}

const INSIGHT_ICON_CONFIG = {
  info: { bg: 'bg-blue-50', text: 'text-blue-600', Icon: Info },
  clock: { bg: 'bg-amber-50', text: 'text-amber-600', Icon: Clock },
  alert: { bg: 'bg-orange-50', text: 'text-orange-600', Icon: AlertTriangle },
  check: { bg: 'bg-emerald-50', text: 'text-emerald-600', Icon: CheckCircle },
  danger: { bg: 'bg-red-50', text: 'text-red-600', Icon: XCircle },
} as const

const DONUT_RADIUS = 36
const DONUT_STROKE = 10
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

export function CompareInsightsPanel({ partLabel, rows, onViewChange, onAddToBucket }: Props) {
  const analytics = useMemo(() => {
    const prices = rows
      .filter((r) => r.price != null)
      .map((r) => r.price!)
      .sort((a, b) => a - b)
    const minP = prices.length > 0 ? prices[0] : 0
    const maxP = prices.length > 0 ? prices[prices.length - 1] : 0
    const avgP = prices.length > 0 ? prices.reduce((s, p) => s + p, 0) / prices.length : 0
    const medianP = computeMedian(prices)

    const lowerHalf = prices.slice(0, Math.floor(prices.length / 2))
    const upperHalf = prices.slice(Math.ceil(prices.length / 2))
    const q1 = computeMedian(lowerHalf)
    const q3 = computeMedian(upperHalf)

    const spread = maxP - minP

    const shipsTodayRows = rows.filter((r) => {
      const d = (r.delivery || '').toLowerCase()
      return d.includes('today') || d.includes('same day')
    })
    const freeShipRows = rows.filter(
      (r) => r.shipping === 0 || (r.delivery || '').toLowerCase().includes('free')
    )
    const noContactRows = rows.filter(
      (r) => !r.contact || r.contact.trim() === '' || r.contact === '—'
    )
    const noAvailRows = rows.filter(
      (r) => !r.availability || r.availability.trim() === '' || r.availability === '—'
    )

    const bestRow = rows.reduce<CompareDecisionRow | null>((best, r) => {
      if (r.price == null) return best
      if (!best || r.price < (best.price ?? Infinity)) return r
      return best
    }, null)

    const scoredRows = [...rows]
      .filter((r) => r.rating != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    const topRecommendation = scoredRows.length > 0 ? scoredRows[0] : bestRow

    const bucketCount = 4
    const bucketSize = spread > 0 ? Math.ceil(spread / bucketCount) : 1
    const buckets: { range: string; count: number }[] = []
    for (let i = 0; i < bucketCount; i++) {
      const lo = Math.floor(minP + i * bucketSize)
      const hi =
        i === bucketCount - 1 ? Math.ceil(maxP) : Math.floor(minP + (i + 1) * bucketSize)
      const count = prices.filter((p) =>
        i === bucketCount - 1 ? p >= lo && p <= hi : p >= lo && p < hi
      ).length
      buckets.push({ range: `$${lo}–${hi}`, count })
    }

    let dShipsToday = 0
    let dFreeShip = 0
    let dStandard = 0
    let dUnknown = 0
    for (const r of rows) {
      const d = (r.delivery || '').toLowerCase()
      if (d.includes('today') || d.includes('same day')) dShipsToday++
      else if (r.shipping === 0 || d.includes('free')) dFreeShip++
      else if (d && d !== '—' && d.trim()) dStandard++
      else dUnknown++
    }
    const deliverySegments = [
      { label: 'Ships today', count: dShipsToday, color: '#10b981' },
      { label: 'Free shipping', count: dFreeShip, color: '#818cf8' },
      { label: '2–7 days', count: dStandard, color: '#3b82f6' },
      { label: 'Unknown', count: dUnknown, color: '#64748b' },
    ].filter((s) => s.count > 0)

    const byPrice = [...rows]
      .filter((r) => r.price != null)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
    const byScore = [...rows]
      .filter((r) => r.rating != null)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))

    return {
      minP,
      maxP,
      avgP,
      medianP,
      q1,
      q3,
      shipsTodayRows,
      freeShipRows,
      noContactRows,
      noAvailRows,
      bestRow,
      topRecommendation,
      buckets,
      deliverySegments,
      byPrice,
      byScore,
    }
  }, [rows])

  const insights = useMemo(() => {
    const items: { icon: keyof typeof INSIGHT_ICON_CONFIG; bold: string; detail: string }[] = []
    const { bestRow, avgP, medianP, shipsTodayRows, noContactRows, freeShipRows, noAvailRows, minP } =
      analytics

    if (bestRow && bestRow.price != null && avgP > 0) {
      const pct = Math.round(((avgP - bestRow.price) / avgP) * 100)
      const savingsVsMedian =
        medianP > bestRow.price ? (medianP - bestRow.price).toFixed(2) : '0.00'
      items.push({
        icon: 'info',
        bold: `${bestRow.vendor} is ${pct}% cheaper than average`,
        detail: ` (${fmt(bestRow.price)} vs ${fmt(avgP)}). Ordering from them instead of the median vendor saves $${savingsVsMedian} per unit.`,
      })
    }

    if (rows.length > 0) {
      const count = shipsTodayRows.length
      const bestShipsToday = shipsTodayRows.find((r) => r.price === minP)
      items.push({
        icon: 'clock',
        bold: `Only ${count} of ${rows.length} vendors ship today.`,
        detail: bestShipsToday
          ? ` If lead time is critical, ${bestShipsToday.vendor} is the only best-price option with same-day fulfillment.`
          : count > 0
            ? ` Consider ${shipsTodayRows[0].vendor} if lead time is critical.`
            : ' No vendors offer same-day shipping for this part.',
      })
    }

    if (noContactRows.length > 0) {
      const names = noContactRows.map((r) => r.vendor)
      const nameStr =
        names.length <= 3
          ? names.join(', ')
          : `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more`
      items.push({
        icon: 'alert',
        bold: `${noContactRows.length} vendor${noContactRows.length > 1 ? 's' : ''} offer no contact info.`,
        detail: ` ${nameStr} have no listed phone — vendor risk is higher.`,
      })
    }

    const realFreeShip = freeShipRows.filter((r) => r.shipping === 0)
    if (realFreeShip.length > 0) {
      const cheapestFree = [...realFreeShip].sort(
        (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)
      )[0]
      items.push({
        icon: 'check',
        bold: `${cheapestFree.vendor} offers free shipping`,
        detail:
          cheapestFree.price != null
            ? ` at ${fmt(cheapestFree.price)} — best total cost if same-day delivery is not required and order qualifies.`
            : ' — check eligibility requirements.',
      })
    }

    if (noAvailRows.length > 0) {
      const names = noAvailRows.map((r) => r.vendor)
      const nameStr =
        names.length <= 2
          ? names.join(' and ')
          : `${names.slice(0, 2).join(', ')}, and ${names.length - 2} more`
      items.push({
        icon: 'danger',
        bold: `${noAvailRows.length} vendor${noAvailRows.length > 1 ? 's' : ''} show no availability data.`,
        detail: ` ${nameStr} do not confirm stock — contact before ordering to avoid procurement delays.`,
      })
    }

    return items
  }, [analytics, rows])

  const {
    minP,
    maxP,
    avgP,
    topRecommendation,
    buckets,
    deliverySegments,
    byPrice,
    byScore,
    medianP,
    q1,
    q3,
  } = analytics

  const topTags: { label: string; accent?: boolean }[] = []
  if (topRecommendation) {
    const d = (topRecommendation.delivery || '').toLowerCase()
    if (d.includes('today') || d.includes('same day'))
      topTags.push({ label: 'Ships today', accent: true })
    if (topRecommendation.price === minP) topTags.push({ label: 'Best price' })
    if (topRecommendation.rating != null)
      topTags.push({ label: `Score ${Math.round(topRecommendation.rating)}` })
  }

  const topSavings =
    topRecommendation?.price != null && avgP > 0
      ? Math.round(((avgP - topRecommendation.price) / avgP) * 100)
      : null

  function handleExport() {
    const headers = ['Vendor', 'Price', 'VS Avg', 'Contact', 'Delivery', 'Score', 'In Stock']
    const csvRows = [headers.join(',')]
    for (const row of rows) {
      const vsAvg =
        row.price != null && avgP > 0
          ? `${((row.price - avgP) / avgP) * 100 >= 0 ? '+' : ''}${(((row.price - avgP) / avgP) * 100).toFixed(0)}%`
          : ''
      csvRows.push(
        [
          `"${row.vendor.replace(/"/g, '""')}"`,
          row.price != null ? row.price.toFixed(2) : '',
          vsAvg,
          `"${(row.contact || '').replace(/"/g, '""')}"`,
          `"${(row.delivery || '').replace(/"/g, '""')}"`,
          row.rating != null ? String(Math.round(row.rating)) : '',
          row.availability || '',
        ].join(',')
      )
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${partLabel || 'compare'}_insights.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4 rounded-xl bg-white/90 p-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">{partLabel} — Insights</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            {rows.length} vendors · price range {fmt(minP)}–{fmt(maxP)} · data as of today
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
        >
          Export
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200">
        {(['table', 'insights', 'mindmap'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onViewChange(tab)}
            className={`pb-2 text-sm font-medium transition-colors ${
              tab === 'insights'
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              {tab === 'table' ? 'Table' : tab === 'insights' ? 'Insights' : 'Mind map'}
              {tab === 'mindmap' && <ExternalLink className="h-3 w-3" />}
            </span>
          </button>
        ))}
      </div>

      {topRecommendation && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <span className="mb-3 inline-block rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Top recommendation
          </span>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">{topRecommendation.vendor}</h4>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {topTags.map((tag, i) => (
                  <span
                    key={i}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      tag.accent
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200'
                    }`}
                  >
                    {tag.accent && '● '}
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-emerald-600">{fmt(topRecommendation.price)}</p>
              <p className="text-xs text-slate-500">
                {topSavings != null && topSavings > 0 ? `${topSavings}% below avg` : ''}
                {topRecommendation.contact && topSavings != null && topSavings > 0 ? ' · ' : ''}
                {topRecommendation.contact || ''}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onAddToBucket(topRecommendation.id)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Add to bucket
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() =>
                topRecommendation.url && window.open(topRecommendation.url, '_blank', 'noopener')
              }
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Vendor profile
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Price Comparison
          </h4>
          <div className="space-y-2">
            {byPrice.map((row, i) => (
              <div key={row.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs text-slate-700" title={row.vendor}>
                  {row.vendor}
                </span>
                <div className="flex-1">
                  <div
                    className="flex h-5 items-center rounded px-2 text-[10px] font-semibold text-white"
                    style={{
                      width: `${Math.max(18, ((row.price ?? 0) / maxP) * 100)}%`,
                      backgroundColor: priceBarColor(i, byPrice.length),
                    }}
                  >
                    {fmt(row.price)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {byScore.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vendor Scores
            </h4>
            <div className="space-y-2">
              {byScore.map((row) => {
                const score = Math.round(row.rating ?? 0)
                return (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-xs text-slate-700" title={row.vendor}>
                      {row.vendor}
                    </span>
                    <div className="flex flex-1 items-center gap-2">
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${score}%`,
                            backgroundColor: scoreBarColor(score),
                          }}
                        />
                      </div>
                      <span className="w-6 text-right text-xs font-semibold text-slate-700">{score}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Price Distribution
          </h4>
          <div className="space-y-2">
            {buckets.map((bucket, i) => {
              const maxCount = Math.max(...buckets.map((b) => b.count), 1)
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs text-slate-500">{bucket.range}</span>
                  <div className="flex flex-1 items-center gap-2">
                    <div
                      className="h-4 rounded bg-blue-500"
                      style={{ width: `${Math.max(4, (bucket.count / maxCount) * 100)}%` }}
                    />
                    <span className="text-xs text-slate-500">{bucket.count}</span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 space-y-0.5 border-t border-slate-200 pt-3 text-xs text-slate-500">
            <p>
              Median price: <span className="font-medium text-slate-700">{fmt(medianP)}</span>
            </p>
            <p>
              IQR:{' '}
              <span className="font-medium text-slate-700">
                {fmt(q1)}–{fmt(q3)}
              </span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Delivery Breakdown
          </h4>
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <svg viewBox="0 0 100 100" className="h-32 w-32">
                {(() => {
                  const total = deliverySegments.reduce((s, seg) => s + seg.count, 0)
                  if (total === 0) return null
                  let offset = 0
                  return deliverySegments.map((seg, i) => {
                    const dashLength = (seg.count / total) * DONUT_CIRCUMFERENCE
                    const gap = deliverySegments.length > 1 ? 2 : 0
                    const currentOffset = offset
                    offset += dashLength
                    return (
                      <circle
                        key={i}
                        cx="50"
                        cy="50"
                        r={DONUT_RADIUS}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={DONUT_STROKE}
                        strokeDasharray={`${Math.max(0, dashLength - gap)} ${DONUT_CIRCUMFERENCE - dashLength + gap}`}
                        strokeDashoffset={-currentOffset}
                        transform="rotate(-90 50 50)"
                      />
                    )
                  })
                })()}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-900">{rows.length}</span>
                <span className="text-[10px] text-slate-500">vendors</span>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
              {deliverySegments.map((seg, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="text-slate-500">{seg.label}</span>
                  <span className="font-medium text-slate-700">{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Key Insights</h4>
          <div className="space-y-3">
            {insights.map((insight, i) => {
              const cfg = INSIGHT_ICON_CONFIG[insight.icon]
              return (
                <div key={i} className="flex gap-3">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}
                  >
                    <cfg.Icon className={`h-3.5 w-3.5 ${cfg.text}`} />
                  </div>
                  <p className="text-sm leading-relaxed text-slate-600">
                    <strong className="font-semibold text-slate-900">{insight.bold}</strong>
                    {insight.detail}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
