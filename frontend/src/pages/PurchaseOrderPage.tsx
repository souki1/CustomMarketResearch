import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PurchaseOrderListView } from '@/components/purchase-order/PurchaseOrderListView'
import {
  emptyLine,
  nextPoNumber,
  newPoLineId,
  todayIso,
} from '@/components/purchase-order/poShared'
import type { ScannedOffer } from '@/components/purchase-order/ScanQuotationModal'
import {
  createPurchaseOrder,
  listPortfolioItems,
  listPurchaseOrders,
  type PortfolioItem,
  type PurchaseOrderResponse,
} from '@/lib/api'
import { getCurrentUserEmail, useAuthToken } from '@/lib/auth'
import { PURCHASE_ORDER_PATH } from '@/lib/paths'

export function PurchaseOrderPage() {
  const navigate = useNavigate()
  const token = useAuthToken()
  const requesterEmail = getCurrentUserEmail() ?? 'requester@company.com'

  const [orders, setOrders] = useState<PurchaseOrderResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [scanOffers, setScanOffers] = useState<PortfolioItem[]>([])
  const [scanLoading, setScanLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setOrders([])
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    void listPurchaseOrders(token)
      .then(setOrders)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load purchase orders'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!token) {
      setScanOffers([])
      return
    }
    let cancelled = false
    setScanLoading(true)
    void listPortfolioItems(token)
      .then((items) => {
        if (!cancelled) setScanOffers(items)
      })
      .catch(() => {
        if (!cancelled) setScanOffers([])
      })
      .finally(() => {
        if (!cancelled) setScanLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const createAndOpen = useCallback(
    async (payload: Parameters<typeof createPurchaseOrder>[1]) => {
      if (!token) return
      setCreating(true)
      setSaveError(null)
      try {
        const created = await createPurchaseOrder(token, payload)
        setOrders((prev) => [created, ...prev])
        navigate(`${PURCHASE_ORDER_PATH}/${created.id}`)
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Could not create purchase order')
      } finally {
        setCreating(false)
      }
    },
    [token, navigate],
  )

  const onCreateBlank = useCallback(() => {
    void createAndOpen({
      number: nextPoNumber(orders),
      vendor_name: '',
      vendor_email: '',
      issue_date: todayIso(),
      required_by: '',
      status: 'draft',
      ship_to: 'Regional Office',
      payment_terms: 'Postpayment',
      notes: '',
      lines: [emptyLine()],
      source_selection_id: null,
    })
  }, [createAndOpen, orders])

  const onScanCreate = useCallback(
    (offers: ScannedOffer[], vendorName: string) => {
      const lines = offers.map((offer) => ({
        id: newPoLineId(),
        sku: offer.sku,
        description: offer.description,
        vendor_url: offer.vendor_url,
        qty: offer.qty,
        uom: offer.uom,
        unit_price: offer.unit_price,
      }))
      void createAndOpen({
        number: nextPoNumber(orders),
        vendor_name: vendorName,
        vendor_email: '',
        issue_date: todayIso(),
        required_by: '',
        status: 'draft',
        ship_to: 'Regional Office',
        payment_terms: 'Postpayment',
        notes: '',
        lines: lines.length > 0 ? lines : [emptyLine()],
        source_selection_id: null,
      })
    },
    [createAndOpen, orders],
  )

  return (
    <PurchaseOrderListView
      token={token}
      orders={orders}
      loading={loading}
      loadError={loadError}
      saveError={saveError}
      creating={creating}
      onCreateBlank={onCreateBlank}
      onScanCreate={onScanCreate}
      scanOffers={scanOffers}
      scanLoading={scanLoading}
      requesterEmail={requesterEmail}
    />
  )
}
