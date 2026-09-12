import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  APPROVALS,
  ASNS,
  BOM_LINES,
  CERTS,
  CHANGE_ORDERS,
  COMPLIANCE,
  CONTRACTS,
  COST_DOWN,
  DEMAND,
  INVOICES,
  PAYMENTS,
  PORTAL_POS,
  PRODUCTION,
  QUALITY,
  QUALITY_DOCS,
  RECEIPTS,
  RFQS,
  SUPPLIERS,
  TRACK_ROWS,
} from './oemSeed'
import type {
  AckStatus,
  ApprovalRow,
  ApprovalStatus,
  AsnRow,
  BidRow,
  BomLine,
  CertRow,
  ChangeOrderRow,
  ComplianceRow,
  ContractRow,
  CostDownRow,
  DemandRow,
  InvoiceRow,
  NcrStatus,
  PaymentRow,
  PortalPoRow,
  ProductionRow,
  QualityDocRow,
  QualityRow,
  ReceiptRow,
  RfqRow,
  SupplierRow,
  TrackRow,
} from './oemTypes'

type OemDeskContextValue = {
  bom: BomLine[]
  suppliers: SupplierRow[]
  rfqs: RfqRow[]
  contracts: ContractRow[]
  track: TrackRow[]
  receipts: ReceiptRow[]
  quality: QualityRow[]
  invoices: InvoiceRow[]
  costDown: CostDownRow[]
  portalPos: PortalPoRow[]
  demand: DemandRow[]
  approvals: ApprovalRow[]
  changeOrders: ChangeOrderRow[]
  payments: PaymentRow[]
  compliance: ComplianceRow[]
  asns: AsnRow[]
  production: ProductionRow[]
  certs: CertRow[]
  qualityDocs: QualityDocRow[]
  awardBid: (rfqId: string, bidId: string) => void
  submitSupplierBid: (rfqId: string, unitPrice: number, leadDays: number) => void
  ackPo: (poId: string, ack: AckStatus) => void
  receiveLine: (receiptId: string, qty: number) => void
  setNcrStatus: (id: string, status: NcrStatus) => void
  decideApproval: (id: string, status: ApprovalStatus) => void
  shipAsn: (id: string) => void
  bumpProduction: (id: string) => void
  markPaid: (id: string) => void
  toggleQualityDoc: (id: string) => void
}

const OemDeskContext = createContext<OemDeskContextValue | null>(null)

const DEMO_SUPPLIER_ID = 's1'
const DEMO_SUPPLIER_NAME = 'Messicks'

export function OemDeskProvider({ children }: { children: ReactNode }) {
  const [rfqs, setRfqs] = useState<RfqRow[]>(RFQS)
  const [track, setTrack] = useState<TrackRow[]>(TRACK_ROWS)
  const [receipts, setReceipts] = useState<ReceiptRow[]>(RECEIPTS)
  const [quality, setQuality] = useState<QualityRow[]>(QUALITY)
  const [portalPos, setPortalPos] = useState<PortalPoRow[]>(PORTAL_POS)
  const [approvals, setApprovals] = useState<ApprovalRow[]>(APPROVALS)
  const [asns, setAsns] = useState<AsnRow[]>(ASNS)
  const [production, setProduction] = useState<ProductionRow[]>(PRODUCTION)
  const [payments, setPayments] = useState<PaymentRow[]>(PAYMENTS)
  const [qualityDocs, setQualityDocs] = useState<QualityDocRow[]>(QUALITY_DOCS)

  const awardBid = (rfqId: string, bidId: string) => {
    setRfqs((prev) => {
      const rfq = prev.find((r) => r.id === rfqId)
      const winner = rfq?.bids.find((b) => b.id === bidId)
      if (!rfq || !winner || rfq.status !== 'open') return prev

      setTrack((rows) =>
        rows.map((row) =>
          row.partNumber === rfq.partNumber
            ? {
                ...row,
                supplierName: winner.supplierName,
                ordered: rfq.qty,
                quoted: Math.max(row.quoted, rfq.qty),
                stage: 'ordered',
              }
            : row
        )
      )
      setPortalPos((pos) => {
        if (pos.some((p) => p.partNumber === rfq.partNumber && p.ack === 'pending')) return pos
        return [
          ...pos,
          {
            id: `pp-${rfq.id}`,
            number: `PO-${rfq.number.slice(-5)}`,
            partNumber: rfq.partNumber,
            qty: rfq.qty,
            needBy: rfq.needBy,
            ack: 'pending',
          },
        ]
      })

      return prev.map((item) => {
        if (item.id !== rfqId) return item
        const bids: BidRow[] = item.bids.map((b) => ({
          ...b,
          status: b.id === bidId ? 'awarded' : 'lost',
        }))
        return {
          ...item,
          status: 'awarded',
          awardedSupplierId: winner.supplierId,
          bids,
        }
      })
    })
  }

  const submitSupplierBid = (rfqId: string, unitPrice: number, leadDays: number) => {
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) return
    if (!Number.isFinite(leadDays) || leadDays < 0) return
    setRfqs((prev) =>
      prev.map((rfq) => {
        if (rfq.id !== rfqId || rfq.status !== 'open') return rfq
        const existing = rfq.bids.find((b) => b.supplierId === DEMO_SUPPLIER_ID)
        const nextBid: BidRow = {
          id: existing?.id ?? `bid-${rfqId}-self`,
          supplierId: DEMO_SUPPLIER_ID,
          supplierName: DEMO_SUPPLIER_NAME,
          unitPrice,
          leadDays: Math.round(leadDays),
          moq: existing?.moq ?? 10,
          status: 'submitted',
        }
        const bids = existing
          ? rfq.bids.map((b) => (b.supplierId === DEMO_SUPPLIER_ID ? nextBid : b))
          : [...rfq.bids, nextBid]
        return { ...rfq, bids }
      })
    )
  }

  const ackPo = (poId: string, ack: AckStatus) => {
    setPortalPos((prev) => {
      const po = prev.find((p) => p.id === poId)
      if (po && ack === 'accepted') {
        setTrack((rows) =>
          rows.map((row) =>
            row.partNumber === po.partNumber
              ? {
                  ...row,
                  supplierName: row.supplierName === '—' ? DEMO_SUPPLIER_NAME : row.supplierName,
                  ordered: po.qty,
                  inProduction: po.qty,
                  stage: 'in_production',
                }
              : row
          )
        )
      }
      return prev.map((item) => (item.id === poId ? { ...item, ack } : item))
    })
  }

  const receiveLine = (receiptId: string, qty: number) => {
    if (!Number.isFinite(qty) || qty <= 0) return
    const add = Math.round(qty)
    setReceipts((prev) => {
      const line = prev.find((r) => r.id === receiptId)
      if (!line || line.received >= line.expected) return prev
      const nextReceived = Math.min(line.expected, line.received + add)
      setTrack((rows) =>
        rows.map((row) =>
          row.partNumber === line.partNumber
            ? {
                ...row,
                received: nextReceived,
                stage: nextReceived >= (row.ordered || line.expected) ? 'received' : 'in_transit',
              }
            : row
        )
      )
      return prev.map((r) => (r.id === receiptId ? { ...r, received: nextReceived } : r))
    })
  }

  const setNcrStatus = (id: string, status: NcrStatus) => {
    setQuality((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)))
  }

  const decideApproval = (id: string, status: ApprovalStatus) => {
    setApprovals((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)))
  }

  const shipAsn = (id: string) => {
    setAsns((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        const status = row.status === 'packed' ? 'shipped' : 'delivered'
        return { ...row, status }
      })
    )
  }

  const bumpProduction = (id: string) => {
    setProduction((prev) =>
      prev.map((row) =>
        row.id === id ? { ...row, pct: Math.min(100, row.pct + 25) } : row
      )
    )
  }

  const markPaid = (id: string) => {
    setPayments((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: 'paid' } : row))
    )
  }

  const toggleQualityDoc = (id: string) => {
    setQualityDocs((prev) =>
      prev.map((row) => (row.id === id ? { ...row, uploaded: !row.uploaded } : row))
    )
  }

  const value = useMemo(
    () => ({
      bom: BOM_LINES,
      suppliers: SUPPLIERS,
      rfqs,
      contracts: CONTRACTS,
      track,
      receipts,
      quality,
      invoices: INVOICES,
      costDown: COST_DOWN,
      portalPos,
      demand: DEMAND,
      approvals,
      changeOrders: CHANGE_ORDERS,
      payments,
      compliance: COMPLIANCE,
      asns,
      production,
      certs: CERTS,
      qualityDocs,
      awardBid,
      submitSupplierBid,
      ackPo,
      receiveLine,
      setNcrStatus,
      decideApproval,
      shipAsn,
      bumpProduction,
      markPaid,
      toggleQualityDoc,
    }),
    [rfqs, track, receipts, quality, portalPos, approvals, asns, production, payments, qualityDocs]
  )

  return <OemDeskContext.Provider value={value}>{children}</OemDeskContext.Provider>
}

export function useOemDesk(): OemDeskContextValue {
  const ctx = useContext(OemDeskContext)
  if (!ctx) throw new Error('useOemDesk must be used inside OemDeskProvider')
  return ctx
}
