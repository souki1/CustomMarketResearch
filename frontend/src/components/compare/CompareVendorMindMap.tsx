import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, X } from 'lucide-react'

export type MindMapVendorNode = {
  key: string
  domain: string
  priceLabel: string | null
  isCommon: boolean
}

export type MindMapPartBranch = {
  id: string
  label: string
  colorIndex: number
  vendors: MindMapVendorNode[]
}

export type CompareVendorMindMapModel = {
  rootLabel: string
  parts: MindMapPartBranch[]
}

/** Stroke colors matching a typical mind-map palette (blue, pink, red, violet, amber) */
const BRANCH_STROKES = ['#2563eb', '#db2777', '#dc2626', '#7c3aed', '#d97706']
const BRANCH_BG = [
  'bg-blue-50 border-blue-200/90',
  'bg-pink-50 border-pink-200/90',
  'bg-red-50 border-red-200/90',
  'bg-violet-50 border-violet-200/90',
  'bg-amber-50 border-amber-200/90',
]
const BRANCH_TEXT = [
  'text-blue-900',
  'text-pink-900',
  'text-red-900',
  'text-violet-900',
  'text-amber-900',
]

function cubicH(x1: number, y1: number, x2: number, y2: number): string {
  const mid = x1 + (x2 - x1) * 0.55
  return `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
}

function isSyntheticVendorDomain(domain: string): boolean {
  return domain.startsWith('+') || domain.includes('more vendors')
}

function partsForDomain(
  model: CompareVendorMindMapModel,
  domain: string
): { partId: string; partLabel: string; priceLabel: string | null }[] {
  return model.parts
    .map((part) => {
      const v = part.vendors.find((x) => x.domain === domain)
      return v
        ? { partId: part.id, partLabel: part.label, priceLabel: v.priceLabel }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
}

type DetailState =
  | null
  | { mode: 'one'; domain: string }
  | { mode: 'all' }

type CompareVendorMindMapProps = {
  model: CompareVendorMindMapModel
}

export function CompareVendorMindMap({ model }: CompareVendorMindMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const partRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const vendorRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [svgPaths, setSvgPaths] = useState<{ d: string; stroke: string }[]>([])
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 })
  const [detail, setDetail] = useState<DetailState>(null)

  const commonDomainsSorted = useMemo(() => {
    const s = new Set<string>()
    for (const p of model.parts) {
      for (const v of p.vendors) {
        if (v.isCommon && !isSyntheticVendorDomain(v.domain)) s.add(v.domain)
      }
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b))
  }, [model])

  const showCommonUi = model.parts.length > 1 && commonDomainsSorted.length > 0

  useEffect(() => {
    if (!detail) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDetail(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detail])

  const recalcPaths = useCallback(() => {
    const container = containerRef.current
    const rootEl = rootRef.current
    if (!container || !rootEl) {
      setSvgPaths([])
      return
    }
    const c = container.getBoundingClientRect()
    setSvgSize({ w: c.width, h: c.height })
    const paths: { d: string; stroke: string }[] = []

    const rootB = rootEl.getBoundingClientRect()
    const rx = rootB.right - c.left
    const ry = rootB.top + rootB.height / 2 - c.top

    for (const part of model.parts) {
      const stroke = BRANCH_STROKES[part.colorIndex % BRANCH_STROKES.length]
      const partEl = partRefs.current[part.id]
      if (!partEl) continue
      const pb = partEl.getBoundingClientRect()
      const px = pb.left - c.left
      const py = pb.top + pb.height / 2 - c.top
      paths.push({ d: cubicH(rx, ry, px, py), stroke })

      const pr = pb.right - c.left

      for (const v of part.vendors) {
        const vel = vendorRefs.current[v.key]
        if (!vel) continue
        const vb = vel.getBoundingClientRect()
        const vx = vb.left - c.left
        const vy = vb.top + vb.height / 2 - c.top
        paths.push({ d: cubicH(pr, vy, vx, vy), stroke })
      }
    }

    setSvgPaths(paths)
  }, [model])

  useLayoutEffect(() => {
    recalcPaths()
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(recalcPaths)
    })
    ro.observe(el)
    window.addEventListener('scroll', recalcPaths, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', recalcPaths, true)
    }
  }, [recalcPaths])

  return (
    <div
      ref={containerRef}
      className="relative mb-8 min-h-[280px] overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/60 p-6 shadow-sm ring-1 ring-slate-950/5"
      style={{
        backgroundImage: 'radial-gradient(circle, rgb(148 163 184 / 0.35) 1px, transparent 1px)',
        backgroundSize: '14px 14px',
      }}
    >
      {detail &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
            role="presentation"
          >
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
              onClick={() => setDetail(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="common-vendor-dialog-title"
              className="relative z-[101] max-h-[min(85vh,640px)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-950/10"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <h2 id="common-vendor-dialog-title" className="pr-8 text-base font-semibold text-slate-900">
                  {detail.mode === 'all'
                    ? 'Shared vendors & parts'
                    : detail.domain}
                </h2>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close dialog"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="max-h-[min(65vh,520px)] overflow-y-auto px-5 py-4">
                {detail.mode === 'one' ? (
                  (() => {
                    const rowsOne = partsForDomain(model, detail.domain)
                    return (
                      <>
                        <p className="text-sm text-slate-600">
                          Listed on{' '}
                          <span className="font-medium text-slate-800">{rowsOne.length}</span> of{' '}
                          <span className="font-medium text-slate-800">{model.parts.length}</span> compared parts. A
                          shared vendor is any domain that appears on at least two parts. Prices are from scraped
                          fields; parts without this vendor are omitted below.
                        </p>
                        <ul className="mt-4 space-y-3">
                          {rowsOne.map((row) => (
                            <li
                              key={row.partId}
                              className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5"
                            >
                              <p className="text-sm font-medium text-slate-900">{row.partLabel}</p>
                              <p className="mt-0.5 text-xs tabular-nums text-slate-600">
                                Price: {row.priceLabel ?? '—'}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </>
                    )
                  })()
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      Vendors whose domain appears on <span className="font-medium text-slate-800">at least two</span> of
                      your {model.parts.length} selected parts — not required on every part.
                    </p>
                    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full min-w-[280px] border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="px-3 py-2 font-semibold text-slate-700">Vendor</th>
                            <th className="px-3 py-2 font-semibold text-slate-700">Parts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commonDomainsSorted.map((domain) => {
                            const rows = partsForDomain(model, domain)
                            return (
                              <tr key={domain} className="border-b border-slate-100 last:border-0">
                                <td className="max-w-[10rem] align-top px-3 py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => setDetail({ mode: 'one', domain })}
                                    className="text-left text-xs font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-900"
                                  >
                                    {domain}
                                  </button>
                                </td>
                                <td className="px-3 py-2.5 align-top">
                                  <ul className="space-y-1.5">
                                    {rows.map((r) => (
                                      <li key={r.partId} className="text-xs text-slate-700">
                                        <span className="font-medium text-slate-900">{r.partLabel}</span>
                                        <span className="text-slate-500">
                                          {' '}
                                          · {r.priceLabel ?? '—'}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
      {svgSize.w > 0 && svgSize.h > 0 && (
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={svgSize.w}
          height={svgSize.h}
          aria-hidden
        >
          {svgPaths.map((p, i) => (
            <path
              key={i}
              d={p.d}
              fill="none"
              stroke={p.stroke}
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.85}
            />
          ))}
        </svg>
      )}

      <div className="relative z-10 flex min-w-max flex-row flex-wrap items-start gap-10 lg:gap-14">
        <div className="flex flex-col items-center pt-4">
          <div className="mb-2 flex w-full max-w-[220px] flex-col items-center gap-2">
            <div className="flex items-center gap-2 text-slate-500">
              <GitBranch className="h-4 w-4" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Mind map</span>
            </div>
            {showCommonUi ? (
              <button
                type="button"
                onClick={() => setDetail({ mode: 'all' })}
                className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-[11px] font-medium text-emerald-900 shadow-sm transition-colors hover:bg-emerald-100/90"
              >
                {commonDomainsSorted.length} shared vendor
                {commonDomainsSorted.length === 1 ? '' : 's'} (≥2 parts) — tap to see parts
              </button>
            ) : null}
          </div>
          <div
            ref={rootRef}
            className="max-w-[200px] rounded-2xl border-2 border-white bg-white px-5 py-4 text-center shadow-md ring-1 ring-slate-200/80"
          >
            <p className="text-sm font-semibold leading-snug text-slate-900">{model.rootLabel}</p>
          </div>
        </div>

        <div className="flex flex-row flex-wrap items-start gap-10 lg:gap-12">
          {model.parts.map((part) => {
            const ci = part.colorIndex % BRANCH_BG.length
            const stroke = BRANCH_STROKES[ci]
            return (
              <div key={part.id} className="flex min-w-[200px] max-w-[260px] flex-col gap-3">
                <div
                  ref={(el) => {
                    partRefs.current[part.id] = el
                  }}
                  className={`rounded-xl border-2 px-4 py-2.5 shadow-sm ${BRANCH_BG[ci]}`}
                  style={{ borderColor: `${stroke}40` }}
                >
                  <p className={`text-sm font-semibold leading-tight ${BRANCH_TEXT[ci]}`}>{part.label}</p>
                  <p className="mt-0.5 text-[11px] font-medium opacity-80" style={{ color: stroke }}>
                    {part.vendors.length} source{part.vendors.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="flex flex-col gap-2 pl-1">
                  {part.vendors.map((v) => (
                    <div
                      key={v.key}
                      ref={(el) => {
                        vendorRefs.current[v.key] = el
                      }}
                      role={v.isCommon && !isSyntheticVendorDomain(v.domain) ? 'button' : undefined}
                      tabIndex={v.isCommon && !isSyntheticVendorDomain(v.domain) ? 0 : undefined}
                      onClick={() => {
                        if (v.isCommon && !isSyntheticVendorDomain(v.domain)) {
                          setDetail({ mode: 'one', domain: v.domain })
                        }
                      }}
                      onKeyDown={(e) => {
                        if (
                          v.isCommon &&
                          !isSyntheticVendorDomain(v.domain) &&
                          (e.key === 'Enter' || e.key === ' ')
                        ) {
                          e.preventDefault()
                          setDetail({ mode: 'one', domain: v.domain })
                        }
                      }}
                      className={`rounded-lg border bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200/60 ${
                        v.isCommon && !isSyntheticVendorDomain(v.domain)
                          ? 'cursor-pointer ring-2 ring-emerald-300/80 transition-colors hover:bg-emerald-50/50 hover:ring-emerald-400/90'
                          : v.isCommon
                            ? 'ring-2 ring-emerald-300/80'
                            : ''
                      }`}
                      title={
                        v.isCommon && !isSyntheticVendorDomain(v.domain)
                          ? 'Click to see which parts list this vendor'
                          : undefined
                      }
                    >
                      <p className="truncate text-xs font-medium text-slate-800" title={v.domain}>
                        {v.domain}
                      </p>
                      {v.priceLabel ? (
                        <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">{v.priceLabel}</p>
                      ) : null}
                      {v.isCommon && !isSyntheticVendorDomain(v.domain) ? (
                        <span className="mt-1 inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                          Shared (≥2 parts) · view
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
