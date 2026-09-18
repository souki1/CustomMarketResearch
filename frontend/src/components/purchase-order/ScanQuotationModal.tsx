import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles, X } from 'lucide-react'
import type { PortfolioItem } from '@/lib/api'
import { PO_INPUT, parsePriceToNumber } from './poShared'

export type ScannedOffer = {
  sku: string
  description: string
  vendor_url: string
  qty: number
  uom: string
  unit_price: number
  vendor_name: string
}

type ScanQuotationModalProps = {
  open: boolean
  onClose: () => void
  offers: PortfolioItem[]
  loading: boolean
  onCreate: (offers: ScannedOffer[], vendorName: string) => void
  creating: boolean
}

export function ScanQuotationModal({
  open,
  onClose,
  offers,
  loading,
  onCreate,
  creating,
}: ScanQuotationModalProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<number>>(() => new Set())

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelected(new Set())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return offers
    return offers.filter((item) => {
      const hay = `${item.part_number ?? ''} ${item.vendor_name ?? ''} ${item.price ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [offers, query])

  if (!open) return null

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const handleCreate = () => {
    const picked = [...selected]
      .sort((a, b) => a - b)
      .map((idx) => filtered[idx])
      .filter(Boolean)
    if (picked.length === 0) return
    const scanned: ScannedOffer[] = picked.map((item) => ({
      sku: (item.part_number ?? '').trim() || 'ITEM',
      description: [item.vendor_name, item.price ? `Price: ${item.price}` : null].filter(Boolean).join(' · '),
      vendor_url: (item.url ?? '').trim(),
      qty: item.quantity != null && item.quantity > 0 ? item.quantity : 1,
      uom: 'ea',
      unit_price: parsePriceToNumber(item.price),
      vendor_name: (item.vendor_name ?? '').trim(),
    }))
    const vendorName = scanned[0]?.vendor_name ?? ''
    onCreate(scanned, vendorName)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1B2559]/35 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-quote-title"
        className="my-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-[#E6E8F0] bg-white shadow-[0_24px_80px_-24px_rgba(28,37,89,0.45)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#EEF0F5] px-5 py-4">
          <div>
            <h2 id="scan-quote-title" className="text-[16px] font-semibold text-[#1B2559]">
              Scan quotation
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-5 text-[#6B728C]">
              Turn saved supplier quotes into a ready-to-submit purchase order. Select the lines to include, then create
              the draft.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6B728C] hover:bg-[#F3F5FA]"
            aria-label="Close scan quotation"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search part, vendor, or price…"
            className={PO_INPUT}
            aria-label="Search saved quotations"
          />
          <div className="mt-3 max-h-[min(52vh,420px)] overflow-auto rounded-xl border border-[#EEF0F5]">
            {loading ? (
              <div className="flex items-center gap-2 px-4 py-10 text-[13px] text-[#6B728C]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading saved quotes…
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-[#6B728C]">
                No saved supplier quotes yet. Research a part, save it to the portfolio, then scan it here.
              </p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="sticky top-0 bg-[#F7F8FC] text-[11px] font-medium uppercase tracking-[0.04em] text-[#8A91A8]">
                  <tr>
                    <th className="w-10 px-3 py-2" aria-label="Select" />
                    <th className="px-3 py-2">Part</th>
                    <th className="px-3 py-2">Supplier</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F2F7]">
                  {filtered.map((item, idx) => (
                    <tr key={`${item.part_number}-${item.url}-${idx}`} className="hover:bg-[#F8F9FD]">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(idx)}
                          onChange={() => toggle(idx)}
                          className="rounded border-[#C5CAD8] text-[#5B5CE6] focus:ring-[#5B5CE6]/30"
                          aria-label={`Select ${item.part_number ?? 'offer'}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium text-[#1B2559]">{item.part_number ?? '—'}</td>
                      <td className="px-3 py-2.5 text-[#4B5168]">{item.vendor_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#4B5168]">{item.price ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#4B5168]">{item.quantity ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EEF0F5] bg-[#F8F9FD] px-5 py-3.5">
          <p className="inline-flex items-center gap-1.5 text-[12px] text-[#6B728C]">
            <Sparkles className="h-3.5 w-3.5 text-[#7C6BF5]" aria-hidden />
            {selected.size} quote line{selected.size === 1 ? '' : 's'} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-full border border-[#D7DBE8] bg-white px-4 text-[13px] font-medium text-[#3D4468] hover:bg-[#F3F5FA]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={selected.size === 0 || creating}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25245A] px-4 text-[13px] font-medium text-white hover:bg-[#1C1B45] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
              Create with AI
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
