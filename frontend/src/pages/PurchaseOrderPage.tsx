import { useCallback, useMemo, useState } from 'react'
import {
  Building2,
  Calendar,
  FileText,
  Plus,
  Search,
  Trash2,
  Truck,
} from 'lucide-react'

type POStatus = 'draft' | 'submitted' | 'approved' | 'sent' | 'partial' | 'closed'

type POLine = {
  id: string
  sku: string
  description: string
  qty: number
  uom: string
  unitPrice: number
}

type PurchaseOrder = {
  id: string
  number: string
  vendorName: string
  vendorEmail: string
  issueDate: string
  requiredBy: string
  status: POStatus
  shipTo: string
  paymentTerms: string
  notes: string
  lines: POLine[]
}

const STATUS_ORDER: POStatus[] = [
  'draft',
  'submitted',
  'approved',
  'sent',
  'partial',
  'closed',
]

const STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  sent: 'Sent to vendor',
  partial: 'Partially received',
  closed: 'Closed',
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

function statusBadgeClass(status: POStatus): string {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'
  switch (status) {
    case 'draft':
      return `${base} bg-gray-100 text-gray-700`
    case 'submitted':
      return `${base} bg-amber-100 text-amber-900`
    case 'approved':
      return `${base} bg-sky-100 text-sky-900`
    case 'sent':
      return `${base} bg-indigo-100 text-indigo-900`
    case 'partial':
      return `${base} bg-violet-100 text-violet-900`
    case 'closed':
      return `${base} bg-emerald-100 text-emerald-900`
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

const SAMPLE_POS: PurchaseOrder[] = [
  {
    id: newId(),
    number: 'PO-2026-0142',
    vendorName: 'Acme Industrial Supply',
    vendorEmail: 'orders@acme-industrial.example',
    issueDate: '2026-03-12',
    requiredBy: '2026-04-01',
    status: 'approved',
    shipTo: 'Receiving Dock B — 400 Industrial Way, Austin TX',
    paymentTerms: 'Net 30',
    notes: 'Rush — align with line shutdown week of Mar 24.',
    lines: [
      {
        id: newId(),
        sku: 'BRG-6205-2RS',
        description: 'Deep groove ball bearing 25×52×15 mm',
        qty: 48,
        uom: 'ea',
        unitPrice: 12.4,
      },
      {
        id: newId(),
        sku: 'GREASE-MOLY-1KG',
        description: 'Molybdenum grease cartridge 1 kg',
        qty: 6,
        uom: 'ea',
        unitPrice: 34.99,
      },
    ],
  },
  {
    id: newId(),
    number: 'PO-2026-0143',
    vendorName: 'Northern Fasteners Co.',
    vendorEmail: 'sales@northern-fasteners.example',
    issueDate: '2026-03-18',
    requiredBy: '2026-03-28',
    status: 'draft',
    shipTo: 'Same as default warehouse',
    paymentTerms: 'Net 45',
    notes: '',
    lines: [
      {
        id: newId(),
        sku: 'BOLT-M10x40-SS',
        description: 'M10×40 hex bolt, stainless A2',
        qty: 200,
        uom: 'ea',
        unitPrice: 0.85,
      },
    ],
  },
]

function lineTotal(line: POLine): number {
  return line.qty * line.unitPrice
}

function poSubtotal(po: PurchaseOrder): number {
  return po.lines.reduce((s, l) => s + lineTotal(l), 0)
}

export function PurchaseOrderPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>(() => SAMPLE_POS)
  const [selectedId, setSelectedId] = useState<string | null>(() => SAMPLE_POS[0]?.id ?? null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all')

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  )

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (!q) return true
      return (
        o.number.toLowerCase().includes(q) ||
        o.vendorName.toLowerCase().includes(q) ||
        o.lines.some((l) => l.sku.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))
      )
    })
  }, [orders, query, statusFilter])

  const updateSelected = useCallback(
    (patch: Partial<PurchaseOrder> | ((prev: PurchaseOrder) => PurchaseOrder)) => {
      if (!selectedId) return
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== selectedId) return o
          return typeof patch === 'function' ? patch(o) : { ...o, ...patch }
        }),
      )
    },
    [selectedId],
  )

  const addLine = useCallback(() => {
    if (!selectedId) return
    updateSelected((po) => ({
      ...po,
      lines: [
        ...po.lines,
        {
          id: newId(),
          sku: '',
          description: '',
          qty: 1,
          uom: 'ea',
          unitPrice: 0,
        },
      ],
    }))
  }, [selectedId, updateSelected])

  const updateLine = useCallback(
    (lineId: string, patch: Partial<POLine>) => {
      updateSelected((po) => ({
        ...po,
        lines: po.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
      }))
    },
    [updateSelected],
  )

  const removeLine = useCallback(
    (lineId: string) => {
      updateSelected((po) => ({
        ...po,
        lines: po.lines.filter((l) => l.id !== lineId),
      }))
    },
    [updateSelected],
  )

  const createNewPo = useCallback(() => {
    const n = orders.length + 1
    const po: PurchaseOrder = {
      id: newId(),
      number: `PO-2026-${String(1000 + n).slice(-4)}`,
      vendorName: '',
      vendorEmail: '',
      issueDate: new Date().toISOString().slice(0, 10),
      requiredBy: '',
      status: 'draft',
      shipTo: '',
      paymentTerms: 'Net 30',
      notes: '',
      lines: [
        {
          id: newId(),
          sku: '',
          description: '',
          qty: 1,
          uom: 'ea',
          unitPrice: 0,
        },
      ],
    }
    setOrders((prev) => [po, ...prev])
    setSelectedId(po.id)
  }, [orders.length])

  const advanceStatus = useCallback(() => {
    if (!selected) return
    const i = STATUS_ORDER.indexOf(selected.status)
    if (i < 0 || i >= STATUS_ORDER.length - 1) return
    updateSelected({ status: STATUS_ORDER[i + 1]! })
  }, [selected, updateSelected])

  const subtotal = selected ? poSubtotal(selected) : 0
  const taxRate = 0
  const tax = subtotal * taxRate
  const grand = subtotal + tax

  const inputClass =
    'w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20'

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Purchase orders</h1>
          <p className="mt-1 text-sm text-gray-600">
            Draft POs, line items, and totals — demo data stays in the browser until you wire an API.
          </p>
        </div>
        <button
          type="button"
          onClick={createNewPo}
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 sm:mt-0"
        >
          <Plus className="h-4 w-4" aria-hidden />
          New purchase order
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        {/* List */}
        <div className="lg:col-span-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search PO #, vendor, SKU…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`${inputClass} pl-9`}
                  aria-label="Search purchase orders"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as POStatus | 'all')}
                className={`${inputClass} mt-2`}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <ul className="max-h-[min(70vh,560px)] divide-y divide-gray-100 overflow-y-auto">
              {filteredList.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-gray-500">No matching orders.</li>
              )}
              {filteredList.map((o) => {
                const active = o.id === selectedId
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors ${active ? 'bg-blue-50/80' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-gray-900">{o.number}</span>
                        <span className={statusBadgeClass(o.status)}>{STATUS_LABEL[o.status]}</span>
                      </div>
                      <span className="text-sm text-gray-600">{o.vendorName || '— vendor —'}</span>
                      <span className="tabular-nums text-xs text-gray-500">
                        {formatMoney(poSubtotal(o))} · {o.lines.length} line{o.lines.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {/* Detail */}
        <div className="lg:col-span-8">
          {!selected ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-8 text-center text-sm text-gray-500">
              Select a purchase order or create a new one.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Workflow */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Workflow</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {STATUS_ORDER.map((s, idx) => {
                    const currentIdx = STATUS_ORDER.indexOf(selected.status)
                    const done = idx < currentIdx
                    const current = idx === currentIdx
                    return (
                      <div key={s} className="flex items-center gap-2">
                        {idx > 0 && (
                          <span className="hidden text-gray-300 sm:inline" aria-hidden>
                            →
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            current
                              ? 'bg-blue-600 text-white'
                              : done
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {STATUS_LABEL[s]}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={advanceStatus}
                    disabled={selected.status === 'closed'}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    Advance status
                  </button>
                  <span className="self-center text-xs text-gray-500">Demo only — no server persistence.</span>
                </div>
              </div>

              {/* Header fields */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4">
                  <FileText className="h-5 w-5 text-gray-400" aria-hidden />
                  <h2 className="text-lg font-semibold text-gray-900">{selected.number}</h2>
                  <span className={statusBadgeClass(selected.status)}>{STATUS_LABEL[selected.status]}</span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                      <Building2 className="h-3.5 w-3.5" aria-hidden />
                      Vendor name
                    </label>
                    <input
                      className={`${inputClass} mt-1`}
                      value={selected.vendorName}
                      onChange={(e) => updateSelected({ vendorName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Vendor email</label>
                    <input
                      type="email"
                      className={`${inputClass} mt-1`}
                      value={selected.vendorEmail}
                      onChange={(e) => updateSelected({ vendorEmail: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                      <Calendar className="h-3.5 w-3.5" aria-hidden />
                      Issue date
                    </label>
                    <input
                      type="date"
                      className={`${inputClass} mt-1`}
                      value={selected.issueDate}
                      onChange={(e) => updateSelected({ issueDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Required by</label>
                    <input
                      type="date"
                      className={`${inputClass} mt-1`}
                      value={selected.requiredBy}
                      onChange={(e) => updateSelected({ requiredBy: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                      <Truck className="h-3.5 w-3.5" aria-hidden />
                      Ship to
                    </label>
                    <textarea
                      rows={2}
                      className={`${inputClass} mt-1 resize-y`}
                      value={selected.shipTo}
                      onChange={(e) => updateSelected({ shipTo: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Payment terms</label>
                    <input
                      className={`${inputClass} mt-1`}
                      value={selected.paymentTerms}
                      onChange={(e) => updateSelected({ paymentTerms: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-gray-600">Notes</label>
                    <textarea
                      rows={2}
                      className={`${inputClass} mt-1 resize-y`}
                      value={selected.notes}
                      onChange={(e) => updateSelected({ notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Lines */}
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 sm:px-6">
                  <h3 className="text-sm font-semibold text-gray-900">Line items</h3>
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add line
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-medium uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 sm:px-4">SKU</th>
                        <th className="px-3 py-2 sm:px-4">Description</th>
                        <th className="px-3 py-2 sm:px-4">Qty</th>
                        <th className="px-3 py-2 sm:px-4">UOM</th>
                        <th className="px-3 py-2 sm:px-4">Unit price</th>
                        <th className="px-3 py-2 text-right sm:px-4">Line total</th>
                        <th className="w-10 px-2 py-2" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selected.lines.map((line) => (
                        <tr key={line.id} className="hover:bg-gray-50/50">
                          <td className="px-3 py-2 sm:px-4">
                            <input
                              className={`${inputClass} font-mono text-xs`}
                              value={line.sku}
                              onChange={(e) => updateLine(line.id, { sku: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2 sm:px-4">
                            <input
                              className={inputClass}
                              value={line.description}
                              onChange={(e) => updateLine(line.id, { description: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2 sm:px-4">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              className={`${inputClass} tabular-nums`}
                              value={line.qty}
                              onChange={(e) =>
                                updateLine(line.id, { qty: Math.max(0, Number(e.target.value) || 0) })
                              }
                            />
                          </td>
                          <td className="px-3 py-2 sm:px-4">
                            <input
                              className={`${inputClass} w-16`}
                              value={line.uom}
                              onChange={(e) => updateLine(line.id, { uom: e.target.value })}
                            />
                          </td>
                          <td className="px-3 py-2 sm:px-4">
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className={`${inputClass} tabular-nums`}
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(line.id, {
                                  unitPrice: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900 sm:px-4">
                            {formatMoney(lineTotal(line))}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => removeLine(line.id)}
                              disabled={selected.lines.length <= 1}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label="Remove line"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4 sm:px-6">
                  <div className="ml-auto max-w-xs space-y-2 text-sm">
                    <div className="flex justify-between tabular-nums text-gray-600">
                      <span>Subtotal</span>
                      <span>{formatMoney(subtotal)}</span>
                    </div>
                    <div className="flex justify-between tabular-nums text-gray-600">
                      <span>Tax ({(taxRate * 100).toFixed(0)}%)</span>
                      <span>{formatMoney(tax)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold tabular-nums text-gray-900">
                      <span>Total</span>
                      <span>{formatMoney(grand)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
