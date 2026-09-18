import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { PurchaseOrderDocumentView } from '@/components/purchase-order/PurchaseOrderDocumentView'
import { buildPoReportBlocks, type POStatus } from '@/components/purchase-order/poShared'
import {
  createReport,
  exportReportPdf,
  getPurchaseOrder,
  listPurchaseOrders,
  updatePurchaseOrder,
  type PurchaseOrderResponse,
} from '@/lib/api'
import { getCurrentUserEmail, getCurrentUserName, useAuthToken } from '@/lib/auth'
import { PURCHASE_ORDER_PATH } from '@/lib/paths'

export function PurchaseOrderDetailPage() {
  const { poId } = useParams()
  const navigate = useNavigate()
  const token = useAuthToken()
  const id = Number(poId)
  const requesterName = getCurrentUserName() ?? 'Requester'
  const requesterEmail = getCurrentUserEmail() ?? 'requester@company.com'

  const [order, setOrder] = useState<PurchaseOrderResponse | null>(null)
  const [neighborIds, setNeighborIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [reportBusy, setReportBusy] = useState(false)

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setLoadError('This purchase order does not exist.')
      setLoading(false)
      return
    }
    if (!token) {
      setLoading(false)
      setLoadError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void Promise.all([getPurchaseOrder(token, id), listPurchaseOrders(token)])
      .then(([doc, list]) => {
        if (cancelled) return
        setOrder(doc)
        setNeighborIds(list.map((row) => row.id))
        setDirty(false)
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load purchase order')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, id])

  const persist = useCallback(
    async (next: PurchaseOrderResponse) => {
      if (!token) return
      setSaving(true)
      setSaveError(null)
      try {
        const updated = await updatePurchaseOrder(token, next.id, {
          number: next.number,
          vendor_name: next.vendor_name,
          vendor_email: next.vendor_email,
          issue_date: next.issue_date,
          required_by: next.required_by,
          status: next.status,
          ship_to: next.ship_to,
          payment_terms: next.payment_terms,
          notes: next.notes,
          lines: next.lines,
          source_selection_id: next.source_selection_id ?? null,
        })
        setOrder(updated)
        setDirty(false)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSaving(false)
      }
    },
    [token],
  )

  const onChange = useCallback((next: PurchaseOrderResponse) => {
    setOrder(next)
    setDirty(true)
    setSaveError(null)
  }, [])

  const onStatus = useCallback(
    (status: POStatus, extra?: { notes?: string }) => {
      if (!order) return
      const next = { ...order, status, notes: extra?.notes ?? order.notes }
      setOrder(next)
      void persist(next)
    },
    [order, persist],
  )

  const onExportPdf = useCallback(async () => {
    if (!token || !order) return
    setReportBusy(true)
    setSaveError(null)
    try {
      const created = await createReport(token, {
        title: `Purchase order ${order.number}`,
        blocks: buildPoReportBlocks(order),
      })
      const blob = await exportReportPdf(token, created.id)
      const filename = `PO_${order.number.replace(/[^\w.-]+/g, '_')}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not export PDF')
    } finally {
      setReportBusy(false)
    }
  }, [token, order])

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <MissingState
        title="Purchase order not found"
        body="The link is missing a valid order id."
      />
    )
  }

  if (!token) {
    return (
      <div className="min-h-full bg-[#F3F5FA] px-6 py-16 text-center">
        <p className="text-[15px] text-[#3D4468]">
          <Link to="/signin" className="font-medium text-[#5B5CE6] underline">
            Sign in
          </Link>{' '}
          to open this purchase order.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#F3F5FA] text-[#8A91A8]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="sr-only">Loading purchase order</span>
      </div>
    )
  }

  if (loadError || !order) {
    return (
      <MissingState
        title="Could not open this purchase order"
        body={loadError ?? 'The order may have been deleted.'}
        onBack={() => navigate(PURCHASE_ORDER_PATH)}
      />
    )
  }

  return (
    <PurchaseOrderDocumentView
      token={token}
      order={order}
      neighborIds={neighborIds}
      requesterName={requesterName}
      requesterEmail={requesterEmail}
      saving={saving}
      dirty={dirty}
      saveError={saveError}
      reportBusy={reportBusy}
      onChange={onChange}
      onSave={() => void persist(order)}
      onStatus={onStatus}
      onExportPdf={() => void onExportPdf()}
    />
  )
}

function MissingState({
  title,
  body,
  onBack,
}: {
  title: string
  body: string
  onBack?: () => void
}) {
  return (
    <div className="min-h-full bg-[#F3F5FA] px-6 py-16 text-center">
      <h1 className="text-[18px] font-semibold text-[#1B2559]">{title}</h1>
      <p className="mt-2 text-[13px] text-[#6B728C]">{body}</p>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mt-4 inline-flex h-9 items-center rounded-full bg-[#25245A] px-4 text-[13px] font-medium text-white"
        >
          Back to purchase orders
        </button>
      ) : null}
    </div>
  )
}
