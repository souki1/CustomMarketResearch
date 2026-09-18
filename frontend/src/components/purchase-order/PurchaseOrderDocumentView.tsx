import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { PurchaseOrderLinePayload, PurchaseOrderResponse } from '@/lib/api'
import { PURCHASE_ORDER_PATH } from '@/lib/paths'
import { ChipStatus, StatusBadge } from './StatusBadge'
import {
  PO_INPUT,
  departmentLabel,
  emptyLine,
  formatDisplayDate,
  formatMoney,
  isAiSourced,
  isInRevision,
  lineTotal,
  locationLabel,
  plannedBudget,
  poSubtotal,
  type POStatus,
} from './poShared'

type PurchaseOrderDocumentViewProps = {
  token: string | null
  order: PurchaseOrderResponse
  neighborIds: number[]
  requesterName: string
  requesterEmail: string
  saving: boolean
  dirty: boolean
  saveError: string | null
  reportBusy: boolean
  onChange: (next: PurchaseOrderResponse) => void
  onSave: () => void
  onStatus: (status: POStatus, extra?: { notes?: string }) => void
  onExportPdf: () => void
}

export function PurchaseOrderDocumentView({
  token,
  order,
  neighborIds,
  requesterName,
  requesterEmail,
  saving,
  dirty,
  saveError,
  reportBusy,
  onChange,
  onSave,
  onStatus,
  onExportPdf,
}: PurchaseOrderDocumentViewProps) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(order.status === 'draft')
  const [noteDraft, setNoteDraft] = useState('')
  const [addingNote, setAddingNote] = useState(false)

  useEffect(() => {
    setEditing(order.status === 'draft')
  }, [order.id, order.status])

  const total = poSubtotal(order)
  const planned = plannedBudget(total)
  const remaining = Math.max(0, planned - total)
  const usedPct = Math.min(100, planned > 0 ? (total / planned) * 100 : 0)
  const idx = neighborIds.indexOf(order.id)
  const prevId = idx > 0 ? neighborIds[idx - 1] : null
  const nextId = idx >= 0 && idx < neighborIds.length - 1 ? neighborIds[idx + 1] : null
  const canApprove = order.status === 'submitted'
  const canConfirm = order.status === 'draft'
  const received = order.status === 'partial' || order.status === 'closed'
  const billed = order.status === 'closed'

  const update = useCallback(
    (patch: Partial<PurchaseOrderResponse>) => {
      onChange({ ...order, ...patch })
    },
    [onChange, order],
  )

  const updateLine = useCallback(
    (lineId: string, patch: Partial<PurchaseOrderLinePayload>) => {
      onChange({
        ...order,
        lines: order.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
      })
    },
    [onChange, order],
  )

  const addLine = () => onChange({ ...order, lines: [...order.lines, emptyLine()] })
  const copyLine = (line: PurchaseOrderLinePayload) => {
    onChange({ ...order, lines: [...order.lines, { ...line, id: emptyLine().id }] })
  }
  const removeLine = (lineId: string) => {
    if (order.lines.length <= 1) return
    onChange({ ...order, lines: order.lines.filter((l) => l.id !== lineId) })
  }

  const addNote = () => {
    const text = noteDraft.trim()
    if (!text) return
    const next = order.notes.trim() ? `${order.notes.trim()}\n${text}` : text
    update({ notes: next })
    setNoteDraft('')
    setAddingNote(false)
  }

  const confirm = () => {
    onStatus('submitted')
  }

  const sendForRevision = () => {
    const notes = /revision/i.test(order.notes) ? order.notes : `${order.notes}\nSent for revision`.trim()
    onStatus('draft', { notes })
  }

  return (
    <div className="min-h-full bg-[#F3F5FA]">
      <header className="sticky top-0 z-20 border-b border-[#E8EBF3] bg-white">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(PURCHASE_ORDER_PATH)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6B728C] hover:bg-[#F3F5FA]"
              aria-label="Close document"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <div className="mx-1 h-5 w-px bg-[#E8EBF3]" />
            <button
              type="button"
              disabled={prevId == null}
              onClick={() => prevId != null && navigate(`${PURCHASE_ORDER_PATH}/${prevId}`)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6B728C] hover:bg-[#F3F5FA] disabled:opacity-30"
              aria-label="Previous purchase order"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={nextId == null}
              onClick={() => nextId != null && navigate(`${PURCHASE_ORDER_PATH}/${nextId}`)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6B728C] hover:bg-[#F3F5FA] disabled:opacity-30"
              aria-label="Next purchase order"
            >
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[18px] font-semibold tracking-[-0.02em] text-[#1B2559]">
                Purchase Order #{order.id}
              </h1>
              {order.status === 'draft' || order.status === 'submitted' ? (
                <StatusBadge status={order.status} inRevision={isInRevision(order)} />
              ) : (
                <ChipStatus status={order.status} received={received} billed={billed} />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canConfirm && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="inline-flex h-9 items-center rounded-full border border-[#25245A] bg-white px-4 text-[13px] font-medium text-[#25245A] hover:bg-[#F3F5FA]"
                >
                  {editing ? 'Done editing' : 'Edit Document'}
                </button>
                {token && dirty && (
                  <button
                    type="button"
                    onClick={onSave}
                    disabled={saving}
                    className="inline-flex h-9 items-center rounded-full border border-[#D7DBE8] bg-white px-4 text-[13px] font-medium text-[#3D4468] hover:bg-[#F3F5FA] disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Save'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={!token}
                  className="inline-flex h-9 items-center rounded-full bg-[#25245A] px-4 text-[13px] font-medium text-white hover:bg-[#1C1B45] disabled:opacity-50"
                >
                  Confirm
                </button>
              </>
            )}
            {canApprove && (
              <>
                <button
                  type="button"
                  onClick={sendForRevision}
                  disabled={!token}
                  className="inline-flex h-9 items-center rounded-full border border-[#25245A] bg-white px-4 text-[13px] font-medium text-[#25245A] hover:bg-[#F3F5FA] disabled:opacity-50"
                >
                  Send for revision
                </button>
                <button
                  type="button"
                  onClick={sendForRevision}
                  disabled={!token}
                  className="inline-flex h-9 items-center rounded-full border border-[#E8EBF3] bg-white px-4 text-[13px] font-medium text-[#C24141] hover:bg-red-50 disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => onStatus('approved')}
                  disabled={!token}
                  className="inline-flex h-9 items-center rounded-full bg-[#22A45A] px-4 text-[13px] font-medium text-white hover:bg-[#1B8F4C] disabled:opacity-50"
                >
                  Approve
                </button>
              </>
            )}
            {(order.status === 'approved' || order.status === 'sent' || order.status === 'partial' || order.status === 'closed') && (
              <>
                <button
                  type="button"
                  onClick={onExportPdf}
                  disabled={!token || reportBusy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#25245A] bg-white px-4 text-[13px] font-medium text-[#25245A] hover:bg-[#F3F5FA] disabled:opacity-50"
                >
                  {reportBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Export PDF
                </button>
                {(order.status === 'approved' || order.status === 'sent') && (
                  <button
                    type="button"
                    onClick={() => onStatus(order.status === 'approved' ? 'sent' : 'partial')}
                    disabled={!token}
                    className="inline-flex h-9 items-center rounded-full border border-[#25245A] bg-white px-4 text-[13px] font-medium text-[#25245A] hover:bg-[#F3F5FA] disabled:opacity-50"
                  >
                    Add Receipt
                  </button>
                )}
                {(order.status === 'approved' || order.status === 'sent' || order.status === 'partial') && (
                  <button
                    type="button"
                    onClick={() => onStatus('closed')}
                    disabled={!token}
                    className="inline-flex h-9 items-center rounded-full bg-[#25245A] px-4 text-[13px] font-medium text-white hover:bg-[#1C1B45] disabled:opacity-50"
                  >
                    Add Invoice
                  </button>
                )}
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6B728C] hover:bg-[#F3F5FA]"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>Edit fields</DropdownMenuItem>
                <DropdownMenuItem onSelect={onExportPdf} disabled={!token}>
                  Export PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate(PURCHASE_ORDER_PATH)}>Back to list</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {saveError && (
        <p className="px-6 pt-3 text-[13px] text-red-600" role="alert">
          {saveError}
        </p>
      )}

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_280px] sm:px-6">
        <section className="rounded-2xl border border-[#E8EBF3] bg-white p-5 sm:p-6">
          <div className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
            <MetaField
              label="Requester"
              editing={editing}
              value={requesterName}
              readonly
              extra={
                <a className="mt-0.5 block text-[12px] text-[#5B5CE6]" href={`mailto:${encodeURIComponent(requesterEmail)}`}>
                  {requesterEmail}
                </a>
              }
            />
            <MetaField
              label="Supplier"
              editing={editing}
              value={order.vendor_name}
              onChange={(v) => update({ vendor_name: v })}
              extra={
                editing ? (
                  <input
                    type="email"
                    className={`${PO_INPUT} mt-1`}
                    value={order.vendor_email}
                    onChange={(e) => update({ vendor_email: e.target.value })}
                    placeholder="supplier@vendor.com"
                    aria-label="Supplier email"
                  />
                ) : order.vendor_email.trim() ? (
                  <p className="mt-0.5 text-[12px] text-[#5B5CE6]">{order.vendor_email}</p>
                ) : null
              }
            />
            <MetaField label="Legal Entity" value="Intelligent Research" readonly extra={
              <p className="mt-0.5 text-[12px] leading-5 text-[#8A91A8]">Workspace company on this account</p>
            } />
            <MetaField
              label="Location"
              editing={editing}
              value={order.ship_to}
              onChange={(v) => update({ ship_to: v })}
              multiline
              displayValue={locationLabel(order.ship_to)}
              extra={!editing && order.ship_to.trim() && order.ship_to.trim() !== locationLabel(order.ship_to) ? (
                <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-5 text-[#8A91A8]">{order.ship_to}</p>
              ) : null}
            />
            <MetaField
              label="Creation Date"
              editing={editing}
              value={order.issue_date}
              onChange={(v) => update({ issue_date: v })}
              type="date"
              displayValue={formatDisplayDate(order.issue_date)}
            />
            <MetaField
              label="Delivery Date"
              editing={editing}
              value={order.required_by}
              onChange={(v) => update({ required_by: v })}
              type="date"
              displayValue={formatDisplayDate(order.required_by)}
            />
            <MetaField label="Departments" value={departmentLabel(order.notes)} readonly />
            <MetaField
              label="Payment Terms"
              editing={editing}
              value={order.payment_terms}
              onChange={(v) => update({ payment_terms: v })}
              displayValue={order.payment_terms.trim() || 'Postpayment'}
            />
          </div>

          <div className="mt-6">
            {addingNote || editing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  rows={2}
                  className={PO_INPUT}
                  value={addingNote ? noteDraft : order.notes}
                  onChange={(e) => (addingNote ? setNoteDraft(e.target.value) : update({ notes: e.target.value }))}
                  placeholder="Add a note…"
                />
                {addingNote ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={addNote} className="text-[12px] font-medium text-[#5B5CE6]">
                      Save note
                    </button>
                    <button type="button" onClick={() => setAddingNote(false)} className="text-[12px] text-[#8A91A8]">
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {order.notes.trim() ? (
                  <p className="mb-2 whitespace-pre-wrap text-[13px] text-[#3D4468]">{order.notes}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => setAddingNote(true)}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[#5B5CE6] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Add Note...
                </button>
              </>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#E8EBF3] bg-white p-4">
            <div className="flex items-start justify-between">
              <p className="text-[13px] text-[#8A91A8]">Total</p>
              <p className="text-[18px] font-semibold tabular-nums text-[#1B2559]">
                {formatMoney(total)} <span className="text-[12px] font-medium text-[#8A91A8]">USD</span>
              </p>
            </div>
            <div className={`mt-4 rounded-xl p-3 ${order.status === 'submitted' ? 'border border-[#C7C4F2] bg-[#F7F6FF]' : 'bg-[#F8F9FD]'}`}>
              <div className="flex items-center gap-2 text-[13px] font-medium text-[#1B2559]">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#EEF0FF] text-[#5B5CE6]">
                  <FileText className="h-3.5 w-3.5" aria-hidden />
                </span>
                Operations Maintenance
              </div>
              <p className="mt-1 text-[11px] text-[#8A91A8]">The budget will be consumed</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E8EBF3]">
                <div className="flex h-full" style={{ width: `${Math.max(usedPct, 4)}%` }}>
                  <div className="h-full flex-[7] bg-[#34C759]" />
                  <div className="h-full flex-[3] bg-[#F97316]" />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-[#8A91A8]">
                <span>{formatMoney(remaining)} USD remaining</span>
                <span>{formatMoney(planned)} USD planned</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E8EBF3] bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-[#1B2559]">Attachments</p>
              <button type="button" className="text-[#5B5CE6]" aria-label="Add attachment">
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {isAiSourced(order) ? (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-[#EEF0F5] px-3 py-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FEE2E2] text-[11px] font-bold text-[#DC2626]">
                  PDF
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-[#1B2559]">QUOTATION.pdf</p>
                  <p className="text-[11px] text-[#8A91A8]">
                    Scanned quote · {formatDisplayDate(order.issue_date)} · {requesterName}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-[#8A91A8]">No attachments yet.</p>
            )}
          </div>

          {(order.status === 'sent' || order.status === 'partial' || order.status === 'closed') && (
            <div className="rounded-2xl border border-[#C7C4F2] bg-white p-4">
              <p className="text-[13px] font-medium text-[#1B2559]">Integration logs</p>
              <div className="mt-3 space-y-2 text-[12px] text-[#4B5168]">
                <p>
                  <span className="text-[#8A91A8]">{formatDisplayDate(order.updated_at)} · </span>
                  Document is created in the ledger.
                </p>
                {order.status === 'closed' && (
                  <p>
                    <span className="text-[#8A91A8]">{formatDisplayDate(order.updated_at)} · </span>
                    Payment is recorded against this order.
                  </p>
                )}
              </div>
            </div>
          )}
        </aside>

        {(order.status === 'submitted' || order.status === 'approved' || order.status === 'sent' || order.status === 'partial' || order.status === 'closed') && (
          <section
            className={`rounded-2xl border bg-white p-4 sm:col-span-2 ${
              order.status === 'submitted' ? 'border-[#C7C4F2]' : 'border-[#E8EBF3]'
            }`}
          >
            <p className="text-[13px] font-medium text-[#1B2559]">Approval Flow</p>
            <ApprovalFlow status={order.status} requesterName={requesterName} updatedAt={order.updated_at} />
          </section>
        )}

        <section className="overflow-hidden rounded-2xl border border-[#E8EBF3] bg-white sm:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead className="bg-[#F3F5FA] text-[12px] font-medium text-[#8A91A8]">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">SKU / Item Name</th>
                  <th className="px-4 py-3 text-right">Quantity / Unit</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line, i) => (
                  <tr key={line.id} className="border-t border-[#F0F2F7]">
                    <td className="px-4 py-3 tabular-nums text-[#8A91A8]">{i + 1}</td>
                    <td className="px-4 py-3">
                      {editing ? (
                        <div className="grid gap-1.5">
                          <input
                            className={PO_INPUT}
                            value={line.description}
                            onChange={(e) => updateLine(line.id, { description: e.target.value })}
                            placeholder="Item name"
                            aria-label={`Line ${i + 1} description`}
                          />
                          <input
                            className={PO_INPUT}
                            value={line.sku}
                            onChange={(e) => updateLine(line.id, { sku: e.target.value })}
                            placeholder="SKU"
                            aria-label={`Line ${i + 1} SKU`}
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium text-[#1B2559]">{line.description.trim() || line.sku || 'Untitled item'}</p>
                          {line.sku.trim() ? <p className="text-[12px] text-[#8A91A8]">{line.sku}</p> : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <div className="ml-auto grid w-28 gap-1.5">
                          <input
                            type="number"
                            min={0}
                            className={`${PO_INPUT} text-right`}
                            value={line.qty}
                            onChange={(e) => updateLine(line.id, { qty: Math.max(0, Number(e.target.value) || 0) })}
                            aria-label={`Line ${i + 1} quantity`}
                          />
                          <input
                            className={`${PO_INPUT} text-right`}
                            value={line.uom}
                            onChange={(e) => updateLine(line.id, { uom: e.target.value })}
                            aria-label={`Line ${i + 1} unit`}
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="tabular-nums text-[#1B2559]">{line.qty}</p>
                          <p className="text-[11px] text-[#8A91A8]">{line.uom.trim() || 'Not set'}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing ? (
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className={`${PO_INPUT} ml-auto w-28 text-right`}
                          value={line.unit_price}
                          onChange={(e) => updateLine(line.id, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                          aria-label={`Line ${i + 1} price`}
                        />
                      ) : (
                        <span className="tabular-nums text-[#1B2559]">{formatMoney(line.unit_price)} USD</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-[#1B2559]">
                      {formatMoney(lineTotal(line))} USD
                    </td>
                    <td className="px-4 py-3 text-[#3D4468]">{order.vendor_name.trim() || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(true)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8A91A8] hover:bg-[#F3F5FA] hover:text-[#25245A]"
                          aria-label={`Edit line ${i + 1}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyLine(line)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8A91A8] hover:bg-[#F3F5FA] hover:text-[#25245A]"
                          aria-label={`Duplicate line ${i + 1}`}
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={order.lines.length <= 1}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#E11D48] hover:bg-red-50 disabled:opacity-30"
                          aria-label={`Remove line ${i + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[#E8EBF3] bg-[#FCFCFE]">
                  <td className="px-4 py-3 text-[13px] text-[#8A91A8]" colSpan={2}>
                    Total of {order.lines.length} Item{order.lines.length === 1 ? '' : 's'}
                    {editing ? (
                      <button
                        type="button"
                        onClick={addLine}
                        className="ml-3 inline-flex items-center gap-1 text-[#5B5CE6]"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden />
                        Add line
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#1B2559]">
                    {order.lines.reduce((s, l) => s + l.qty, 0)}
                  </td>
                  <td />
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#1B2559]">
                    {formatMoney(total)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </div>

      {!token && (
        <p className="px-6 pb-6 text-[13px] text-[#8A91A8]">
          <Link to="/signin" className="font-medium text-[#5B5CE6] underline">
            Sign in
          </Link>{' '}
          to confirm, approve, or save this order.
        </p>
      )}
    </div>
  )
}

function MetaField({
  label,
  value,
  displayValue,
  onChange,
  editing,
  readonly,
  type = 'text',
  multiline,
  extra,
}: {
  label: string
  value: string
  displayValue?: string
  onChange?: (value: string) => void
  editing?: boolean
  readonly?: boolean
  type?: 'text' | 'date'
  multiline?: boolean
  extra?: ReactNode
}) {
  const showInput = Boolean(editing) && !readonly
  return (
    <div>
      <p className="text-[12px] text-[#8A91A8]">{label}</p>
      {showInput && multiline ? (
        <textarea rows={2} className={`${PO_INPUT} mt-1`} value={value} onChange={(e) => onChange?.(e.target.value)} />
      ) : showInput ? (
        <input type={type} className={`${PO_INPUT} mt-1`} value={value} onChange={(e) => onChange?.(e.target.value)} />
      ) : (
        <p className="mt-0.5 text-[14px] font-medium text-[#1B2559]">{displayValue ?? (value.trim() || '—')}</p>
      )}
      {extra}
    </div>
  )
}

function ApprovalFlow({
  status,
  requesterName,
  updatedAt,
}: {
  status: POStatus
  requesterName: string
  updatedAt: string
}) {
  const steps = useMemo(
    () => [
      { id: 'ops', label: 'Operations Manager', person: requesterName || 'Requester' },
      { id: 'head', label: 'Head of Operations', person: 'Finance approver' },
      { id: 'cfo', label: 'Finance Controller', person: 'Controller' },
    ],
    [requesterName],
  )

  const current =
    status === 'submitted' ? 0 : status === 'approved' || status === 'sent' ? 1 : status === 'partial' || status === 'closed' ? 2 : 0

  return (
    <div className="mt-4 flex flex-wrap items-start gap-0">
      {steps.map((step, i) => {
        const done = i < current || status === 'closed' || (status !== 'submitted' && i === 0)
        const active = status === 'submitted' && i === 0
        return (
          <div key={step.id} className="flex min-w-[160px] flex-1 items-start">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    done ? 'bg-[#22A45A] text-white' : active ? 'bg-[#F97316] text-white' : 'bg-[#E8EBF3] text-[#8A91A8]'
                  }`}
                >
                  {done ? <Check className="h-3 w-3" aria-hidden /> : <span className="h-2 w-2 rounded-full bg-current" />}
                </span>
                {i < steps.length - 1 && (
                  <span className={`h-px w-16 sm:w-24 ${done ? 'bg-[#22A45A]' : 'bg-[#E8EBF3]'}`} />
                )}
              </div>
              <p className="mt-2 text-[11px] text-[#8A91A8]">
                {active ? `Due ${formatDisplayDate(updatedAt)}` : done ? formatDisplayDate(updatedAt) : ''}
              </p>
              <p className="text-[13px] font-medium text-[#1B2559]">{step.label}</p>
              <p className={`text-[12px] ${done ? 'text-[#178C4A]' : 'text-[#8A91A8]'}`}>{step.person}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
