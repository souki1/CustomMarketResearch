import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, X } from 'lucide-react'
import { useBucket } from '@/contexts/BucketContext'
import { RESEARCH_PATH } from '@/lib/paths'

function parsePrice(price: string): number {
  const cleaned = String(price ?? '').replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function StatusDot({ ready }: { ready: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`}
      aria-hidden
    />
  )
}

export function BucketPage() {
  const { items, removeItem, removeItems, updateQty } = useBucket()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const total = useMemo(
    () => items.reduce((sum, item) => sum + parsePrice(item.price) * (item.qty ?? 1), 0),
    [items]
  )

  const readyCount = useMemo(
    () => items.filter((item) => parsePrice(item.price) > 0).length,
    [items]
  )

  const byVendor = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      const vendor = item.manufacturer.trim() || 'Unknown vendor'
      map.set(vendor, (map.get(vendor) ?? 0) + parsePrice(item.price) * (item.qty ?? 1))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))))
  }

  const removeSelected = () => {
    removeItems([...selected])
    setSelected(new Set())
  }

  function exportCsv() {
    const headers = ['Part', 'Vendor', 'Unit price', 'Qty', 'Line total']
    const rows = items.map((item) => {
      const unit = parsePrice(item.price)
      const qty = item.qty ?? 1
      return [
        `"${item.title.replace(/"/g, '""')}"`,
        `"${item.manufacturer.replace(/"/g, '""')}"`,
        unit.toFixed(2),
        String(qty),
        (unit * qty).toFixed(2),
      ].join(',')
    })
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'procurement-bucket.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full min-w-0 overflow-y-auto bg-slate-50">
      <div className="flex w-full flex-col gap-3.5 p-5 lg:flex-row lg:items-start lg:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="m-0 text-lg font-bold tracking-tight text-slate-900">Procurement Bucket</h1>
              <p className="mt-1 text-[13px] text-slate-500">
                {items.length} item{items.length !== 1 ? 's' : ''} · {readyCount} ready to order
              </p>
            </div>
            <Link
              to={RESEARCH_PATH}
              className="inline-flex items-center gap-1.5 rounded-[5px] bg-blue-600 px-2.5 py-[5px] text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Add parts
            </Link>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-1.5">
              <span className="text-xs font-semibold text-blue-800">{selected.size} selected</span>
              <button
                type="button"
                onClick={removeSelected}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {items.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <p className="text-sm font-medium text-slate-600">Your bucket is empty</p>
                <p className="mt-1 text-xs text-slate-400">
                  Add parts from Research, Compare, or Portfolio.
                </p>
                <Link
                  to={RESEARCH_PATH}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-[5px] bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Go to Research
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="h-9 w-10 border-b border-slate-200 pl-3.5">
                        <input
                          type="checkbox"
                          checked={selected.size === items.length && items.length > 0}
                          onChange={toggleAll}
                          className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                          aria-label="Select all bucket items"
                        />
                      </th>
                      {['Status', 'Part', 'Vendor', 'Price', 'Qty', 'Total', ''].map((h) => (
                        <th
                          key={h || 'actions'}
                          className="h-9 border-b border-slate-200 px-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const isSel = selected.has(item.id)
                      const unit = parsePrice(item.price)
                      const qty = item.qty ?? 1
                      const ready = unit > 0
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-slate-100 ${isSel ? 'bg-blue-50' : 'bg-white'}`}
                        >
                          <td className="h-11 pl-3.5">
                            <input
                              type="checkbox"
                              checked={isSel}
                              onChange={() => toggleSel(item.id)}
                              className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                              aria-label={`Select ${item.title}`}
                            />
                          </td>
                          <td className="h-11 px-3.5">
                            <StatusDot ready={ready} />
                          </td>
                          <td className="h-11 max-w-0 px-3.5">
                            <div className="truncate font-mono text-[11px] font-semibold text-blue-700">
                              {item.title || '—'}
                            </div>
                            {item.manufacturer && item.manufacturer !== item.title && (
                              <div className="truncate text-xs text-slate-500">{item.manufacturer}</div>
                            )}
                          </td>
                          <td className="h-11 max-w-0 px-3.5">
                            <span className="truncate text-[13px] text-slate-600">
                              {item.manufacturer || '—'}
                            </span>
                          </td>
                          <td className="h-11 px-3.5 font-mono text-[13px] font-semibold text-slate-800">
                            {unit > 0 ? money(unit) : item.price || '—'}
                          </td>
                          <td className="h-11 px-3.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateQty(item.id, qty - 1)}
                                className="flex h-[22px] w-[22px] items-center justify-center rounded border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <span className="min-w-[20px] text-center text-[13px] font-semibold text-slate-800">
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(item.id, qty + 1)}
                                className="flex h-[22px] w-[22px] items-center justify-center rounded border border-slate-200 bg-white text-sm text-slate-600 hover:bg-slate-50"
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="h-11 px-3.5 font-mono text-sm font-bold text-slate-900">
                            {unit > 0 ? money(unit * qty) : '—'}
                          </td>
                          <td className="h-11 px-2.5">
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="flex rounded p-1 text-slate-300 hover:text-slate-600"
                              aria-label={`Remove ${item.title}`}
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3.5 lg:w-60">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3.5 py-2.5">
              <span className="text-[13px] font-semibold text-slate-800">Order Summary</span>
            </div>
            <div className="flex flex-col gap-2.5 px-3.5 py-3">
              {[
                ['Subtotal', money(total)],
                ['Shipping', 'TBD'],
                ['Tax (est.)', 'TBD'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-[13px] text-slate-500">{label}</span>
                  <span className="font-mono text-[13px] font-medium text-slate-700">{value}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2.5">
                <span className="text-sm font-semibold text-slate-800">Total</span>
                <span className="font-mono text-base font-bold text-slate-900">{money(total)}</span>
              </div>
              <Link
                to="/purchase-order"
                className="block w-full rounded-md bg-blue-600 py-2 text-center text-[13px] font-semibold text-white hover:bg-blue-700"
              >
                Place order →
              </Link>
              <button
                type="button"
                onClick={exportCsv}
                disabled={items.length === 0}
                className="w-full rounded-md border border-slate-200 bg-white py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Export CSV
              </button>
            </div>
          </div>

          {byVendor.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-3.5 py-2.5">
                <span className="text-[13px] font-semibold text-slate-800">By vendor</span>
              </div>
              <div className="flex flex-col gap-2 px-3.5 py-2.5">
                {byVendor.map(([vendor, amt]) => (
                  <div key={vendor} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[9px] font-bold text-slate-500">
                        {vendor[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span className="max-w-[110px] truncate text-xs text-slate-600">{vendor}</span>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold text-slate-800">
                      {money(amt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BucketPage
