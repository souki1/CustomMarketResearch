export type OemInteractiveId =
  | 'overview'
  | 'bom'
  | 'demand'
  | 'suppliers'
  | 'scorecards'
  | 'rfqs'
  | 'approvals'
  | 'contracts'
  | 'changes'
  | 'in-track'
  | 'receiving'
  | 'quality'
  | 'invoices'
  | 'payments'
  | 'compliance'
  | 'cost-down'

export type OemCatalogId =
  | 'forecast'
  | 'plants'
  | 'make-buy'
  | 'npi'
  | 'onboarding'
  | 'rfi'
  | 'rfp'
  | 'auctions'
  | 'punchout'
  | 'aml'
  | 'expedite'
  | 'budgets'
  | 'landed-cost'
  | 'returns'
  | 'lots'
  | 'warehouse'
  | 'customs'
  | 'dock'
  | 'debits'
  | 'rebates'
  | 'va-ve'
  | 'qbr'
  | 'esg'
  | 'savings'
  | 'messages'
  | 'audit'

export type OemSectionId = OemInteractiveId | OemCatalogId

export type SupplierInteractiveId =
  | 'home'
  | 'rfqs'
  | 'orders'
  | 'production'
  | 'shipments'
  | 'invoices'
  | 'quality'
  | 'payments'
  | 'profile'

export type SupplierCatalogId =
  | 'onboarding'
  | 'rfi'
  | 'rfp'
  | 'catalog'
  | 'forecast'
  | 'capacity'
  | 'vmi'
  | 'dock'
  | 'labels'
  | 'lots'
  | 'ppap'
  | 'scars'
  | 'returns'
  | 'create-invoice'
  | 'claims'
  | 'rebates'
  | 'bank'
  | 'policies'
  | 'contacts'
  | 'messages'
  | 'score'

export type SupplierSectionId = SupplierInteractiveId | SupplierCatalogId

export type BidStatus = 'draft' | 'submitted' | 'awarded' | 'lost'
export type RfqStatus = 'open' | 'awarded' | 'closed'
export type AckStatus = 'pending' | 'accepted' | 'declined'
export type TrackStage = 'quoted' | 'ordered' | 'in_production' | 'in_transit' | 'received'
export type InvoiceMatch = 'matched' | 'qty_mismatch' | 'price_mismatch' | 'unmatched'
export type NcrStatus = 'open' | 'scar' | 'closed'

export type BomLine = {
  id: string
  partNumber: string
  description: string
  revision: string
  uom: string
  qtyPer: number
  aml: string
  origin: 'oem' | 'aftermarket' | 'equivalent'
  min: number
  max: number
}

export type SupplierRow = {
  id: string
  name: string
  category: string
  authorized: boolean
  region: string
  onTime: number
  quality: number
  risk: 'low' | 'medium' | 'high'
}

export type BidRow = {
  id: string
  supplierId: string
  supplierName: string
  unitPrice: number
  leadDays: number
  moq: number
  status: BidStatus
}

export type RfqRow = {
  id: string
  number: string
  partNumber: string
  description: string
  qty: number
  needBy: string
  status: RfqStatus
  awardedSupplierId: string | null
  bids: BidRow[]
}

export type ContractRow = {
  id: string
  supplierName: string
  partNumber: string
  unitPrice: number
  validUntil: string
  terms: string
  status: 'active' | 'expiring' | 'expired'
}

export type TrackRow = {
  id: string
  partNumber: string
  supplierName: string
  quoted: number
  ordered: number
  inProduction: number
  inTransit: number
  received: number
  needBy: string
  stage: TrackStage
}

export type ReceiptRow = {
  id: string
  poNumber: string
  partNumber: string
  expected: number
  received: number
  damage: number
}

export type QualityRow = {
  id: string
  partNumber: string
  supplierName: string
  issue: string
  lot: string
  status: NcrStatus
}

export type InvoiceRow = {
  id: string
  number: string
  poNumber: string
  supplierName: string
  amount: number
  match: InvoiceMatch
  status: 'draft' | 'submitted' | 'approved' | 'paid'
}

export type CostDownRow = {
  id: string
  partNumber: string
  shouldCost: number
  lastQuote: number
  target: number
  idea: string
}

export type PortalPoRow = {
  id: string
  number: string
  partNumber: string
  qty: number
  needBy: string
  ack: AckStatus
}

export type DemandRow = {
  id: string
  partNumber: string
  need: number
  onHand: number
  onOrder: number
  shortage: number
  needBy: string
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type ApprovalRow = {
  id: string
  kind: 'rfq' | 'po' | 'invoice'
  number: string
  requester: string
  amount: number
  status: ApprovalStatus
}

export type ChangeOrderRow = {
  id: string
  poNumber: string
  partNumber: string
  fromQty: number
  toQty: number
  reason: string
  status: 'draft' | 'sent' | 'accepted'
}

export type PaymentRow = {
  id: string
  invoiceNumber: string
  supplierName: string
  amount: number
  due: string
  status: 'hold' | 'scheduled' | 'paid'
}

export type ComplianceRow = {
  id: string
  supplierName: string
  item: string
  expires: string
  status: 'valid' | 'expiring' | 'expired'
}

export type AsnRow = {
  id: string
  poNumber: string
  partNumber: string
  qty: number
  carrier: string
  tracking: string
  status: 'packed' | 'shipped' | 'delivered'
}

export type ProductionRow = {
  id: string
  poNumber: string
  partNumber: string
  qty: number
  pct: number
  eta: string
}

export type CertRow = {
  id: string
  name: string
  number: string
  expires: string
  status: 'valid' | 'expiring'
}

export type QualityDocRow = {
  id: string
  poNumber: string
  kind: 'COA' | 'FAI' | 'PPAP'
  uploaded: boolean
}
