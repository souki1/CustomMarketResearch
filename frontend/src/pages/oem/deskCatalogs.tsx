import type { OemCatalogId, SupplierCatalogId } from './oemTypes'
import { Badge, DataTable, Kpi, Panel } from './oemUi'

export type CatalogSpec = {
  kpis: { label: string; value: string; hint?: string }[]
  title: string
  columns: string[]
  rows: string[][]
  note?: string
}

function spec(
  title: string,
  kpis: CatalogSpec['kpis'],
  columns: string[],
  rows: string[][],
  note?: string
): CatalogSpec {
  return { title, kpis, columns, rows, note }
}

export const OEM_CATALOGS: Record<OemCatalogId, CatalogSpec> = {
  forecast: spec(
    '13-week forecast shared with suppliers',
    [
      { label: 'Parts shared', value: '3' },
      { label: 'Week 1 need', value: '72' },
      { label: 'Frozen horizon', value: '4 wks' },
    ],
    ['Part', 'W1', 'W2', 'W3', 'W4', 'W5–8', 'Shared with'],
    [
      ['TC403-14670', '12', '12', '10', '10', '36', 'Messicks'],
      ['1G539-33012', '8', '8', '8', '6', '24', 'Messicks'],
      ['HH164-32430', '2', '2', '2', '2', '8', 'Coleman'],
    ],
    'OEM publishes; suppliers commit capacity against frozen weeks.'
  ),
  plants: spec(
    'Plants, docks, and ship-to',
    [
      { label: 'Plants', value: '2' },
      { label: 'Docks', value: '5' },
    ],
    ['Plant', 'Ship-to', 'Dock', 'Incoterm', 'Buyer'],
    [
      ['Plant 1 — Jefferson', 'ST-JEFF-01', 'Dock A', 'FCA', 'A. Patel'],
      ['Plant 1 — Jefferson', 'ST-JEFF-02', 'Dock C', 'DAP', 'A. Patel'],
      ['Plant 2 — Moline', 'ST-MOL-01', 'Dock 4', 'FCA', 'R. Chen'],
    ]
  ),
  'make-buy': spec(
    'Make vs buy decisions',
    [
      { label: 'Make', value: '1' },
      { label: 'Buy', value: '3' },
      { label: 'Review', value: '1' },
    ],
    ['Part', 'Decision', 'Reason', 'Owner', 'Next review'],
    [
      ['TC403-14670', 'Buy', 'No in-house seal line', 'Sourcing', '2026-12-01'],
      ['HH164-32430', 'Buy', 'Hose crimp outsourced', 'Sourcing', '2026-10-15'],
      ['JIG-441', 'Make', 'Tooling already owned', 'Mfg eng', '2027-01-08'],
      ['TA040-14720', 'Review', 'Aftermarket quality hold', 'Quality', '2026-09-20'],
    ]
  ),
  npi: spec(
    'New product introduction & tooling',
    [
      { label: 'Open NPIs', value: '2' },
      { label: 'Tooling $', value: '$48k' },
    ],
    ['Program', 'Part', 'Gate', 'Tooling', 'PPAP', 'Sourcing'],
    [
      ['KX040-5 facelift', 'TC403-14670', 'Gate 3', 'Paid', 'Level 3 due', 'Messicks'],
      ['M7 bundle', 'HH164-32430', 'Gate 2', 'Quote', 'Not started', 'Coleman'],
    ]
  ),
  onboarding: spec(
    'Supplier onboarding',
    [
      { label: 'In progress', value: '2' },
      { label: 'Blocked', value: '1' },
    ],
    ['Supplier', 'NDA', 'W-9 / tax', 'Insurance', 'Portal access', 'Status'],
    [
      ['Midwest Seals Co', 'Signed', 'In review', 'Missing', 'Invited', 'Blocked'],
      ['H&R Agri-Power', 'Signed', 'Complete', 'Valid', 'Active', 'Ready'],
      ['Fleetguard Direct', 'Sent', 'Complete', 'Valid', 'Pending SSO', 'In progress'],
    ]
  ),
  rfi: spec(
    'Requests for information',
    [
      { label: 'Open RFIs', value: '2' },
      { label: 'Responses', value: '5' },
    ],
    ['RFI', 'Topic', 'Suppliers', 'Due', 'Status'],
    [
      ['RFI-118', 'Viton vs nitrile seal options', '3', '2026-09-18', 'Open'],
      ['RFI-121', 'Hose burst test method', '2', '2026-09-22', 'Open'],
      ['RFI-109', 'Filter micron cross', '4', '2026-09-01', 'Closed'],
    ]
  ),
  rfp: spec(
    'Requests for proposal (annual / program)',
    [
      { label: 'Live RFPs', value: '1' },
      { label: 'Est. spend', value: '$210k' },
    ],
    ['RFP', 'Scope', 'Term', 'Bidders', 'Due', 'Status'],
    [
      ['RFP-44', 'Hydraulic hose family Plant 2', '24 mo', '3', '2026-10-05', 'Scoring'],
      ['RFP-41', 'Oil filter blanket', '12 mo', '2', '2026-08-20', 'Awarded'],
    ]
  ),
  auctions: spec(
    'Reverse auctions',
    [
      { label: 'Scheduled', value: '1' },
      { label: 'Last save', value: '11%' },
    ],
    ['Event', 'Parts', 'Start', 'Duration', 'Floor', 'Status'],
    [
      ['AUC-09', 'Gaskets + seals lot', '2026-09-19 10:00', '45 min', '$14.20', 'Scheduled'],
      ['AUC-07', 'Filters lot', '2026-08-12', '30 min', '$10.40', 'Closed'],
    ]
  ),
  punchout: spec(
    'Hosted catalog & punchout',
    [
      { label: 'Live catalogs', value: '2' },
      { label: 'SKUs', value: '1,840' },
    ],
    ['Supplier', 'Type', 'SKUs', 'Last sync', 'Punchout'],
    [
      ['Messicks', 'Hosted', '920', '2026-09-11', 'cXML ok'],
      ['Coleman Equipment', 'Punchout', '640', '2026-09-10', 'OCI ok'],
      ['All States Ag Parts', 'Hosted', '280', '2026-09-04', 'Needs map'],
    ]
  ),
  aml: spec(
    'Approved manufacturer list',
    [
      { label: 'AML lines', value: '5' },
      { label: 'Pending eng', value: '1' },
    ],
    ['Part', 'Mfr', 'Mfr PN', 'Status', 'Eng owner'],
    [
      ['TC403-14670', 'Kubota', 'TC403-14670', 'Approved', 'E. Walsh'],
      ['1G539-33012', 'Kubota', '1G539-33012', 'Approved', 'E. Walsh'],
      ['1G539-33012', 'Fleetguard', 'LF3970', 'Approved', 'E. Walsh'],
      ['TA040-14720', 'Fel-Pro', 'VS 50518 R', 'Hold', 'Q. Diaz'],
      ['HH164-32430', 'Gates', '6M3K-08', 'Pending', 'E. Walsh'],
    ]
  ),
  expedite: spec(
    'Expedites & line-down',
    [
      { label: 'Open', value: '2' },
      { label: 'Line-down', value: '1' },
    ],
    ['Part', 'Plant', 'Need', 'Carrier', 'Premium', 'Status'],
    [
      ['TC403-14670', 'Jefferson', 'Tomorrow 06:00', 'Hotshot', '$420', 'Open'],
      ['1G539-33012', 'Moline', 'Fri dock', 'UPS Red', '$64', 'In transit'],
    ]
  ),
  budgets: spec(
    'Category budget vs actual',
    [
      { label: 'YTD spend', value: '$186k' },
      { label: 'Budget left', value: '$44k' },
    ],
    ['Category', 'Budget', 'Commit', 'Actual', 'Variance'],
    [
      ['Seals & gaskets', '$80,000', '$52,000', '$41,200', 'Under'],
      ['Filters', '$60,000', '$48,000', '$39,100', 'Under'],
      ['Hydraulics', '$90,000', '$71,000', '$68,400', 'Watch'],
    ]
  ),
  'landed-cost': spec(
    'Landed cost (unit + freight + duty)',
    [
      { label: 'Quotes priced', value: '3' },
      { label: 'Duty model', value: 'HTS 4016' },
    ],
    ['Part', 'Unit', 'Freight', 'Duty', 'Landed', 'Incoterm'],
    [
      ['TC403-14670', '$18.40', '$0.62', '$0.00', '$19.02', 'FCA PA'],
      ['HH164-32430', '$64.00', '$2.10', '$1.28', '$67.38', 'DAP KY'],
      ['TA040-14720', '$14.20', '$0.90', '$0.00', '$15.10', 'EXW IA'],
    ]
  ),
  returns: spec(
    'Returns to vendor',
    [
      { label: 'Open RTVs', value: '1' },
      { label: 'Credit pending', value: '$14.20' },
    ],
    ['RTV', 'PO', 'Part', 'Qty', 'Reason', 'Credit', 'Status'],
    [
      ['RTV-77', 'PO-10388', 'TA040-14720', '1', 'Thickness OOS', '$14.20', 'Awaiting pickup'],
    ]
  ),
  lots: spec(
    'Lot and serial traceability',
    [
      { label: 'Lots on hand', value: '4' },
      { label: 'Serialized', value: '0' },
    ],
    ['Part', 'Lot', 'Qty', 'Received', 'Supplier', 'Hold'],
    [
      ['1G539-33012', 'LOT-9912', '6', '2026-09-10', 'Messicks', 'No'],
      ['TA040-14720', 'LOT-8841', '9', '2026-09-04', 'All States', 'Yes'],
      ['HH164-32430', 'LOT-2201', '8', 'In prod', 'Coleman', 'No'],
    ]
  ),
  warehouse: spec(
    'Warehouse bins',
    [
      { label: 'Bins used', value: '6' },
      { label: 'Cycle due', value: '2' },
    ],
    ['Part', 'Plant', 'Bin', 'On hand', 'Min', 'Cycle'],
    [
      ['TC403-14670', 'Jefferson', 'A-12-04', '8', '20', 'Due'],
      ['1G539-33012', 'Jefferson', 'B-02-11', '6', '12', 'OK'],
      ['HH164-32430', 'Moline', 'H-01-02', '1', '4', 'Due'],
    ]
  ),
  customs: spec(
    'Import / customs',
    [
      { label: 'Open entries', value: '1' },
      { label: 'Broker', value: 'CH Robinson' },
    ],
    ['Entry', 'Part', 'HTS', 'Broker', 'ETA', 'Status'],
    [
      ['ENT-3301', 'HH164-32430', '4009.21', 'CH Robinson', '2026-09-16', 'ISF filed'],
    ]
  ),
  dock: spec(
    'Inbound dock calendar',
    [
      { label: 'Today slots', value: '4' },
      { label: 'Open', value: '1' },
    ],
    ['When', 'Dock', 'Carrier', 'PO', 'Status'],
    [
      ['Today 09:00', 'Dock A', 'UPS Freight', 'PO-10412', 'Booked'],
      ['Today 13:30', 'Dock C', 'Hotshot', 'PO-10440', 'Open'],
      ['Mon 08:00', 'Dock 4', 'Coleman truck', 'PO-10301', 'Confirmed'],
    ]
  ),
  debits: spec(
    'Debit memos',
    [
      { label: 'Open', value: '1' },
      { label: 'Amount', value: '$14.20' },
    ],
    ['Debit', 'Supplier', 'Against', 'Reason', 'Amount', 'Status'],
    [
      ['DM-19', 'All States Ag Parts', 'INV-54881', 'RTV thickness', '$14.20', 'Issued'],
    ]
  ),
  rebates: spec(
    'Volume rebates & commitments',
    [
      { label: 'Agreements', value: '2' },
      { label: 'YTD accrual', value: '$2.4k' },
    ],
    ['Supplier', 'Tier', 'YTD volume', 'Rate', 'Accrual', 'Payout'],
    [
      ['Messicks', 'Gold 2%', '$118,000', '2%', '$2,360', 'Q4'],
      ['Coleman Equipment', 'Silver 1%', '$41,000', '1%', '$410', 'Year-end'],
    ]
  ),
  'va-ve': spec(
    'Value analysis / value engineering',
    [
      { label: 'Active ideas', value: '3' },
      { label: 'Est. save', value: '$19k/yr' },
    ],
    ['Idea', 'Part', 'Change', 'Est. save', 'Gate'],
    [
      ['VE-12', 'TC403-14670', 'Dual source equivalent', '$8,400', 'Trial'],
      ['VE-14', 'HH164-32430', 'Longer cut length', '$6,200', 'Quote'],
      ['VE-09', 'TA040-14720', 'MLS gasket trial', '$4,100', 'Hold'],
    ]
  ),
  qbr: spec(
    'Quarterly business reviews',
    [
      { label: 'This quarter', value: '2' },
      { label: 'Overdue', value: '0' },
    ],
    ['Supplier', 'Date', 'OTD', 'PPM', 'Actions'],
    [
      ['Messicks', '2026-10-08', '96%', '120', 'Expedite SOP'],
      ['Coleman Equipment', '2026-10-22', '91%', '340', 'Capacity plan'],
    ]
  ),
  esg: spec(
    'ESG, conflict minerals, diversity',
    [
      { label: 'CMRT in', value: '2 / 4' },
      { label: 'Diverse spend', value: '8%' },
    ],
    ['Supplier', 'CMRT', 'RoHS', 'REACH', 'Diverse', 'CO2 survey'],
    [
      ['Messicks', '2026', 'Yes', 'Yes', 'No', 'In'],
      ['Coleman Equipment', 'Missing', 'Yes', 'Yes', 'No', 'Out'],
      ['All States Ag Parts', '2025', 'Partial', 'No', 'Yes', 'Out'],
    ]
  ),
  savings: spec(
    'Savings tracker vs baseline',
    [
      { label: 'YTD booked', value: '$12.6k' },
      { label: 'Pipeline', value: '$19k' },
    ],
    ['Initiative', 'Type', 'Booked', 'Pipeline', 'Owner'],
    [
      ['Filter blanket RFP-41', 'Price', '$6,800', '$0', 'Buyer'],
      ['Seal dual source', 'VA/VE', '$0', '$8,400', 'Eng'],
      ['Freight consolidation', 'Logistics', '$5,800', '$4,200', 'Logistics'],
    ]
  ),
  messages: spec(
    'Buyer–supplier messages',
    [
      { label: 'Unread', value: '3' },
      { label: 'Threads', value: '5' },
    ],
    ['From', 'About', 'Preview', 'When'],
    [
      ['Messicks', 'PO-10440', 'Can we split ship 20 + 20?', '2h ago'],
      ['Coleman', 'RFP-44', 'Need burst spec PDF', 'Yesterday'],
      ['Quality', 'LOT-8841', 'SCAR draft ready', 'Yesterday'],
    ]
  ),
  audit: spec(
    'Audit log',
    [
      { label: 'Events today', value: '6' },
    ],
    ['When', 'User', 'Action', 'Object'],
    [
      ['Today 10:14', 'souki', 'Awarded bid', 'RFQ-2026-0911'],
      ['Today 09:41', 'A. Patel', 'Approved PO', 'PO-10412'],
      ['Yesterday', 'system', '3-way mismatch', 'INV-55102'],
      ['Yesterday', 'Q. Diaz', 'Opened NCR', 'LOT-8841'],
    ]
  ),
}

export const SUPPLIER_CATALOGS: Record<SupplierCatalogId, CatalogSpec> = {
  onboarding: spec(
    'Your onboarding with this OEM',
    [
      { label: 'Tasks left', value: '1' },
      { label: 'Portal', value: 'Active' },
    ],
    ['Task', 'Owner', 'Due', 'Status'],
    [
      ['Sign NDA', 'Legal', 'Done', 'Complete'],
      ['W-9 / tax form', 'Finance', 'Done', 'Complete'],
      ['COI insurance', 'Admin', '2026-09-20', 'Expiring'],
      ['cXML punchout test', 'IT', 'Done', 'Complete'],
    ]
  ),
  rfi: spec(
    'RFIs to answer',
    [{ label: 'Open', value: '2' }],
    ['RFI', 'Question', 'Due', 'Your status'],
    [
      ['RFI-118', 'Viton vs nitrile options', '2026-09-18', 'Draft'],
      ['RFI-121', 'Hose burst test method', '2026-09-22', 'Not started'],
    ]
  ),
  rfp: spec(
    'RFPs to propose',
    [{ label: 'Live', value: '1' }],
    ['RFP', 'Scope', 'Due', 'Status'],
    [
      ['RFP-44', 'Hydraulic hose family Plant 2', '2026-10-05', 'Pricing'],
    ]
  ),
  catalog: spec(
    'Your catalog published to the OEM',
    [
      { label: 'SKUs live', value: '920' },
      { label: 'Last sync', value: 'Today' },
    ],
    ['SKU', 'OEM PN', 'Price', 'UOM', 'Lead', 'Published'],
    [
      ['MSK-SEAL-70', 'TC403-14670', '$18.40', 'EA', '2d', 'Yes'],
      ['MSK-FIL-12', '1G539-33012', '$11.20', 'EA', '1d', 'Yes'],
      ['MSK-HOSE-30', 'HH164-32430', '—', 'EA', '5d', 'No'],
    ]
  ),
  forecast: spec(
    'OEM forecast (read-only)',
    [{ label: 'Frozen weeks', value: '4' }],
    ['Part', 'W1', 'W2', 'W3', 'W4', 'Commit?'],
    [
      ['TC403-14670', '12', '12', '10', '10', 'Yes'],
      ['1G539-33012', '8', '8', '8', '6', 'Yes'],
    ]
  ),
  capacity: spec(
    'Your capacity calendar',
    [{ label: 'This week', value: '92%' }],
    ['Week', 'Seals', 'Filters', 'Constraint'],
    [
      ['W38', '1,200', '800', 'Press 2 PM'],
      ['W39', '1,200', '800', 'None'],
      ['W40', '900', '800', 'Holiday'],
    ]
  ),
  vmi: spec(
    'VMI / consignment at the OEM',
    [
      { label: 'Bins you own', value: '2' },
      { label: 'Your stock', value: '14' },
    ],
    ['Part', 'Plant bin', 'Your qty', 'Min', 'Max', 'Bill on'],
    [
      ['1G539-33012', 'Jefferson B-02', '6', '8', '24', 'Scan-out'],
      ['TC403-14670', 'Jefferson A-12', '8', '10', '40', 'Scan-out'],
    ]
  ),
  dock: spec(
    'Dock appointments you booked',
    [{ label: 'Upcoming', value: '2' }],
    ['When', 'Plant / dock', 'PO', 'Status'],
    [
      ['Today 09:00', 'Jefferson Dock A', 'PO-10412', 'Confirmed'],
      ['Today 13:30', 'Jefferson Dock C', 'PO-10440', 'Requested'],
    ]
  ),
  labels: spec(
    'Shipping labels & packing lists',
    [{ label: 'Ready to print', value: '1' }],
    ['PO', 'Cartons', 'Label', 'Packing list'],
    [
      ['PO-10412', '2', 'SSCC printed', 'PDF'],
      ['PO-10440', '0', 'Not generated', 'Draft'],
    ]
  ),
  lots: spec(
    'Lots you shipped',
    [{ label: 'Open lots', value: '2' }],
    ['Lot', 'Part', 'Qty', 'PO', 'Shipped'],
    [
      ['LOT-9912', '1G539-33012', '18', 'PO-10412', '2026-09-10'],
      ['LOT-1044', 'TC403-14670', '0', 'PO-10440', 'Not yet'],
    ]
  ),
  ppap: spec(
    'PPAP / FAI submissions',
    [{ label: 'Due', value: '1' }],
    ['Part', 'Level', 'Due', 'Status'],
    [
      ['TC403-14670', 'Level 3', '2026-09-30', 'In work'],
      ['1G539-33012', 'Level 2', '2026-08-01', 'Approved'],
    ]
  ),
  scars: spec(
    'Corrective actions assigned to you',
    [{ label: 'Open SCARs', value: '1' }],
    ['SCAR', 'Part', '8D step', 'Due', 'Status'],
    [
      ['SCAR-31', 'TA040-14720', 'D4 root cause', '2026-09-21', 'Open'],
    ]
  ),
  returns: spec(
    'Returns you must pick up',
    [{ label: 'Open', value: '1' }],
    ['RTV', 'Part', 'Qty', 'RMA', 'Pickup'],
    [
      ['RTV-77', 'TA040-14720', '1', 'RMA-551', 'Schedule'],
    ]
  ),
  'create-invoice': spec(
    'Submit an invoice against a PO',
    [{ label: 'Eligible POs', value: '1' }],
    ['PO', 'Part', 'Received', 'Billable', 'Action'],
    [
      ['PO-10412', '1G539-33012', '6', '6', 'Draft INV-55102 already in'],
      ['PO-10440', 'TC403-14670', '0', '0', 'Wait for receipt'],
    ],
    'Live submit is not wired yet. This shows what the vendor would bill.'
  ),
  claims: spec(
    'Freight & shortage claims',
    [{ label: 'Open', value: '1' }],
    ['Claim', 'PO', 'Type', 'Amount', 'Status'],
    [
      ['CL-08', 'PO-10412', 'Short 0 vs ASN 18', '$0', 'Investigating'],
    ]
  ),
  rebates: spec(
    'Your rebate with this OEM',
    [{ label: 'YTD accrual', value: '$2,360' }],
    ['Tier', 'YTD volume', 'Rate', 'Next payout'],
    [['Gold', '$118,000', '2%', 'Q4 2026']]
  ),
  bank: spec(
    'Bank and tax on file',
    [{ label: 'ACH', value: 'On file' }],
    ['Field', 'Value', 'Status'],
    [
      ['Legal name', 'Messicks Inc.', 'Verified'],
      ['EIN', '**—***1234', 'Verified'],
      ['ACH', 'Wells Fargo ****4412', 'Verified'],
      ['Remit email', 'ap@messicks.example', 'Verified'],
    ]
  ),
  policies: spec(
    'Policies and NDA',
    [{ label: 'Unsigned', value: '0' }],
    ['Document', 'Version', 'Signed', 'Expires'],
    [
      ['NDA', '2026.1', '2026-01-12', '2027-01-12'],
      ['Supplier code of conduct', '4.2', '2026-01-12', '—'],
      ['Quality manual ack', 'QMS-9', '2026-03-02', '—'],
    ]
  ),
  contacts: spec(
    'Your contacts this OEM can reach',
    [{ label: 'People', value: '3' }],
    ['Name', 'Role', 'Email', 'Phone'],
    [
      ['Dana Messick', 'Sales', 'dana@messicks.example', '+1 717-555-0140'],
      ['Luis Ortega', 'Inside sales', 'luis@messicks.example', '+1 717-555-0144'],
      ['Night desk', 'After hours', 'duty@messicks.example', '+1 717-555-0199'],
    ]
  ),
  messages: spec(
    'Messages with the OEM',
    [{ label: 'Unread', value: '1' }],
    ['From', 'About', 'Preview', 'When'],
    [
      ['Buyer desk', 'PO-10440', 'Please ACK by Friday', '2h ago'],
      ['Quality', 'PPAP Level 3', 'Need dimensional report', 'Yesterday'],
    ]
  ),
  score: spec(
    'How this OEM scores you',
    [
      { label: 'OTD', value: '96%' },
      { label: 'Quality', value: '99%' },
    ],
    ['Metric', 'You', 'Target', 'Trend'],
    [
      ['On-time delivery', '96%', '95%', 'Up'],
      ['PPM', '120', '< 250', 'Flat'],
      ['ASN accuracy', '98%', '99%', 'Down'],
      ['Quote response', '18h', '< 24h', 'Up'],
    ]
  ),
}

export function isOemCatalogId(raw: string): raw is OemCatalogId {
  return Object.prototype.hasOwnProperty.call(OEM_CATALOGS, raw)
}

export function isSupplierCatalogId(raw: string): raw is SupplierCatalogId {
  return Object.prototype.hasOwnProperty.call(SUPPLIER_CATALOGS, raw)
}

export function CatalogPanel({ spec: s }: { spec: CatalogSpec }) {
  return (
    <div className="flex flex-col gap-3.5">
      {s.kpis.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {s.kpis.map((k) => (
            <Kpi key={k.label} label={k.label} value={k.value} hint={k.hint} />
          ))}
        </div>
      ) : null}
      <Panel
        title={s.title}
        action={<Badge tone="neutral">Preview</Badge>}
      >
        <DataTable columns={s.columns}>
          {s.rows.map((row, i) => (
            <tr key={`${s.title}-${i}`}>
              {row.map((cell, j) => (
                <td
                  key={`${i}-${j}`}
                  className={`px-4 py-2.5 ${j === 0 ? 'font-medium' : 'text-app-secondary'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </DataTable>
        {s.note ? <p className="px-4 py-3 text-xs text-app-secondary">{s.note}</p> : null}
      </Panel>
    </div>
  )
}
