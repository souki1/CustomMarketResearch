import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { SUPPLIER_HOME_PATH } from '@/lib/paths'
import { CatalogPanel, isSupplierCatalogId, SUPPLIER_CATALOGS } from './deskCatalogs'
import { isSupplierSection } from './deskNav'
import { useOemDesk } from './OemDeskContext'
import { PaymentsPanel } from './OemMorePanels'
import type { RfqStatus, SupplierSectionId } from './oemTypes'
import { AccentButton, Badge, DataTable, GhostButton, Kpi, Panel, formatUsd } from './oemUi'

function rfqTone(status: RfqStatus) {
  switch (status) {
    case 'open':
      return 'info' as const
    case 'awarded':
      return 'ok' as const
    case 'closed':
      return 'neutral' as const
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function SupplierSectionPage() {
  const { section } = useParams()
  if (!isSupplierSection(section)) return <Navigate to={SUPPLIER_HOME_PATH} replace />
  return <SupplierSection section={section} />
}

function SupplierSection({ section }: { section: SupplierSectionId }) {
  if (isSupplierCatalogId(section)) {
    return <CatalogPanel spec={SUPPLIER_CATALOGS[section]} />
  }
  switch (section) {
    case 'home':
      return <SupplierHome />
    case 'rfqs':
      return <SupplierRfqs />
    case 'orders':
      return <SupplierOrders />
    case 'production':
      return <SupplierProduction />
    case 'shipments':
      return <SupplierShipments />
    case 'invoices':
      return <SupplierInvoices />
    case 'quality':
      return <SupplierQuality />
    case 'payments':
      return <PaymentsPanel vendorView />
    case 'profile':
      return <SupplierProfile />
    default: {
      const _exhaustive: never = section
      return _exhaustive
    }
  }
}

function SupplierHome() {
  const { portalPos, rfqs, asns, qualityDocs } = useOemDesk()
  const pending = portalPos.filter((p) => p.ack === 'pending').length
  const openRfqs = rfqs.filter((r) => r.status === 'open').length
  const missingDocs = qualityDocs.filter((d) => !d.uploaded).length
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="RFQs to bid" value={String(openRfqs)} />
        <Kpi label="POs to acknowledge" value={String(pending)} />
        <Kpi label="Shipments out" value={String(asns.filter((a) => a.status === 'shipped').length)} />
        <Kpi label="Docs missing" value={String(missingDocs)} />
      </div>
      <Panel title="Inbox">
        <ul className="divide-y divide-app-separator text-[13px]">
          <li className="px-4 py-3">
            {pending} purchase order{pending === 1 ? '' : 's'} waiting for acknowledgement.
          </li>
          <li className="px-4 py-3">
            {openRfqs} open RFQ{openRfqs === 1 ? '' : 's'} from the OEM.
          </li>
          <li className="px-4 py-3 text-app-secondary">
            You cannot see BOM, approvals, or other buyer-only screens from this portal.
          </li>
        </ul>
      </Panel>
    </div>
  )
}

function SupplierRfqs() {
  const { rfqs, submitSupplierBid } = useOemDesk()
  const open = rfqs.filter((r) => r.status === 'open')
  const [selectedId, setSelectedId] = useState(open[0]?.id ?? rfqs[0]?.id ?? '')
  const selected = rfqs.find((r) => r.id === selectedId) ?? rfqs[0]
  const [price, setPrice] = useState('18.40')
  const [lead, setLead] = useState('2')
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Open to you" value={String(open.length)} />
        <Kpi label="Your company" value="Messicks" />
        <Kpi label="Need by" value={selected?.needBy ?? '—'} />
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[280px_1fr]">
        <Panel title="RFQs">
          <ul>
            {rfqs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full flex-col gap-1 border-b border-app-separator px-4 py-3 text-left ${
                    selected?.id === r.id ? 'bg-app-ok-soft' : 'hover:bg-app-fill'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{r.number}</span>
                    <Badge tone={rfqTone(r.status)}>{r.status}</Badge>
                  </span>
                  <span className="text-xs text-app-secondary">
                    {r.partNumber} · qty {r.qty}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        {selected ? (
          <Panel
            title={`Your bid · ${selected.partNumber}`}
            action={
              selected.status === 'open' ? (
                <div className="flex items-center gap-2">
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    aria-label="Unit price"
                    className="h-8 w-20 rounded-[8px] border border-app-separator bg-app-bg px-2 text-[13px]"
                  />
                  <input
                    value={lead}
                    onChange={(e) => setLead(e.target.value)}
                    inputMode="numeric"
                    aria-label="Lead days"
                    className="h-8 w-16 rounded-[8px] border border-app-separator bg-app-bg px-2 text-[13px]"
                  />
                  <AccentButton
                    onClick={() => submitSupplierBid(selected.id, Number(price), Number(lead))}
                  >
                    Submit bid
                  </AccentButton>
                </div>
              ) : null
            }
          >
            <DataTable columns={['Supplier', 'Unit price', 'Lead', 'Status']}>
              {selected.bids.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5 font-medium">
                    {b.supplierName}
                    {b.supplierName === 'Messicks' ? (
                      <span className="ml-2 text-xs text-app-ok">you</span>
                    ) : (
                      <span className="ml-2 text-xs text-app-tertiary">other</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {b.supplierName === 'Messicks' ? formatUsd(b.unitPrice) : 'Hidden'}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {b.supplierName === 'Messicks' ? `${b.leadDays}d` : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={b.status === 'awarded' ? 'ok' : 'neutral'}>{b.status}</Badge>
                  </td>
                </tr>
              ))}
            </DataTable>
            <p className="px-4 py-3 text-xs text-app-secondary">
              Competitors’ prices are hidden. The OEM awards from their desk, not here.
            </p>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

function SupplierOrders() {
  const { portalPos, ackPo } = useOemDesk()
  return (
    <Panel title="Purchase orders from the OEM">
      <DataTable columns={['PO', 'Part', 'Qty', 'Need by', 'Acknowledgement', '']}>
        {portalPos.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-2.5 font-medium">{p.number}</td>
            <td className="px-4 py-2.5 tabular-nums">{p.partNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{p.qty}</td>
            <td className="px-4 py-2.5">{p.needBy}</td>
            <td className="px-4 py-2.5">
              <Badge tone={p.ack === 'accepted' ? 'ok' : p.ack === 'declined' ? 'danger' : 'warn'}>
                {p.ack}
              </Badge>
            </td>
            <td className="px-4 py-2.5 text-right">
              {p.ack === 'pending' ? (
                <div className="flex justify-end gap-2">
                  <GhostButton onClick={() => ackPo(p.id, 'declined')}>Decline</GhostButton>
                  <AccentButton onClick={() => ackPo(p.id, 'accepted')}>Acknowledge</AccentButton>
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function SupplierProduction() {
  const { production, bumpProduction } = useOemDesk()
  return (
    <Panel title="Production milestones">
      <DataTable columns={['PO', 'Part', 'Qty', '% complete', 'ETA', '']}>
        {production.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-2.5 font-medium">{p.poNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{p.partNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{p.qty}</td>
            <td className="px-4 py-2.5 tabular-nums">{p.pct}%</td>
            <td className="px-4 py-2.5">{p.eta}</td>
            <td className="px-4 py-2.5 text-right">
              <GhostButton disabled={p.pct >= 100} onClick={() => bumpProduction(p.id)}>
                +25%
              </GhostButton>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function SupplierShipments() {
  const { asns, shipAsn } = useOemDesk()
  return (
    <Panel title="Advanced ship notices">
      <DataTable columns={['PO', 'Part', 'Qty', 'Carrier', 'Tracking', 'Status', '']}>
        {asns.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2.5 font-medium">{a.poNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{a.partNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{a.qty}</td>
            <td className="px-4 py-2.5">{a.carrier}</td>
            <td className="px-4 py-2.5 font-mono text-xs">{a.tracking}</td>
            <td className="px-4 py-2.5">
              <Badge tone={a.status === 'delivered' ? 'ok' : 'info'}>{a.status}</Badge>
            </td>
            <td className="px-4 py-2.5 text-right">
              {a.status !== 'delivered' ? (
                <AccentButton onClick={() => shipAsn(a.id)}>
                  {a.status === 'packed' ? 'Mark shipped' : 'Mark delivered'}
                </AccentButton>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function SupplierInvoices() {
  const { invoices } = useOemDesk()
  const mine = invoices.filter((i) => i.supplierName === 'Messicks')
  return (
    <Panel title="Invoices you submitted">
      <DataTable columns={['Invoice', 'PO', 'Amount', 'Match', 'Status']}>
        {mine.map((i) => (
          <tr key={i.id}>
            <td className="px-4 py-2.5 font-medium">{i.number}</td>
            <td className="px-4 py-2.5">{i.poNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{formatUsd(i.amount)}</td>
            <td className="px-4 py-2.5 text-app-secondary">{i.match.replaceAll('_', ' ')}</td>
            <td className="px-4 py-2.5">{i.status}</td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function SupplierQuality() {
  const { qualityDocs, toggleQualityDoc } = useOemDesk()
  return (
    <Panel title="Quality documents">
      <DataTable columns={['PO', 'Type', 'Uploaded', '']}>
        {qualityDocs.map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-2.5 font-medium">{d.poNumber}</td>
            <td className="px-4 py-2.5">{d.kind}</td>
            <td className="px-4 py-2.5">
              <Badge tone={d.uploaded ? 'ok' : 'warn'}>{d.uploaded ? 'Yes' : 'Missing'}</Badge>
            </td>
            <td className="px-4 py-2.5 text-right">
              <GhostButton onClick={() => toggleQualityDoc(d.id)}>
                {d.uploaded ? 'Remove' : 'Mark uploaded'}
              </GhostButton>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function SupplierProfile() {
  const { certs } = useOemDesk()
  return (
    <Panel title="Messicks certifications">
      <DataTable columns={['Certificate', 'Number', 'Expires', 'Status']}>
        {certs.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2.5 font-medium">{c.name}</td>
            <td className="px-4 py-2.5 tabular-nums">{c.number}</td>
            <td className="px-4 py-2.5">{c.expires}</td>
            <td className="px-4 py-2.5">
              <Badge tone={c.status === 'valid' ? 'ok' : 'warn'}>{c.status}</Badge>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}
