import { oemNavGroupLabel, supplierNavGroupLabel } from '@/pages/oem/deskNav'

export type BreadcrumbItem = {
  label: string
  href?: string
}

const SETTINGS_LABELS: Record<string, string> = {
  profile: 'Profile',
  company: 'Company',
  billing: 'Billing',
  notifications: 'Notifications',
  security: 'Security',
}

const OEM_SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  messages: 'Messages',
  agents: 'Supplier agents',
  demand: 'Demand',
  bom: 'Item master',
  forecast: 'Forecast share',
  plants: 'Plants & ship-to',
  'make-buy': 'Make vs buy',
  npi: 'NPI / tooling',
  suppliers: 'Suppliers',
  rfqs: 'RFQ',
  punchout: 'Catalog / punchout',
  aml: 'AML',
  contracts: 'Contracts',
  scorecards: 'Scorecards',
  onboarding: 'Onboarding',
  rfi: 'RFI',
  rfp: 'RFP',
  auctions: 'Auctions',
  requests: 'Requests',
  'in-track': 'In track',
  expedite: 'Expedite',
  approvals: 'Approvals',
  changes: 'Change orders',
  'landed-cost': 'Landed cost',
  budgets: 'Budgets',
  receiving: 'Receiving',
  dock: 'Dock calendar',
  quality: 'Quality',
  warehouse: 'Warehouse',
  lots: 'Lot / serial',
  returns: 'Returns / RTV',
  customs: 'Customs',
  invoices: 'Invoices',
  payments: 'Payments',
  debits: 'Debit memos',
  rebates: 'Rebates',
  compliance: 'Compliance',
  savings: 'Savings tracker',
  'cost-down': 'Cost-down',
  'va-ve': 'VA/VE',
  qbr: 'QBRs',
  esg: 'ESG / conflict',
  audit: 'Audit log',
}

const SUPPLIER_SECTION_LABELS: Record<string, string> = {
  home: 'Home',
  messages: 'Messages',
  agents: 'OEM agents',
  rfqs: 'RFQs to bid',
  catalog: 'Your catalog',
  forecast: 'OEM forecast',
  rfi: 'RFIs',
  rfp: 'RFPs',
  onboarding: 'Onboarding tasks',
  orders: 'Purchase orders',
  shipments: 'Shipments',
  dock: 'Dock appointments',
  production: 'Production',
  capacity: 'Capacity',
  vmi: 'VMI / consignment',
  labels: 'Labels / packing',
  lots: 'Lot genealogy',
  quality: 'Quality docs',
  scars: 'SCARs',
  returns: 'Returns',
  ppap: 'PPAP / FAI',
  invoices: 'Invoices',
  'create-invoice': 'Submit invoice',
  payments: 'Payments',
  claims: 'Claims',
  rebates: 'Rebates',
  score: 'Your scorecard',
  contacts: 'Contacts',
  profile: 'Certifications',
  bank: 'Bank & tax',
  policies: 'Policies / NDA',
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function markCurrent(crumbs: BreadcrumbItem[]): BreadcrumbItem[] {
  if (crumbs.length === 0) return crumbs
  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb
  )
}

/** Builds the navbar trail for the current location, always starting at Dashboard. */
export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const path = pathname.replace(/\/+$/, '') || '/'
  const dashboard: BreadcrumbItem = { label: 'Dashboard', href: '/' }

  if (path === '/') return markCurrent([dashboard])

  if (path === '/files') {
    return markCurrent([dashboard, { label: 'Work' }, { label: 'Files', href: '/files' }])
  }

  if (path === '/research') {
    return markCurrent([dashboard, { label: 'Work' }, { label: 'Research', href: '/research' }])
  }

  if (path === '/research/compare' || path === '/compare') {
    return markCurrent([
      dashboard,
      { label: 'Research', href: '/research' },
      { label: 'Compare', href: '/research/compare' },
    ])
  }

  if (path === '/parts-catalog') {
    return markCurrent([
      dashboard,
      { label: 'Work' },
      { label: 'Parts Catalog', href: '/parts-catalog' },
    ])
  }

  if (path === '/reports') {
    return markCurrent([dashboard, { label: 'Decide' }, { label: 'Reports', href: '/reports' }])
  }

  if (path === '/portfolio') {
    return markCurrent([dashboard, { label: 'Decide' }, { label: 'Portfolio', href: '/portfolio' }])
  }

  if (path === '/wishlist') {
    return markCurrent([dashboard, { label: 'Decide' }, { label: 'Wishlist', href: '/wishlist' }])
  }

  if (path === '/bucket') {
    return markCurrent([dashboard, { label: 'Bucket', href: '/bucket' }])
  }

  if (path === '/purchase-order' || path.startsWith('/purchase-order/')) {
    const crumbs: BreadcrumbItem[] = [
      dashboard,
      { label: 'Decide' },
      { label: 'Purchase Order', href: '/purchase-order' },
    ]
    const poId = path.split('/')[2]
    if (poId) crumbs.push({ label: `PO ${poId}`, href: path })
    return markCurrent(crumbs)
  }

  if (path === '/ai') {
    return markCurrent([dashboard, { label: 'Account' }, { label: 'AI', href: '/ai' }])
  }

  if (path === '/settings' || path.startsWith('/settings/')) {
    const crumbs: BreadcrumbItem[] = [dashboard, { label: 'Settings', href: '/settings' }]
    const section = path.split('/')[2]
    if (section) {
      crumbs.push({
        label: SETTINGS_LABELS[section] ?? titleFromSlug(section),
        href: `/settings/${section}`,
      })
    }
    return markCurrent(crumbs)
  }

  if (path === '/oem' || path.startsWith('/oem/')) {
    const crumbs: BreadcrumbItem[] = [dashboard, { label: 'OEM desk', href: '/oem/overview' }]
    const section = path.split('/')[2]
    if (section && section !== 'portal') {
      const groupLabel = oemNavGroupLabel(section)
      if (groupLabel) crumbs.push({ label: groupLabel })
      crumbs.push({
        label: OEM_SECTION_LABELS[section] ?? titleFromSlug(section),
        href: `/oem/${section}`,
      })
    }
    return markCurrent(crumbs)
  }

  if (path === '/supplier' || path.startsWith('/supplier/')) {
    const crumbs: BreadcrumbItem[] = [dashboard, { label: 'Supplier portal', href: '/supplier/home' }]
    const section = path.split('/')[2]
    if (section) {
      const groupLabel = supplierNavGroupLabel(section)
      if (groupLabel) crumbs.push({ label: groupLabel })
      crumbs.push({
        label: SUPPLIER_SECTION_LABELS[section] ?? titleFromSlug(section),
        href: `/supplier/${section}`,
      })
    }
    return markCurrent(crumbs)
  }

  const fallback = path.split('/').filter(Boolean).map(titleFromSlug).join(' / ')
  return markCurrent([dashboard, { label: fallback || 'Page' }])
}
