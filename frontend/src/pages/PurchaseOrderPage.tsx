import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronUp,
  ChevronsUp,
  Equal,
  ExternalLink,
  FileDown,
  FileText,
  GitBranch,
  Loader2,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
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

type KanbanColumnId = 'todo' | 'in_progress' | 'in_qa' | 'done'

const KANBAN_COLUMNS: { id: KanbanColumnId; title: string; statuses: POStatus[] }[] = [
  { id: 'todo', title: 'Draft & submitted', statuses: ['draft', 'submitted'] },
  { id: 'in_progress', title: 'Approved & ordered', statuses: ['approved', 'sent'] },
  { id: 'in_qa', title: 'Partially received', statuses: ['partial'] },
  { id: 'done', title: 'Closed', statuses: ['closed'] },
]

const PROJECT_SWATCHES = ['bg-emerald-500', 'bg-amber-500', 'bg-sky-600'] as const

function statusToColumnId(status: POStatus): KanbanColumnId {
  for (const col of KANBAN_COLUMNS) {
    if (col.statuses.includes(status)) return col.id
  }
  return 'todo'
}

function columnDefaultStatus(columnId: KanbanColumnId): POStatus {
  const col = KANBAN_COLUMNS.find((entry) => entry.id === columnId)
  return col?.statuses[0] ?? 'draft'
}

function projectSwatchClass(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997
  return PROJECT_SWATCHES[h % PROJECT_SWATCHES.length]!
}

function cardPrimaryTitle(o: PurchaseOrderResponse): string {
  const first = o.lines[0]
  const part = (first?.description ?? '').trim() || (first?.sku ?? '').trim()
  if (part) return part
  const v = o.vendor_name.trim()
  return v ? `${o.number} · ${v}` : o.number
}

function storyPointsDisplay(o: PurchaseOrderResponse): number {
  const n = o.lines.length
  if (n <= 0) return 1
  return Math.min(13, n)
}

function vendorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase()
  return 'PO'
}

function priorityGlyph(status: POStatus) {
  const common = 'h-3.5 w-3.5 shrink-0'
  switch (status) {
    case 'draft':
    case 'submitted':
      return <ChevronsUp className={`${common} text-orange-600`} aria-hidden />
    case 'approved':
    case 'sent':
      return <ChevronUp className={`${common} text-amber-600`} aria-hidden />
    case 'partial':
      return <Equal className={`${common} text-yellow-600`} aria-hidden />
    case 'closed':
      return <CheckCircle2 className={`${common} text-emerald-600`} aria-hidden />
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
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
  const [poEditorOpen, setPoEditorOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<POStatus | 'all'>('all')
  const [loadingList, setLoadingList] = useState(false)
  const [loadListError, setLoadListError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [creating, setCreating] = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [draggingPoId, setDraggingPoId] = useState<number | null>(null)
  const [dropColumnId, setDropColumnId] = useState<KanbanColumnId | null>(null)

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
      .catch((e) => setLoadListError(e instanceof Error ? e.message : 'Failed to load purchase order board'))
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

  useEffect(() => {
    if (!poEditorOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPoEditorOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [poEditorOpen])

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

  const ordersByColumn = useMemo(() => {
    const map = new Map<KanbanColumnId, PurchaseOrderResponse[]>()
    for (const col of KANBAN_COLUMNS) map.set(col.id, [])
    for (const o of filteredList) {
      map.get(statusToColumnId(o.status))!.push(o)
    }
    return map
  }, [filteredList])

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

  const persistPoStatus = useCallback(
    async (poId: number, status: POStatus) => {
      if (!token) return
      setSaveError(null)
      try {
        const updated = await updatePurchaseOrder(token, poId, { status })
        setOrders((prev) => prev.map((o) => (o.id === poId ? updated : o)))
        if (selectedId === poId) setDirty(false)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Could not update status')
      }
    },
    [token, selectedId],
  )

  const handleCardDropToColumn = useCallback(
    (columnId: KanbanColumnId) => {
      if (!token || draggingPoId == null) {
        setDraggingPoId(null)
        setDropColumnId(null)
        return
      }

      const draggedOrder = orders.find((o) => o.id === draggingPoId)
      if (!draggedOrder) {
        setDraggingPoId(null)
        setDropColumnId(null)
        return
      }

      const nextStatus = columnDefaultStatus(columnId)
      if (nextStatus !== draggedOrder.status) void persistPoStatus(draggingPoId, nextStatus)

      setDraggingPoId(null)
      setDropColumnId(null)
    },
    [token, draggingPoId, orders, persistPoStatus],
  )

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
      setPoEditorOpen(true)
      setDirty(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not create new PO')
    } finally {
      setCreating(false)
    }
  }, [token, orders])

  const advanceStatus = useCallback(() => {
    if (!selected || !token) return
    const i = STATUS_ORDER.indexOf(selected.status)
    if (i < 0 || i >= STATUS_ORDER.length - 1) return
    void persistPoStatus(selected.id, STATUS_ORDER[i + 1]!)
  }, [selected, token, persistPoStatus])

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
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Purchase order board</h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
          <button
            type="button"
            onClick={() => void createNewPo()}
            disabled={!token || creating}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            New PO
          </button>
        </div>
      </div>

      {!token && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <Link to="/signin" className="font-medium text-amber-900 underline hover:no-underline">
            Sign in
          </Link>{' '}
          to load and save purchase orders on the board, and to import lines from scraped research data.
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

      <div className="mt-8 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search PO #, vendor, SKU…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={`${inputClass} pl-9`}
                  aria-label="Search purchase order board"
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
          </div>

          <div
            className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin]"
            role="region"
            aria-label="Purchase order board"
          >
            {loadingList &&
              KANBAN_COLUMNS.map((col) => (
                <div
                  key={col.id}
                  className="w-[min(100vw-2rem,280px)] shrink-0 sm:w-[280px]"
                >
                  <div className="mb-2 h-4 w-24 animate-pulse rounded bg-gray-200" />
                  <div className="min-h-[min(60vh,480px)] space-y-2 rounded-xl bg-gray-100/90 p-2">
                    <div className="h-24 animate-pulse rounded-lg bg-gray-200/80" />
                    <div className="h-24 animate-pulse rounded-lg bg-gray-200/80" />
                  </div>
                </div>
              ))}
            {!loadingList &&
              KANBAN_COLUMNS.map((col) => {
                const items = ordersByColumn.get(col.id) ?? []
                return (
                  <div
                    key={col.id}
                    className="w-[min(100vw-2rem,280px)] shrink-0 sm:w-[280px]"
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
                      <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-600">
                        {col.title}
                      </h2>
                      <span className="text-xs font-semibold tabular-nums text-gray-400">
                        ({items.length})
                      </span>
                    </div>
                    <div
                      className={`max-h-[min(65vh,560px)] min-h-[120px] space-y-2.5 overflow-y-auto rounded-xl bg-[#f4f5f7] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors ${
                        dropColumnId === col.id ? 'ring-2 ring-blue-300/80 bg-blue-50/60' : ''
                      }`}
                      onDragOver={(e) => {
                        if (!token || draggingPoId == null) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        if (dropColumnId !== col.id) setDropColumnId(col.id)
                      }}
                      onDragLeave={() => {
                        if (dropColumnId === col.id) setDropColumnId(null)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        handleCardDropToColumn(col.id)
                      }}
                    >
                      {items.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-gray-400">No cards</p>
                      ) : (
                        items.map((o) => {
                          const active = o.id === selectedId
                          return (
                            <div key={o.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(o.id)
                                  setPoEditorOpen(true)
                                }}
                                draggable={Boolean(token)}
                                onDragStart={() => {
                                  if (!token) return
                                  setDraggingPoId(o.id)
                                  setSelectedId(o.id)
                                }}
                                onDragEnd={() => {
                                  setDraggingPoId(null)
                                  setDropColumnId(null)
                                }}
                                className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition-[box-shadow,transform] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                                  active ? 'border-blue-300 ring-2 ring-blue-400/30' : 'border-gray-200/90'
                                } ${token ? 'cursor-grab active:cursor-grabbing' : ''}`}
                              >
                                <p className="line-clamp-3 text-sm font-medium leading-snug text-gray-900">
                                  {cardPrimaryTitle(o)}
                                </p>
                                <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                                  {o.vendor_name.trim() || '—'} · {formatMoney(poSubtotal(o))}
                                </p>
                                <div className="mt-3 flex items-center justify-between gap-1 border-t border-gray-100 pt-2.5">
                                  <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                    <span
                                      className={`h-2.5 w-2.5 shrink-0 rounded-sm ${projectSwatchClass(o.vendor_name || o.number)}`}
                                      aria-hidden
                                    />
                                    <span className="truncate font-mono text-[11px] font-semibold text-gray-600">
                                      {o.number}
                                    </span>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1 text-gray-500">
                                    <span className="inline-flex items-center gap-0.5" title="Line items">
                                      <GitBranch className="h-3.5 w-3.5 opacity-70" aria-hidden />
                                      <span className="text-[11px] tabular-nums">{o.lines.length}</span>
                                    </span>
                                    <span
                                      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-100 px-1 text-[10px] font-semibold text-gray-700"
                                      title="Size (lines)"
                                    >
                                      {storyPointsDisplay(o)}
                                    </span>
                                    <span title={STATUS_LABEL[o.status]}>{priorityGlyph(o.status)}</span>
                                    <span
                                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-slate-100 to-slate-200 text-[9px] font-bold uppercase text-slate-700 ring-1 ring-slate-200/80"
                                      title="Vendor"
                                    >
                                      {vendorInitials(o.vendor_name)}
                                    </span>
                                  </div>
                                </div>
                              </button>
                              {token ? (
                                <label className="mt-1.5 block px-0.5">
                                  <span className="sr-only">Status for {o.number}</span>
                                  <select
                                    value={o.status}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      void persistPoStatus(o.id, e.target.value as POStatus)
                                    }}
                                    className="w-full cursor-pointer rounded-md border border-gray-200 bg-white py-1 pl-2 pr-1 text-[11px] text-gray-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                                  >
                                    {STATUS_ORDER.map((s) => (
                                      <option key={s} value={s}>
                                        {STATUS_LABEL[s]}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
          {!loadingList && filteredList.length === 0 ? (
            <p className="text-center text-sm text-gray-500">No matching POs for this search or filter.</p>
          ) : null}
      </div>

      {poEditorOpen && selected && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPoEditorOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="po-editor-title"
            className="my-auto w-full max-w-5xl rounded-xl border border-gray-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-white px-4 py-3 sm:px-5">
              <FileText className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
              <h2 id="po-editor-title" className="min-w-0 flex-1 truncate text-lg font-semibold text-gray-900">
                {selected.number}
              </h2>
              <span className={statusBadgeClass(selected.status)}>{STATUS_LABEL[selected.status]}</span>
              {token ? (
                <button
                  type="button"
                  onClick={() => void createSummaryReport()}
                  disabled={reportBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/25"
                >
                  {reportBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" aria-hidden />
                  )}
                  PDF
                </button>
              ) : null}
              {token ? (
                <button
                  type="button"
                  onClick={() => void saveSelected()}
                  disabled={!dirty || saving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin text-white" aria-hidden /> : null}
                  Save
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setPoEditorOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300/50"
                aria-label="Close editor"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="max-h-[min(85vh,880px)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  {token ? (
                    <div className="min-w-[200px] flex-1">
                      <label htmlFor="po-status-select" className="text-xs font-medium text-gray-600">
                        Board status
                      </label>
                      <select
                        id="po-status-select"
                        value={selected.status}
                        onChange={(e) => {
                          void persistPoStatus(selected.id, e.target.value as POStatus)
                        }}
                        className={`${inputClass} mt-1`}
                      >
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={advanceStatus}
                    disabled={selected.status === 'closed' || !token}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    Advance status
                  </button>
                </div>
                <div className="mt-3">
                  {dirty && token && (
                    <span className="text-xs text-amber-700">Unsaved line/header edits — use Save changes.</span>
                  )}
                  {!dirty && token && <span className="text-xs text-gray-500">Header & lines in sync with server.</span>}
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
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">PO details</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
