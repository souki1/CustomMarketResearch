import type { OemSectionId, SupplierSectionId } from './oemTypes'

export type NavGroup<T extends string> = {
  id: string
  label: string
  items: { id: T; label: string }[]
}

export const OEM_NAV: NavGroup<OemSectionId>[] = [
  {
    id: 'plan',
    label: 'Plan',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'bom', label: 'Item master' },
      { id: 'demand', label: 'Demand' },
      { id: 'forecast', label: 'Forecast share' },
      { id: 'plants', label: 'Plants & ship-to' },
      { id: 'make-buy', label: 'Make vs buy' },
      { id: 'npi', label: 'NPI / tooling' },
    ],
  },
  {
    id: 'source',
    label: 'Source',
    items: [
      { id: 'suppliers', label: 'Suppliers' },
      { id: 'onboarding', label: 'Onboarding' },
      { id: 'scorecards', label: 'Scorecards' },
      { id: 'aml', label: 'AML' },
      { id: 'rfi', label: 'RFI' },
      { id: 'rfqs', label: 'RFQ' },
      { id: 'rfp', label: 'RFP' },
      { id: 'auctions', label: 'Auctions' },
      { id: 'punchout', label: 'Catalog / punchout' },
      { id: 'contracts', label: 'Contracts' },
    ],
  },
  {
    id: 'buy',
    label: 'Buy',
    items: [
      { id: 'approvals', label: 'Approvals' },
      { id: 'changes', label: 'Change orders' },
      { id: 'expedite', label: 'Expedite' },
      { id: 'in-track', label: 'In track' },
      { id: 'budgets', label: 'Budgets' },
      { id: 'landed-cost', label: 'Landed cost' },
    ],
  },
  {
    id: 'fulfill',
    label: 'Fulfill',
    items: [
      { id: 'receiving', label: 'Receiving' },
      { id: 'dock', label: 'Dock calendar' },
      { id: 'warehouse', label: 'Warehouse' },
      { id: 'lots', label: 'Lot / serial' },
      { id: 'quality', label: 'Quality' },
      { id: 'returns', label: 'Returns / RTV' },
      { id: 'customs', label: 'Customs' },
    ],
  },
  {
    id: 'pay',
    label: 'Pay',
    items: [
      { id: 'invoices', label: 'Invoices' },
      { id: 'debits', label: 'Debit memos' },
      { id: 'payments', label: 'Payments' },
      { id: 'rebates', label: 'Rebates' },
      { id: 'compliance', label: 'Compliance' },
    ],
  },
  {
    id: 'improve',
    label: 'Improve',
    items: [
      { id: 'cost-down', label: 'Cost-down' },
      { id: 'va-ve', label: 'VA/VE' },
      { id: 'savings', label: 'Savings tracker' },
      { id: 'qbr', label: 'QBRs' },
      { id: 'esg', label: 'ESG / conflict' },
      { id: 'messages', label: 'Messages' },
      { id: 'audit', label: 'Audit log' },
    ],
  },
]

export const SUPPLIER_NAV: NavGroup<SupplierSectionId>[] = [
  {
    id: 'work',
    label: 'Win work',
    items: [
      { id: 'home', label: 'Home' },
      { id: 'onboarding', label: 'Onboarding tasks' },
      { id: 'rfi', label: 'RFIs' },
      { id: 'rfqs', label: 'RFQs to bid' },
      { id: 'rfp', label: 'RFPs' },
      { id: 'catalog', label: 'Your catalog' },
      { id: 'forecast', label: 'OEM forecast' },
    ],
  },
  {
    id: 'deliver',
    label: 'Deliver',
    items: [
      { id: 'orders', label: 'Purchase orders' },
      { id: 'production', label: 'Production' },
      { id: 'capacity', label: 'Capacity' },
      { id: 'vmi', label: 'VMI / consignment' },
      { id: 'shipments', label: 'Shipments' },
      { id: 'dock', label: 'Dock appointments' },
      { id: 'labels', label: 'Labels / packing' },
      { id: 'lots', label: 'Lot genealogy' },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    items: [
      { id: 'quality', label: 'Quality docs' },
      { id: 'ppap', label: 'PPAP / FAI' },
      { id: 'scars', label: 'SCARs' },
      { id: 'returns', label: 'Returns' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { id: 'invoices', label: 'Invoices' },
      { id: 'create-invoice', label: 'Submit invoice' },
      { id: 'payments', label: 'Payments' },
      { id: 'claims', label: 'Claims' },
      { id: 'rebates', label: 'Rebates' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'profile', label: 'Certifications' },
      { id: 'score', label: 'Your scorecard' },
      { id: 'bank', label: 'Bank & tax' },
      { id: 'contacts', label: 'Contacts' },
      { id: 'policies', label: 'Policies / NDA' },
      { id: 'messages', label: 'Messages' },
    ],
  },
]

const OEM_IDS: OemSectionId[] = OEM_NAV.flatMap((g) => g.items.map((i) => i.id))
const SUPPLIER_IDS: SupplierSectionId[] = SUPPLIER_NAV.flatMap((g) => g.items.map((i) => i.id))

export function isOemSection(raw: string | undefined): raw is OemSectionId {
  return OEM_IDS.some((id) => id === raw)
}

export function isSupplierSection(raw: string | undefined): raw is SupplierSectionId {
  return SUPPLIER_IDS.some((id) => id === raw)
}
