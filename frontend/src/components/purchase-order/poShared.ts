import type { PurchaseOrderLinePayload, PurchaseOrderResponse, PurchaseOrderStatus } from '@/lib/api'
import type { TableCell } from '@/lib/savedReports'

export type POStatus = PurchaseOrderStatus

export const STATUS_ORDER: POStatus[] = ['draft', 'submitted', 'approved', 'sent', 'partial', 'closed']

export const STATUS_LABEL: Record<POStatus, string> = {
  draft: 'Draft',
  submitted: 'Pending',
  approved: 'Approved',
  sent: 'Sent',
  partial: 'Not billed',
  closed: 'Paid',
}

export type StatusFilter = POStatus | 'all' | 'in_revision'

export function newPoLineId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

export function formatMoneyUsd(n: number): { amount: string; currency: string } {
  return { amount: formatMoney(n), currency: 'USD' }
}

export function formatDisplayDate(iso: string): string {
  const s = iso.trim()
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[3]}.${m[2]}.${m[1]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${d.getFullYear()}`
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function lineTotal(line: PurchaseOrderLinePayload): number {
  return line.qty * line.unit_price
}

export function poSubtotal(po: PurchaseOrderResponse): number {
  return po.lines.reduce((sum, line) => sum + lineTotal(line), 0)
}

export function nextPoNumber(existing: PurchaseOrderResponse[]): string {
  const n = existing.length + 1
  return `PO-${new Date().getFullYear()}-${String(1000 + n).slice(-4)}`
}

export function locationLabel(shipTo: string): string {
  const first = shipTo.split(/\n|,/)[0]?.trim() ?? ''
  if (first && first.length <= 60) return first
  return 'Regional Office'
}

export function departmentLabel(notes: string): string {
  const match = /dept(?:artment)?:\s*(.+)/i.exec(notes)
  const value = match?.[1]?.trim()
  return value || 'Operations'
}

export function isAiSourced(po: PurchaseOrderResponse): boolean {
  if (po.source_selection_id != null) return true
  return po.lines.some((line) => Boolean((line.vendor_url ?? '').trim()))
}

export function isInRevision(po: PurchaseOrderResponse): boolean {
  return po.status === 'draft' && /revision/i.test(po.notes)
}

export function parsePriceToNumber(price: string | null | undefined): number {
  if (price == null || price === '') return 0
  const cleaned = String(price).replace(/[^0-9.-]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Safe http(s) href for user-entered line URLs (blocks javascript: etc.). */
export function vendorUrlForLink(raw: string | undefined): string | null {
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

export function emptyLine(): PurchaseOrderLinePayload {
  return {
    id: newPoLineId(),
    sku: '',
    description: '',
    vendor_url: '',
    qty: 1,
    uom: 'ea',
    unit_price: 0,
  }
}

export function plannedBudget(total: number): number {
  if (total <= 0) return 10000
  return Math.max(10000, Math.ceil(total / 1000) * 1000 + 5000)
}

function newReportBlockId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function buildPoReportBlocks(po: PurchaseOrderResponse): Array<Record<string, unknown>> {
  const header: TableCell[] = ['SKU', 'Description', 'Vendor link', 'Qty', 'UOM', 'Unit price', 'Line total']
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
    { id: newReportBlockId(), type: 'heading', text: 'Line items', align: 'left' },
    {
      id: newReportBlockId(),
      type: 'table',
      showHeader: true,
      rows: [header, ...dataRows],
      align: 'left',
      colWidths: [0.88, 1.65, 1.02, 0.42, 0.38, 0.72, 0.78],
    },
  ]
}

export const PO_INPUT =
  'w-full rounded-lg border border-[#E4E7F2] bg-white px-2.5 py-1.5 text-[13px] text-[#1B2559] placeholder:text-[#9AA3B5] focus:border-[#5B5CE6] focus:outline-none focus:ring-2 focus:ring-[#5B5CE6]/15'
