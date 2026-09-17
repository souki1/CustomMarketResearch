import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownCircle,
  BadgeAlert,
  BadgeCheck,
  Bot,
  Building2,
  Calculator,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Contact,
  CreditCard,
  Factory,
  FileMinus,
  FileQuestion,
  FileSearch,
  FileSignature,
  FileText,
  Files,
  Gavel,
  Gauge,
  GitPullRequest,
  Hash,
  History,
  Home,
  Inbox,
  Landmark,
  Layers,
  LayoutDashboard,
  Leaf,
  Lightbulb,
  LineChart,
  ListTree,
  MapPinned,
  Package,
  PackageCheck,
  Percent,
  PiggyBank,
  Presentation,
  Receipt,
  Scale,
  ScrollText,
  Send,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Stamp,
  Tags,
  Truck,
  TrendingUp,
  Undo2,
  UserPlus,
  Wallet,
  Warehouse,
  Wrench,
  Zap,
} from 'lucide-react'
import type { OemSectionId, SupplierSectionId } from './oemTypes'

export type NavItem<T extends string> = {
  id: T
  label: string
  icon: LucideIcon
}

export type NavGroup<T extends string> = {
  id: string
  label: string
  items: NavItem<T>[]
}

/** Daily desk first, then the source → buy → receive → pay cycle. */
export const OEM_NAV: NavGroup<OemSectionId>[] = [
  {
    id: 'plan',
    label: 'Plan',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'messages', label: 'Messages', icon: Inbox },
      { id: 'agents', label: 'Supplier agents', icon: Bot },
      { id: 'demand', label: 'Demand', icon: TrendingUp },
      { id: 'bom', label: 'Item master', icon: ListTree },
      { id: 'forecast', label: 'Forecast share', icon: LineChart },
      { id: 'plants', label: 'Plants & ship-to', icon: Factory },
      { id: 'make-buy', label: 'Make vs buy', icon: Scale },
      { id: 'npi', label: 'NPI / tooling', icon: Wrench },
    ],
  },
  {
    id: 'source',
    label: 'Source',
    items: [
      { id: 'suppliers', label: 'Suppliers', icon: Building2 },
      { id: 'rfqs', label: 'RFQ', icon: FileSearch },
      { id: 'punchout', label: 'Catalog / punchout', icon: ShoppingCart },
      { id: 'aml', label: 'AML', icon: BadgeCheck },
      { id: 'contracts', label: 'Contracts', icon: FileSignature },
      { id: 'scorecards', label: 'Scorecards', icon: Gauge },
      { id: 'onboarding', label: 'Onboarding', icon: UserPlus },
      { id: 'rfi', label: 'RFI', icon: FileQuestion },
      { id: 'rfp', label: 'RFP', icon: Files },
      { id: 'auctions', label: 'Auctions', icon: Gavel },
    ],
  },
  {
    id: 'buy',
    label: 'Buy',
    items: [
      { id: 'requests', label: 'Requests', icon: ClipboardList },
      { id: 'in-track', label: 'In track', icon: MapPinned },
      { id: 'expedite', label: 'Expedite', icon: Zap },
      { id: 'approvals', label: 'Approvals', icon: ClipboardCheck },
      { id: 'changes', label: 'Change orders', icon: GitPullRequest },
      { id: 'landed-cost', label: 'Landed cost', icon: Calculator },
      { id: 'budgets', label: 'Budgets', icon: Wallet },
    ],
  },
  {
    id: 'fulfill',
    label: 'Fulfill',
    items: [
      { id: 'receiving', label: 'Receiving', icon: PackageCheck },
      { id: 'dock', label: 'Dock calendar', icon: CalendarClock },
      { id: 'quality', label: 'Quality', icon: ShieldCheck },
      { id: 'warehouse', label: 'Warehouse', icon: Warehouse },
      { id: 'lots', label: 'Lot / serial', icon: Hash },
      { id: 'returns', label: 'Returns / RTV', icon: Undo2 },
      { id: 'customs', label: 'Customs', icon: Landmark },
    ],
  },
  {
    id: 'pay',
    label: 'Pay',
    items: [
      { id: 'invoices', label: 'Invoices', icon: Receipt },
      { id: 'payments', label: 'Payments', icon: CreditCard },
      { id: 'debits', label: 'Debit memos', icon: FileMinus },
      { id: 'rebates', label: 'Rebates', icon: Percent },
      { id: 'compliance', label: 'Compliance', icon: Stamp },
    ],
  },
  {
    id: 'improve',
    label: 'Improve',
    items: [
      { id: 'savings', label: 'Savings tracker', icon: CircleDollarSign },
      { id: 'cost-down', label: 'Cost-down', icon: ArrowDownCircle },
      { id: 'va-ve', label: 'VA/VE', icon: Lightbulb },
      { id: 'qbr', label: 'QBRs', icon: Presentation },
      { id: 'esg', label: 'ESG / conflict', icon: Leaf },
      { id: 'audit', label: 'Audit log', icon: History },
    ],
  },
]

export const SUPPLIER_NAV: NavGroup<SupplierSectionId>[] = [
  {
    id: 'work',
    label: 'Win work',
    items: [
      { id: 'home', label: 'Home', icon: Home },
      { id: 'messages', label: 'Messages', icon: Inbox },
      { id: 'agents', label: 'OEM agents', icon: Bot },
      { id: 'rfqs', label: 'RFQs to bid', icon: FileSearch },
      { id: 'catalog', label: 'Your catalog', icon: Tags },
      { id: 'forecast', label: 'OEM forecast', icon: LineChart },
      { id: 'rfi', label: 'RFIs', icon: FileQuestion },
      { id: 'rfp', label: 'RFPs', icon: Files },
      { id: 'onboarding', label: 'Onboarding tasks', icon: ClipboardList },
    ],
  },
  {
    id: 'deliver',
    label: 'Deliver',
    items: [
      { id: 'orders', label: 'Purchase orders', icon: FileText },
      { id: 'shipments', label: 'Shipments', icon: Truck },
      { id: 'dock', label: 'Dock appointments', icon: CalendarClock },
      { id: 'production', label: 'Production', icon: Factory },
      { id: 'capacity', label: 'Capacity', icon: Gauge },
      { id: 'vmi', label: 'VMI / consignment', icon: Layers },
      { id: 'labels', label: 'Labels / packing', icon: Package },
      { id: 'lots', label: 'Lot genealogy', icon: Hash },
    ],
  },
  {
    id: 'quality',
    label: 'Quality',
    items: [
      { id: 'quality', label: 'Quality docs', icon: ShieldCheck },
      { id: 'scars', label: 'SCARs', icon: BadgeAlert },
      { id: 'returns', label: 'Returns', icon: Undo2 },
      { id: 'ppap', label: 'PPAP / FAI', icon: ScrollText },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    items: [
      { id: 'invoices', label: 'Invoices', icon: Receipt },
      { id: 'create-invoice', label: 'Submit invoice', icon: Send },
      { id: 'payments', label: 'Payments', icon: CreditCard },
      { id: 'claims', label: 'Claims', icon: FileMinus },
      { id: 'rebates', label: 'Rebates', icon: Percent },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'score', label: 'Your scorecard', icon: Gauge },
      { id: 'contacts', label: 'Contacts', icon: Contact },
      { id: 'profile', label: 'Certifications', icon: Shield },
      { id: 'bank', label: 'Bank & tax', icon: PiggyBank },
      { id: 'policies', label: 'Policies / NDA', icon: FileSignature },
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
