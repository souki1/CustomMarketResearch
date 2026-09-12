import type {
  ApprovalRow,
  AsnRow,
  BomLine,
  CertRow,
  ChangeOrderRow,
  ComplianceRow,
  ContractRow,
  CostDownRow,
  DemandRow,
  InvoiceRow,
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

export const BOM_LINES: BomLine[] = [
  {
    id: 'b1',
    partNumber: 'TC403-14670',
    description: 'SEAL, OIL',
    revision: 'C',
    uom: 'EA',
    qtyPer: 2,
    aml: 'Kubota',
    origin: 'oem',
    min: 20,
    max: 80,
  },
  {
    id: 'b2',
    partNumber: '1G539-33012',
    description: 'FILTER, OIL',
    revision: 'B',
    uom: 'EA',
    qtyPer: 1,
    aml: 'Kubota · Fleetguard',
    origin: 'equivalent',
    min: 12,
    max: 40,
  },
  {
    id: 'b3',
    partNumber: 'HH164-32430',
    description: 'HOSE, HYDRAULIC',
    revision: 'A',
    uom: 'EA',
    qtyPer: 1,
    aml: 'Kubota',
    origin: 'oem',
    min: 4,
    max: 16,
  },
  {
    id: 'b4',
    partNumber: 'TA040-14720',
    description: 'GASKET, HEAD',
    revision: 'D',
    uom: 'EA',
    qtyPer: 1,
    aml: 'Fel-Pro aftermarket',
    origin: 'aftermarket',
    min: 6,
    max: 18,
  },
]

export const SUPPLIERS: SupplierRow[] = [
  {
    id: 's1',
    name: 'Messicks',
    category: 'OEM parts',
    authorized: true,
    region: 'US-PA',
    onTime: 96,
    quality: 99,
    risk: 'low',
  },
  {
    id: 's2',
    name: 'Coleman Equipment',
    category: 'OEM parts',
    authorized: true,
    region: 'US-MO',
    onTime: 91,
    quality: 97,
    risk: 'low',
  },
  {
    id: 's3',
    name: 'All States Ag Parts',
    category: 'Aftermarket',
    authorized: false,
    region: 'US-IA',
    onTime: 88,
    quality: 92,
    risk: 'medium',
  },
  {
    id: 's4',
    name: 'H&R Agri-Power',
    category: 'Dealer',
    authorized: true,
    region: 'US-KY',
    onTime: 84,
    quality: 95,
    risk: 'medium',
  },
]

export const RFQS: RfqRow[] = [
  {
    id: 'r1',
    number: 'RFQ-2026-0911',
    partNumber: 'TC403-14670',
    description: 'SEAL, OIL',
    qty: 40,
    needBy: '2026-09-28',
    status: 'open',
    awardedSupplierId: null,
    bids: [
      {
        id: 'bid1',
        supplierId: 's1',
        supplierName: 'Messicks',
        unitPrice: 18.4,
        leadDays: 2,
        moq: 10,
        status: 'submitted',
      },
      {
        id: 'bid2',
        supplierId: 's2',
        supplierName: 'Coleman Equipment',
        unitPrice: 17.1,
        leadDays: 5,
        moq: 20,
        status: 'submitted',
      },
      {
        id: 'bid3',
        supplierId: 's3',
        supplierName: 'All States Ag Parts',
        unitPrice: 12.9,
        leadDays: 8,
        moq: 25,
        status: 'submitted',
      },
    ],
  },
  {
    id: 'r2',
    number: 'RFQ-2026-0902',
    partNumber: '1G539-33012',
    description: 'FILTER, OIL',
    qty: 24,
    needBy: '2026-09-18',
    status: 'awarded',
    awardedSupplierId: 's1',
    bids: [
      {
        id: 'bid4',
        supplierId: 's1',
        supplierName: 'Messicks',
        unitPrice: 11.2,
        leadDays: 1,
        moq: 6,
        status: 'awarded',
      },
      {
        id: 'bid5',
        supplierId: 's4',
        supplierName: 'H&R Agri-Power',
        unitPrice: 11.8,
        leadDays: 3,
        moq: 6,
        status: 'lost',
      },
    ],
  },
]

export const CONTRACTS: ContractRow[] = [
  {
    id: 'c1',
    supplierName: 'Messicks',
    partNumber: '1G539-33012',
    unitPrice: 11.2,
    validUntil: '2026-12-31',
    terms: 'Net 30 · FCA',
    status: 'active',
  },
  {
    id: 'c2',
    supplierName: 'Coleman Equipment',
    partNumber: 'HH164-32430',
    unitPrice: 64.0,
    validUntil: '2026-10-15',
    terms: 'Net 45 · DAP',
    status: 'expiring',
  },
]

export const TRACK_ROWS: TrackRow[] = [
  {
    id: 't1',
    partNumber: 'TC403-14670',
    supplierName: '—',
    quoted: 40,
    ordered: 0,
    inProduction: 0,
    inTransit: 0,
    received: 0,
    needBy: '2026-09-28',
    stage: 'quoted',
  },
  {
    id: 't2',
    partNumber: '1G539-33012',
    supplierName: 'Messicks',
    quoted: 24,
    ordered: 24,
    inProduction: 0,
    inTransit: 18,
    received: 6,
    needBy: '2026-09-18',
    stage: 'in_transit',
  },
  {
    id: 't3',
    partNumber: 'HH164-32430',
    supplierName: 'Coleman Equipment',
    quoted: 8,
    ordered: 8,
    inProduction: 8,
    inTransit: 0,
    received: 0,
    needBy: '2026-10-02',
    stage: 'in_production',
  },
]

export const RECEIPTS: ReceiptRow[] = [
  {
    id: 'rc1',
    poNumber: 'PO-10412',
    partNumber: '1G539-33012',
    expected: 24,
    received: 6,
    damage: 0,
  },
  {
    id: 'rc2',
    poNumber: 'PO-10388',
    partNumber: 'TA040-14720',
    expected: 10,
    received: 10,
    damage: 1,
  },
]

export const QUALITY: QualityRow[] = [
  {
    id: 'q1',
    partNumber: 'TA040-14720',
    supplierName: 'All States Ag Parts',
    issue: 'Gasket thickness out of spec on 1 of 10',
    lot: 'LOT-8841',
    status: 'open',
  },
]

export const INVOICES: InvoiceRow[] = [
  {
    id: 'i1',
    number: 'INV-55102',
    poNumber: 'PO-10412',
    supplierName: 'Messicks',
    amount: 268.8,
    match: 'qty_mismatch',
    status: 'submitted',
  },
  {
    id: 'i2',
    number: 'INV-54881',
    poNumber: 'PO-10388',
    supplierName: 'All States Ag Parts',
    amount: 142.0,
    match: 'matched',
    status: 'approved',
  },
]

export const COST_DOWN: CostDownRow[] = [
  {
    id: 'cd1',
    partNumber: 'TC403-14670',
    shouldCost: 14.5,
    lastQuote: 18.4,
    target: 15.8,
    idea: 'Dual-source OEM + approved equivalent',
  },
  {
    id: 'cd2',
    partNumber: 'HH164-32430',
    shouldCost: 52.0,
    lastQuote: 64.0,
    target: 56.0,
    idea: 'Annual blanket + longer cut length',
  },
]

export const PORTAL_POS: PortalPoRow[] = [
  {
    id: 'pp1',
    number: 'PO-10412',
    partNumber: '1G539-33012',
    qty: 24,
    needBy: '2026-09-18',
    ack: 'accepted',
  },
  {
    id: 'pp2',
    number: 'PO-10440',
    partNumber: 'TC403-14670',
    qty: 40,
    needBy: '2026-09-28',
    ack: 'pending',
  },
]

export const DEMAND: DemandRow[] = [
  {
    id: 'd1',
    partNumber: 'TC403-14670',
    need: 40,
    onHand: 8,
    onOrder: 0,
    shortage: 32,
    needBy: '2026-09-28',
  },
  {
    id: 'd2',
    partNumber: '1G539-33012',
    need: 24,
    onHand: 6,
    onOrder: 18,
    shortage: 0,
    needBy: '2026-09-18',
  },
  {
    id: 'd3',
    partNumber: 'HH164-32430',
    need: 8,
    onHand: 1,
    onOrder: 8,
    shortage: 0,
    needBy: '2026-10-02',
  },
]

export const APPROVALS: ApprovalRow[] = [
  {
    id: 'a1',
    kind: 'rfq',
    number: 'RFQ-2026-0911',
    requester: 'Buyer desk',
    amount: 684.0,
    status: 'pending',
  },
  {
    id: 'a2',
    kind: 'po',
    number: 'PO-10412',
    requester: 'Plant 2',
    amount: 268.8,
    status: 'approved',
  },
  {
    id: 'a3',
    kind: 'invoice',
    number: 'INV-55102',
    requester: 'AP',
    amount: 268.8,
    status: 'pending',
  },
]

export const CHANGE_ORDERS: ChangeOrderRow[] = [
  {
    id: 'co1',
    poNumber: 'PO-10412',
    partNumber: '1G539-33012',
    fromQty: 24,
    toQty: 30,
    reason: 'Line rate up this week',
    status: 'sent',
  },
]

export const PAYMENTS: PaymentRow[] = [
  {
    id: 'pay1',
    invoiceNumber: 'INV-54881',
    supplierName: 'All States Ag Parts',
    amount: 142.0,
    due: '2026-09-20',
    status: 'scheduled',
  },
  {
    id: 'pay2',
    invoiceNumber: 'INV-55102',
    supplierName: 'Messicks',
    amount: 268.8,
    due: '2026-09-25',
    status: 'hold',
  },
]

export const COMPLIANCE: ComplianceRow[] = [
  {
    id: 'cm1',
    supplierName: 'Messicks',
    item: 'ISO 9001',
    expires: '2027-03-12',
    status: 'valid',
  },
  {
    id: 'cm2',
    supplierName: 'Coleman Equipment',
    item: 'Insurance COI',
    expires: '2026-10-01',
    status: 'expiring',
  },
  {
    id: 'cm3',
    supplierName: 'All States Ag Parts',
    item: 'RoHS declaration',
    expires: '2026-08-01',
    status: 'expired',
  },
]

export const ASNS: AsnRow[] = [
  {
    id: 'asn1',
    poNumber: 'PO-10412',
    partNumber: '1G539-33012',
    qty: 18,
    carrier: 'UPS Freight',
    tracking: '1Z999AA10123456784',
    status: 'shipped',
  },
]

export const PRODUCTION: ProductionRow[] = [
  {
    id: 'pr1',
    poNumber: 'PO-10440',
    partNumber: 'TC403-14670',
    qty: 40,
    pct: 0,
    eta: '2026-09-24',
  },
]

export const CERTS: CertRow[] = [
  { id: 'ct1', name: 'ISO 9001', number: 'QMS-4412', expires: '2027-03-12', status: 'valid' },
  { id: 'ct2', name: 'Dealer authorization', number: 'KUB-PA-19', expires: '2026-11-30', status: 'expiring' },
]

export const QUALITY_DOCS: QualityDocRow[] = [
  { id: 'qd1', poNumber: 'PO-10412', kind: 'COA', uploaded: true },
  { id: 'qd2', poNumber: 'PO-10440', kind: 'FAI', uploaded: false },
]
