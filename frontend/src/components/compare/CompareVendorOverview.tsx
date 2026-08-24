import { ExternalLink, LayoutGrid } from 'lucide-react'

export type VendorOverviewPartRow = {
  id: string
  label: string
  vendorCount: number
  sourceCount: number
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
}

export type CommonVendorPriceRow = {
  domain: string
  /** part id -> formatted price cell */
  priceByPartId: Record<string, string>
  /** part id -> exact scraped URL (when available) */
  urlByPartId: Record<string, string | null>
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function toSafeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

type CompareVendorOverviewProps = {
  partRows: VendorOverviewPartRow[]
  maxVendorCount: number
  commonVendorCount: number | null
  commonVendorRows: CommonVendorPriceRow[] | null
}

export function CompareVendorOverview({
  partRows,
  maxVendorCount,
  commonVendorCount,
  commonVendorRows,
}: CompareVendorOverviewProps) {
  if (partRows.length === 0) return null

  const scale = Math.max(maxVendorCount, 1)

  return (
    <div className="mb-8 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-4 shadow-sm ring-1 ring-slate-950/[0.04] sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
          <LayoutGrid className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Vendor coverage</h4>
          <p className="text-xs text-slate-500">
            Sources per part, overlap, and price ranges from scraped fields (Price, cost, MSRP, etc.).
          </p>
        </div>
        {commonVendorCount != null && (
          <span className="ml-auto inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80">
            {commonVendorCount} shared vendor{commonVendorCount === 1 ? '' : 's'} (≥2 parts)
          </span>
        )}
      </div>

      <div className="space-y-4">
        {partRows.map((row) => {
          const pct = Math.round((row.vendorCount / scale) * 100)
          return (
            <div key={row.id} className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-800" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-slate-600">
                  <span className="font-semibold text-slate-900">{row.vendorCount}</span> vendor
                  {row.vendorCount === 1 ? '' : 's'}
                  {row.minPrice != null && row.maxPrice != null && (
                    <span className="ml-2 text-slate-500">
                      · {formatUsd(row.minPrice)}
                      {row.minPrice !== row.maxPrice ? ` – ${formatUsd(row.maxPrice)}` : ''}
                      {row.avgPrice != null && row.minPrice !== row.maxPrice && (
                        <span className="text-slate-400"> (avg {formatUsd(row.avgPrice)})</span>
                      )}
                    </span>
                  )}
                </span>
              </div>
              <p className="mb-1 text-[11px] text-slate-500">
                {row.sourceCount} source{row.sourceCount === 1 ? '' : 's'}
              </p>
              <div className="flex h-8 w-full items-center gap-3">
                <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/90">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                    title={`${row.vendorCount} vendors`}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {commonVendorRows && commonVendorRows.length > 0 && partRows.length > 1 && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Shared vendors (≥2 parts) — price by part
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[320px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90">
                  <th className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">Vendor</th>
                  {partRows.map((p) => (
                    <th
                      key={p.id}
                      className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700"
                      title={p.label}
                    >
                      <span className="line-clamp-2 max-w-[10rem]">{p.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commonVendorRows.map((r) => {
                  return (
                    <tr key={r.domain} className="border-b border-slate-100 last:border-0">
                      <td className="max-w-[14rem] truncate px-3 py-2 font-medium text-slate-800" title={r.domain}>
                        {r.domain}
                      </td>
                      {partRows.map((p) => {
                        const priceText = r.priceByPartId[p.id] ?? '—'
                        const cellUrl = toSafeHttpUrl(r.urlByPartId[p.id] ?? null)
                        return (
                          <td key={p.id} className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                            {cellUrl ? (
                              <a
                                href={cellUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 hover:underline"
                                aria-label={`Open vendor website for ${r.domain}`}
                                title={`Open ${r.domain}`}
                              >
                                <span>{priceText}</span>
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                              </a>
                            ) : (
                              <span>{priceText}</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** Exported for useMemo in ComparePage — scans nested objects for typical price field keys */
export function collectPricesFromScrapedData(data: Record<string, unknown> | null | undefined): number[] {
  const acc: number[] = []
  if (!data || typeof data !== 'object') return acc
  const PRICE_KEY_RE = /(price|cost|amount|msrp|retail|usd|\$|total)/i

  function parsePriceLoose(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e10) return v
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.]/g, '')
      if (!cleaned) return null
      const n = parseFloat(cleaned)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    return null
  }

  function walk(obj: Record<string, unknown>): void {
    for (const [key, val] of Object.entries(obj)) {
      if (val != null && typeof val === 'object' && !Array.isArray(val)) {
        walk(val as Record<string, unknown>)
      } else if (PRICE_KEY_RE.test(key)) {
        const n = parsePriceLoose(val)
        if (n != null) acc.push(n)
      }
    }
  }

  walk(data)
  return acc
}
