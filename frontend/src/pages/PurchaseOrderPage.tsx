import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Calendar,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Plus,
  Search,
  Trash2,
  Truck,
} from 'lucide-react'
import {
  createPurchaseOrder,
  createReport,
  exportReportPdf,
  listPortfolioItems,
  listPurchaseOrders,
  updatePurchaseOrder,
  type PortfolioItem,
  type PurchaseOrderResponse,
} from '@/lib/api'
import { useAuthToken } from '@/lib/auth'
import type { TableCell } from '@/lib/savedReports'

type POStatus = PurchaseOrderResponse['status']

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

function lineTotal(line: PurchaseOrderResponse['lines'][number]): number {
  return line.qty * line.unit_price
}

function poSubtotal(po: PurchaseOrderResponse): number {
  return po.lines.reduce((s, l) => s + lineTotal(l), 0)
}

function parsePriceToNumber(price: string | null | undefined): number {
  if (price == null || price === '') return 0
  const cleaned = String(price).replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Safe http(s) href for user-entered line URLs (blocks javascript: etc.). */
function vendorUrlForLink(raw: string | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  try {
    const u = new URL(s.startsWith('http://') || s.startsWith('https://') ? s : `https://${s}`)
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
  } catch {
    return null
  }
  return null
}

function newReportBlockId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function buildPoReportBlocks(po: PurchaseOrderResponse): Array<Record<string, unknown>> {
  const header: TableCell[] = [
    'SKU',
    'Description',
    'Vendor link',
    'Qty',
    'UOM',
    'Unit price',
    'Line total',
  ]
  const dataRows: TableCell[][] = po.lines.map((l) => {
    const href = vendorUrlForLink(l.vendor_url)
    const vendorCell: TableCell = href
      ? { type: 'link', label: 'Vendor link →', href }
      : (l.vendor_url ?? '').trim() || '—'
    return [
      l.sku,
      l.description,
      vendorCell,
      String(l.qty),
      l.uom,
      formatMoney(l.unit_price),
      formatMoney(lineTotal(l)),
    ]
  })
  const rows: TableCell[][] = [header, ...dataRows]
  return [
    { id: newReportBlockId(), type: 'title', text: `Purchase order ${po.number}`, align: 'left' },
    {
      id: newReportBlockId(),
      type: 'paragraph',
      text: `Vendor: ${po.vendor_name || '—'}${po.vendor_email ? ` · ${po.vendor_email}` : ''}. Issue date: ${po.issue_date || '—'}. Required by: ${po.required_by || '—'}.`,
      align: 'left',
    },
    ...(po.ship_to.trim()
      ? [{ id: newReportBlockId(), type: 'heading', text: 'Ship to', align: 'left' as const }]
      : []),
    ...(po.ship_to.trim()
      ? [{ id: newReportBlockId(), type: 'paragraph', text: po.ship_to, align: 'left' as const }]
      : []),
    ...(po.notes.trim()
      ? [{ id: newReportBlockId(), type: 'callout', text: po.notes, align: 'left' as const, tone: 'blue' as const }]
      : []),
    { id: newReportBlockId(), type: 'heading', text: 'Line items', align: 'left' },
    {
      id: newReportBlockId(),
      type: 'table',
      showHeader: true,
      rows,
      align: 'left',
      colWidths: [0.88, 1.65, 1.02, 0.42, 0.38, 0.72, 0.78],
    },
  ]
}

function nextPoNumber(existing: PurchaseOrderResponse[]): string {
  const n = existing.length + 1
  return `PO-2026-${String(1000 + n).slice(-4)}`
}

export function PurchaseOrderPage() {
  const navigate = useNavigate()
  const token = useAuthToken()

  const [orders, setOrders] = useState<PurchaseOrderResponse[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all')
  const [loadingList, setLoadingList] = useState(false)
  const [loadListError, setLoadListError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)

  const [selectedVendor, setSelectedVendor] = useState('')
  const [selectedPart, setSelectedPart] = useState('')
  const [portfolioForImport, setPortfolioForImport] = useState<PortfolioItem[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [selectedOfferIdx, setSelectedOfferIdx] = useState<Set<number>>(() => new Set())

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId],
  )

  useEffect(() => {
    if (!token) {
      setLoadingList(false)
      return
    }
    setLoadingList(true)
    setLoadListError(null)
    void listPurchaseOrders(token)
      .then((rows) => {
        setOrders(rows)
        setSelectedId((cur) => {
          if (cur != null && rows.some((r) => r.id === cur)) return cur
          return rows[0]?.id ?? null
        })
        setDirty(false)
      })
      .catch((e) => setLoadListError(e instanceof Error ? e.message : 'Failed to load purchase orders'))
      .finally(() => setLoadingList(false))
  }, [token])

  useEffect(() => {
    if (!token) {
      setPortfolioForImport([])
      return
    }
    let cancelled = false
    setImportLoading(true)
    void listPortfolioItems(token)
      .then((items) => {
        if (!cancelled) setPortfolioForImport(items)
      })
      .catch(() => {
        if (!cancelled) setPortfolioForImport([])
      })
      .finally(() => {
        if (!cancelled) setImportLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const uniqueVendors = useMemo(() => {
    const s = new Set<string>()
    for (const it of portfolioForImport) {
      const v = (it.vendor_name ?? '').trim()
      if (v) s.add(v)
    }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [portfolioForImport])

  const uniqueParts = useMemo(() => {
    const s = new Set<string>()
    for (const it of portfolioForImport) {
      const p = (it.part_number ?? '').trim()
      if (p) s.add(p)
    }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [portfolioForImport])

  /** Vendor-only → all parts for that vendor; part-only → all vendors for that part; both → intersection. */
  const displayedOffers = useMemo(() => {
    const v = selectedVendor.trim()
    const p = selectedPart.trim()
    if (!v && !p) return []
    let rows = portfolioForImport
    if (v) rows = rows.filter((i) => (i.vendor_name ?? '').trim() === v)
    if (p) rows = rows.filter((i) => (i.part_number ?? '').trim() === p)
    return rows
  }, [portfolioForImport, selectedVendor, selectedPart])

  useEffect(() => {
    setSelectedOfferIdx(new Set())
  }, [selectedVendor, selectedPart])

  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false
      if (!q) return true
      return (
        o.number.toLowerCase().includes(q) ||
        o.vendor_name.toLowerCase().includes(q) ||
        o.lines.some(
          (l) =>
            l.sku.toLowerCase().includes(q) || l.description.toLowerCase().includes(q),
        )
      )
    })
  }, [orders, query, statusFilter])

  const updateSelected = useCallback(
    (patch: Partial<PurchaseOrderResponse> | ((prev: PurchaseOrderResponse) => PurchaseOrderResponse)) => {
      if (selectedId == null) return
      setDirty(true)
      setSaveError(null)
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== selectedId) return o
          return typeof patch === 'function' ? patch(o) : { ...o, ...patch }
        }),
      )
    },
    [selectedId],
  )

  const saveSelected = useCallback(async () => {
    if (!token || selectedId == null || !selected) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updatePurchaseOrder(token, selectedId, {
        number: selected.number,
        vendor_name: selected.vendor_name,
        vendor_email: selected.vendor_email,
        issue_date: selected.issue_date,
        required_by: selected.required_by,
        status: selected.status,
        ship_to: selected.ship_to,
        payment_terms: selected.payment_terms,
        notes: selected.notes,
        lines: selected.lines,
        source_selection_id: selected.source_selection_id ?? null,
      })
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
      setDirty(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [token, selectedId, selected])

  const addLine = useCallback(() => {
    if (selectedId == null) return
    updateSelected((po) => ({
      ...po,
      lines: [
        ...po.lines,
        {
          id: newId(),
          sku: '',
          description: '',
          vendor_url: '',
          qty: 1,
          uom: 'ea',
          unit_price: 0,
        },
      ],
    }))
  }, [selectedId, updateSelected])

  const updateLine = useCallback(
    (lineId: string, patch: Partial<PurchaseOrderResponse['lines'][number]>) => {
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

  const createNewPo = useCallback(async () => {
    if (!token) return
    setCreating(true)
    setSaveError(null)
    try {
      const payload = {
        number: nextPoNumber(orders),
        vendor_name: '',
        vendor_email: '',
        issue_date: new Date().toISOString().slice(0, 10),
        required_by: '',
        status: 'draft' as const,
        ship_to: '',
        payment_terms: 'Net 30',
        notes: '',
        lines: [
          {
            id: newId(),
            sku: '',
            description: '',
            vendor_url: '',
            qty: 1,
            uom: 'ea',
            unit_price: 0,
          },
        ],
        source_selection_id: null,
      }
      const created = await createPurchaseOrder(token, payload)
      setOrders((prev) => [created, ...prev])
      setSelectedId(created.id)
      setDirty(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not create purchase order')
    } finally {
      setCreating(false)
    }
  }, [token, orders])

  const advanceStatus = useCallback(() => {
    if (!selected) return
    const i = STATUS_ORDER.indexOf(selected.status)
    if (i < 0 || i >= STATUS_ORDER.length - 1) return
    updateSelected({ status: STATUS_ORDER[i + 1]! })
  }, [selected, updateSelected])

  const toggleOffer = useCallback((idx: number) => {
    setSelectedOfferIdx((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [])

  const addSelectedOffersToLines = useCallback(() => {
    if (selectedId == null || !selected) return
    const idxs = [...selectedOfferIdx].sort((a, b) => a - b)
    if (idxs.length === 0) return
    const toAdd = idxs.map((i) => displayedOffers[i]).filter(Boolean)
    if (toAdd.length === 0) return

    const newLines = toAdd.map((it) => {
      const sku = (it.part_number ?? '').trim() || 'ITEM'
      const descParts = [it.vendor_name, it.price ? `Price: ${it.price}` : null].filter(Boolean)
      const vendorUrl = (it.url ?? '').trim()
      return {
        id: newId(),
        sku,
        description: descParts.join(' · '),
        vendor_url: vendorUrl,
        qty: it.quantity != null && it.quantity > 0 ? it.quantity : 1,
        uom: 'ea',
        unit_price: parsePriceToNumber(it.price),
      }
    })

    const firstVendor = (toAdd[0]?.vendor_name ?? '').trim()
    updateSelected((po) => ({
      ...po,
      lines: [...po.lines, ...newLines],
      source_selection_id: null,
      vendor_name: po.vendor_name.trim() ? po.vendor_name : firstVendor || po.vendor_name,
    }))
    setSelectedOfferIdx(new Set())
  }, [selectedId, selected, selectedOfferIdx, displayedOffers, updateSelected])

  const createSummaryReport = useCallback(async () => {
    if (!token || !selected) return
    setReportBusy(true)
    setSaveError(null)
    try {
      const blocks = buildPoReportBlocks(selected)
      const created = await createReport(token, {
        title: `Purchase order ${selected.number}`,
        blocks,
      })
      const blob = await exportReportPdf(token, created.id)
      const filename = `PO_${selected.number.replace(/[^\w.-]+/g, '_')}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      navigate('/reports')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not create report')
    } finally {
      setReportBusy(false)
    }
  }, [token, selected, navigate])

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
            Build POs manually or import lines from scraped vendor offers (all saved research sheets combined).
            Signed-in users sync to the server (MongoDB).
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
          {token && (
            <button
              type="button"
              onClick={() => void saveSelected()}
              disabled={!selected || !dirty || saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save changes
            </button>
          )}
          <button
            type="button"
            onClick={() => void createNewPo()}
            disabled={!token || creating}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            New purchase order
          </button>
        </div>
      </div>

      {!token && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <Link to="/signin" className="font-medium text-amber-900 underline hover:no-underline">
            Sign in
          </Link>{' '}
          to load and save purchase orders, and to import lines from scraped research data.
        </div>
      )}

      {loadListError && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {loadListError}
        </p>
      )}
      {saveError && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {saveError}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
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
              {loadingList && (
                <li className="px-4 py-10 text-center text-sm text-gray-500">Loading…</li>
              )}
              {!loadingList && filteredList.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-gray-500">No matching orders.</li>
              )}
              {!loadingList &&
                filteredList.map((o) => {
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
                        <span className="text-sm text-gray-600">{o.vendor_name || '— vendor —'}</span>
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

        <div className="lg:col-span-8">
          {!selected ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-8 text-center text-sm text-gray-500">
              {token ? 'Select a purchase order or create a new one.' : 'Sign in to manage purchase orders.'}
            </div>
          ) : (
            <div className="space-y-6">
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
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={advanceStatus}
                    disabled={selected.status === 'closed'}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    Advance status
                  </button>
                  {dirty && token && (
                    <span className="text-xs text-amber-700">Unsaved changes — use Save changes.</span>
                  )}
                  {!dirty && token && <span className="text-xs text-gray-500">All changes saved.</span>}
                </div>
              </div>

              {token && (
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Import from scraped data</h2>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Pick a <span className="font-medium text-gray-700">vendor</span> to see every part they offer, or
                        a <span className="font-medium text-gray-700">part</span> to see every vendor. Choose both to
                        narrow. Data includes all saved research sheets.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Vendor</label>
                      <select
                        className={`${inputClass} mt-1`}
                        aria-label="Filter by vendor"
                        value={selectedVendor}
                        onChange={(e) => setSelectedVendor(e.target.value)}
                        disabled={importLoading}
                      >
                        <option value="">Select vendor…</option>
                        {uniqueVendors.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Part number</label>
                      <select
                        className={`${inputClass} mt-1`}
                        aria-label="Filter by part number"
                        value={selectedPart}
                        onChange={(e) => setSelectedPart(e.target.value)}
                        disabled={importLoading}
                      >
                        <option value="">Select part…</option>
                        {uniqueParts.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
                    {importLoading ? (
                      <div className="flex items-center gap-2 px-4 py-8 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Loading offers…
                      </div>
                    ) : portfolioForImport.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500">
                        No scraped offers yet. Save a datasheet selection and run research/scraping first, then return
                        here.
                      </p>
                    ) : !selectedVendor.trim() && !selectedPart.trim() ? (
                      <p className="px-4 py-6 text-sm text-gray-500">
                        Select a vendor or a part (or both) above to list matching offers.
                      </p>
                    ) : displayedOffers.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-500">No offers match this vendor/part combination.</p>
                    ) : (
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-medium uppercase tracking-wide text-gray-500">
                            <th className="w-10 px-3 py-2 sm:px-4" aria-label="Select" />
                            <th className="px-3 py-2 sm:px-4">Part</th>
                            <th className="px-3 py-2 sm:px-4">Vendor</th>
                            <th className="px-3 py-2 sm:px-4">Price</th>
                            <th className="px-3 py-2 sm:px-4">Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {displayedOffers.map((it, idx) => (
                            <tr key={`${idx}-${it.part_number}-${it.url}`} className="hover:bg-gray-50/50">
                              <td className="px-3 py-2 sm:px-4">
                                <input
                                  type="checkbox"
                                  checked={selectedOfferIdx.has(idx)}
                                  onChange={() => toggleOffer(idx)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/30"
                                  aria-label={`Select offer ${it.part_number ?? idx}`}
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-900 sm:px-4">
                                {it.part_number ?? '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-700 sm:px-4">{it.vendor_name ?? '—'}</td>
                              <td className="px-3 py-2 tabular-nums text-gray-700 sm:px-4">{it.price ?? '—'}</td>
                              <td className="px-3 py-2 tabular-nums text-gray-700 sm:px-4">
                                {it.quantity ?? '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={addSelectedOffersToLines}
                      disabled={
                        selectedOfferIdx.size === 0 ||
                        (!selectedVendor.trim() && !selectedPart.trim()) ||
                        displayedOffers.length === 0
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-gray-500/30"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Add selected to PO
                    </button>
                    <span className="text-xs text-gray-500">
                      Vendor on the PO header fills automatically if it is still empty and offers share a vendor.
                    </span>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 pb-4">
                  <FileText className="h-5 w-5 text-gray-400" aria-hidden />
                  <h2 className="text-lg font-semibold text-gray-900">{selected.number}</h2>
                  <span className={statusBadgeClass(selected.status)}>{STATUS_LABEL[selected.status]}</span>
                  {token && (
                    <button
                      type="button"
                      onClick={() => void createSummaryReport()}
                      disabled={reportBusy}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {reportBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Download PDF summary
                    </button>
                  )}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                      <Building2 className="h-3.5 w-3.5" aria-hidden />
                      Vendor name
                    </label>
                    <input
                      className={`${inputClass} mt-1`}
                      value={selected.vendor_name}
                      onChange={(e) => updateSelected({ vendor_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Vendor email</label>
                    <input
                      type="email"
                      className={`${inputClass} mt-1`}
                      value={selected.vendor_email}
                      onChange={(e) => updateSelected({ vendor_email: e.target.value })}
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
                      value={selected.issue_date}
                      onChange={(e) => updateSelected({ issue_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Required by</label>
                    <input
                      type="date"
                      className={`${inputClass} mt-1`}
                      value={selected.required_by}
                      onChange={(e) => updateSelected({ required_by: e.target.value })}
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
                      value={selected.ship_to}
                      onChange={(e) => updateSelected({ ship_to: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Payment terms</label>
                    <input
                      className={`${inputClass} mt-1`}
                      value={selected.payment_terms}
                      onChange={(e) => updateSelected({ payment_terms: e.target.value })}
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
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-medium uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 sm:px-4">SKU</th>
                        <th className="px-3 py-2 sm:px-4">Description</th>
                        <th className="min-w-[200px] px-3 py-2 sm:px-4">Vendor URL</th>
                        <th className="px-3 py-2 sm:px-4">Qty</th>
                        <th className="px-3 py-2 sm:px-4">UOM</th>
                        <th className="px-3 py-2 sm:px-4">Unit price</th>
                        <th className="px-3 py-2 text-right sm:px-4">Line total</th>
                        <th className="w-10 px-2 py-2" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selected.lines.map((line) => {
                        const vendorHref = vendorUrlForLink(line.vendor_url)
                        return (
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
                              <div className="flex min-w-0 items-center gap-1.5">
                                <input
                                  className={`${inputClass} min-w-0 flex-1 font-mono text-xs`}
                                  placeholder="https://…"
                                  autoComplete="off"
                                  value={line.vendor_url ?? ''}
                                  onChange={(e) => updateLine(line.id, { vendor_url: e.target.value })}
                                  aria-label="Vendor or product page URL"
                                />
                                {vendorHref ? (
                                  <a
                                    href={vendorHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 rounded p-1 text-blue-600 hover:bg-blue-50"
                                    title="Open link"
                                  >
                                    <ExternalLink className="h-4 w-4" aria-hidden />
                                  </a>
                                ) : null}
                              </div>
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
                                value={line.unit_price}
                                onChange={(e) =>
                                  updateLine(line.id, {
                                    unit_price: Math.max(0, Number(e.target.value) || 0),
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
                        )
                      })}
                    </tbody>
                  </table>
                </div>

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
