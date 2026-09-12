import { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { OEM_OVERVIEW_PATH } from '@/lib/paths'
import { CatalogPanel, isOemCatalogId, OEM_CATALOGS } from './deskCatalogs'
import { isOemSection } from './deskNav'
import { useOemDesk } from './OemDeskContext'
import {
  ApprovalsPanel,
  ChangesPanel,
  CompliancePanel,
  DemandPanel,
  OverviewPanel,
  PaymentsPanel,
  ScorecardsPanel,
} from './OemMorePanels'
import type { InvoiceMatch, NcrStatus, OemSectionId, RfqStatus, TrackStage } from './oemTypes'
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

function stageTone(stage: TrackStage) {
  switch (stage) {
    case 'quoted':
      return 'neutral' as const
    case 'ordered':
      return 'info' as const
    case 'in_production':
      return 'warn' as const
    case 'in_transit':
      return 'info' as const
    case 'received':
      return 'ok' as const
    default: {
      const _exhaustive: never = stage
      return _exhaustive
    }
  }
}

function matchTone(match: InvoiceMatch) {
  switch (match) {
    case 'matched':
      return 'ok' as const
    case 'qty_mismatch':
    case 'price_mismatch':
      return 'warn' as const
    case 'unmatched':
      return 'danger' as const
    default: {
      const _exhaustive: never = match
      return _exhaustive
    }
  }
}

function ncrTone(status: NcrStatus) {
  switch (status) {
    case 'open':
      return 'danger' as const
    case 'scar':
      return 'warn' as const
    case 'closed':
      return 'ok' as const
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

function originTone(origin: 'oem' | 'aftermarket' | 'equivalent') {
  switch (origin) {
    case 'oem':
      return 'info' as const
    case 'equivalent':
      return 'ok' as const
    case 'aftermarket':
      return 'warn' as const
    default: {
      const _exhaustive: never = origin
      return _exhaustive
    }
  }
}

function riskTone(risk: 'low' | 'medium' | 'high') {
  switch (risk) {
    case 'low':
      return 'ok' as const
    case 'medium':
      return 'warn' as const
    case 'high':
      return 'danger' as const
    default: {
      const _exhaustive: never = risk
      return _exhaustive
    }
  }
}

export function OemSectionPage() {
  const { section } = useParams()
  if (!isOemSection(section)) return <Navigate to={OEM_OVERVIEW_PATH} replace />
  return <OemSection section={section} />
}

function OemSection({ section }: { section: OemSectionId }) {
  if (isOemCatalogId(section)) {
    return <CatalogPanel spec={OEM_CATALOGS[section]} />
  }
  switch (section) {
    case 'overview':
      return <OverviewPanel />
    case 'bom':
      return <BomPanel />
    case 'demand':
      return <DemandPanel />
    case 'suppliers':
      return <SuppliersPanel />
    case 'scorecards':
      return <ScorecardsPanel />
    case 'rfqs':
      return <RfqsPanel />
    case 'approvals':
      return <ApprovalsPanel />
    case 'contracts':
      return <ContractsPanel />
    case 'changes':
      return <ChangesPanel />
    case 'in-track':
      return <InTrackPanel />
    case 'receiving':
      return <ReceivingPanel />
    case 'quality':
      return <QualityPanel />
    case 'invoices':
      return <InvoicesPanel />
    case 'payments':
      return <PaymentsPanel />
    case 'compliance':
      return <CompliancePanel />
    case 'cost-down':
      return <CostDownPanel />
    default: {
      const _exhaustive: never = section
      return _exhaustive
    }
  }
}

function BomPanel() {
  const { bom } = useOemDesk()
  const [q, setQ] = useState('')
  const rows = bom.filter((r) => {
    const n = q.trim().toLowerCase()
    if (!n) return true
    return `${r.partNumber} ${r.description} ${r.aml}`.toLowerCase().includes(n)
  })
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="BOM lines" value={String(bom.length)} hint="Active production parts" />
        <Kpi
          label="OEM-only"
          value={String(bom.filter((b) => b.origin === 'oem').length)}
          hint="Approved manufacturer"
        />
        <Kpi
          label="Equivalents"
          value={String(bom.filter((b) => b.origin === 'equivalent').length)}
        />
        <Kpi
          label="Aftermarket"
          value={String(bom.filter((b) => b.origin === 'aftermarket').length)}
        />
      </div>
      <Panel
        title="Item master"
        action={
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search part or AML"
            className="h-8 w-52 rounded-[8px] border border-app-separator bg-app-bg px-2.5 text-[13px] text-app-label placeholder:text-app-tertiary"
          />
        }
      >
        <DataTable
          columns={['Part', 'Description', 'Rev', 'Qty/unit', 'AML', 'Origin', 'Min–max']}
        >
          {rows.map((r) => (
            <tr key={r.id} className="text-app-label">
              <td className="px-4 py-2.5 font-medium tabular-nums">{r.partNumber}</td>
              <td className="px-4 py-2.5">{r.description}</td>
              <td className="px-4 py-2.5 text-app-secondary">{r.revision}</td>
              <td className="px-4 py-2.5 tabular-nums">
                {r.qtyPer} {r.uom}
              </td>
              <td className="px-4 py-2.5 text-app-secondary">{r.aml}</td>
              <td className="px-4 py-2.5">
                <Badge tone={originTone(r.origin)}>{r.origin}</Badge>
              </td>
              <td className="px-4 py-2.5 tabular-nums text-app-secondary">
                {r.min}–{r.max}
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  )
}

function SuppliersPanel() {
  const { suppliers } = useOemDesk()
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Suppliers" value={String(suppliers.length)} />
        <Kpi label="Authorized" value={String(suppliers.filter((s) => s.authorized).length)} />
        <Kpi
          label="High risk"
          value={String(suppliers.filter((s) => s.risk === 'high').length)}
          hint="None in this sample"
        />
        <Kpi
          label="Avg on-time"
          value={`${Math.round(suppliers.reduce((s, r) => s + r.onTime, 0) / suppliers.length)}%`}
        />
      </div>
      <Panel title="Supplier master">
        <DataTable columns={['Supplier', 'Category', 'Region', 'Authorized', 'On-time', 'Quality', 'Risk']}>
          {suppliers.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-2.5 font-medium">{s.name}</td>
              <td className="px-4 py-2.5 text-app-secondary">{s.category}</td>
              <td className="px-4 py-2.5 text-app-secondary">{s.region}</td>
              <td className="px-4 py-2.5">
                <Badge tone={s.authorized ? 'ok' : 'warn'}>
                  {s.authorized ? 'Authorized' : 'Unauthorized'}
                </Badge>
              </td>
              <td className="px-4 py-2.5 tabular-nums">{s.onTime}%</td>
              <td className="px-4 py-2.5 tabular-nums">{s.quality}%</td>
              <td className="px-4 py-2.5">
                <Badge tone={riskTone(s.risk)}>{s.risk}</Badge>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  )
}

function RfqsPanel() {
  const { rfqs, awardBid } = useOemDesk()
  const [selectedId, setSelectedId] = useState(rfqs[0]?.id ?? '')
  const selected = rfqs.find((r) => r.id === selectedId) ?? rfqs[0]

  const openCount = rfqs.filter((r) => r.status === 'open').length

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open RFQs" value={String(openCount)} hint="Waiting on bids or award" />
        <Kpi label="Awarded" value={String(rfqs.filter((r) => r.status === 'awarded').length)} />
        <Kpi
          label="Bids in play"
          value={String(rfqs.reduce((n, r) => n + r.bids.length, 0))}
        />
        <Kpi label="Need by" value={selected?.needBy ?? '—'} hint={selected?.partNumber} />
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[280px_1fr]">
        <Panel title="Requests">
          <ul>
            {rfqs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full flex-col gap-1 border-b border-app-separator px-4 py-3 text-left ${
                    selected?.id === r.id ? 'bg-app-accent-soft' : 'hover:bg-app-fill'
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
          <Panel title={`Bids · ${selected.partNumber}`}>
            <DataTable columns={['Supplier', 'Unit price', 'Lead', 'MOQ', 'Status', '']}>
              {selected.bids.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-2.5 font-medium">{b.supplierName}</td>
                  <td className="px-4 py-2.5 tabular-nums">{formatUsd(b.unitPrice)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{b.leadDays}d</td>
                  <td className="px-4 py-2.5 tabular-nums">{b.moq}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        b.status === 'awarded' ? 'ok' : b.status === 'lost' ? 'neutral' : 'info'
                      }
                    >
                      {b.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {selected.status === 'open' ? (
                      <AccentButton onClick={() => awardBid(selected.id, b.id)}>Award</AccentButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </DataTable>
            <p className="px-4 py-3 text-xs text-app-secondary">
              Awarding creates a pending PO on the supplier portal and moves the part to ordered.
            </p>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}

function ContractsPanel() {
  const { contracts } = useOemDesk()
  return (
    <Panel title="Blanket agreements">
      <DataTable columns={['Supplier', 'Part', 'Contract price', 'Valid until', 'Terms', 'Status']}>
        {contracts.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2.5 font-medium">{c.supplierName}</td>
            <td className="px-4 py-2.5 tabular-nums">{c.partNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{formatUsd(c.unitPrice)}</td>
            <td className="px-4 py-2.5">{c.validUntil}</td>
            <td className="px-4 py-2.5 text-app-secondary">{c.terms}</td>
            <td className="px-4 py-2.5">
              <Badge tone={c.status === 'active' ? 'ok' : c.status === 'expiring' ? 'warn' : 'danger'}>
                {c.status}
              </Badge>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function InTrackPanel() {
  const { track } = useOemDesk()
  const atRisk = track.filter((t) => t.stage !== 'received' && t.ordered > t.received)
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open lines" value={String(atRisk.length)} hint="Not fully received" />
        <Kpi
          label="In transit"
          value={String(track.reduce((n, t) => n + t.inTransit, 0))}
          hint="Units on the road"
        />
        <Kpi
          label="In production"
          value={String(track.reduce((n, t) => n + t.inProduction, 0))}
        />
        <Kpi label="Received" value={String(track.reduce((n, t) => n + t.received, 0))} />
      </div>
      <Panel title="Quoted → ordered → production → transit → received">
        <DataTable
          columns={['Part', 'Supplier', 'Quoted', 'Ordered', 'Production', 'Transit', 'Received', 'Need by', 'Stage']}
        >
          {track.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-2.5 font-medium tabular-nums">{t.partNumber}</td>
              <td className="px-4 py-2.5">{t.supplierName}</td>
              <td className="px-4 py-2.5 tabular-nums">{t.quoted}</td>
              <td className="px-4 py-2.5 tabular-nums">{t.ordered}</td>
              <td className="px-4 py-2.5 tabular-nums">{t.inProduction}</td>
              <td className="px-4 py-2.5 tabular-nums">{t.inTransit}</td>
              <td className="px-4 py-2.5 tabular-nums">{t.received}</td>
              <td className="px-4 py-2.5">{t.needBy}</td>
              <td className="px-4 py-2.5">
                <Badge tone={stageTone(t.stage)}>{t.stage.replaceAll('_', ' ')}</Badge>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  )
}

function ReceivingPanel() {
  const { receipts, receiveLine } = useOemDesk()
  return (
    <Panel title="Dock receipts">
      <DataTable columns={['PO', 'Part', 'Expected', 'Received', 'Damage', '']}>
        {receipts.map((r) => (
          <tr key={r.id}>
            <td className="px-4 py-2.5 font-medium">{r.poNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{r.partNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{r.expected}</td>
            <td className="px-4 py-2.5 tabular-nums">{r.received}</td>
            <td className="px-4 py-2.5">
              {r.damage > 0 ? <Badge tone="danger">{r.damage} damaged</Badge> : '—'}
            </td>
            <td className="px-4 py-2.5 text-right">
              <GhostButton
                disabled={r.received >= r.expected}
                onClick={() => receiveLine(r.id, 1)}
              >
                Receive 1
              </GhostButton>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function QualityPanel() {
  const { quality, setNcrStatus } = useOemDesk()
  return (
    <Panel title="Nonconformances">
      <DataTable columns={['Part', 'Supplier', 'Issue', 'Lot', 'Status', '']}>
        {quality.map((q) => (
          <tr key={q.id}>
            <td className="px-4 py-2.5 font-medium tabular-nums">{q.partNumber}</td>
            <td className="px-4 py-2.5">{q.supplierName}</td>
            <td className="px-4 py-2.5 text-app-secondary">{q.issue}</td>
            <td className="px-4 py-2.5 tabular-nums">{q.lot}</td>
            <td className="px-4 py-2.5">
              <Badge tone={ncrTone(q.status)}>{q.status.toUpperCase()}</Badge>
            </td>
            <td className="px-4 py-2.5 text-right">
              <div className="flex justify-end gap-2">
                <GhostButton onClick={() => setNcrStatus(q.id, 'scar')}>Open SCAR</GhostButton>
                <AccentButton onClick={() => setNcrStatus(q.id, 'closed')}>Close</AccentButton>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

function InvoicesPanel() {
  const { invoices } = useOemDesk()
  const exception = invoices.filter((i) => i.match !== 'matched').length
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Invoices" value={String(invoices.length)} />
        <Kpi label="3-way exceptions" value={String(exception)} hint="Qty or price vs PO" />
        <Kpi
          label="Open amount"
          value={formatUsd(invoices.filter((i) => i.status !== 'paid').reduce((n, i) => n + i.amount, 0))}
        />
      </div>
      <Panel title="Invoice vs PO vs receipt">
        <DataTable columns={['Invoice', 'PO', 'Supplier', 'Amount', 'Match', 'Status']}>
          {invoices.map((i) => (
            <tr key={i.id}>
              <td className="px-4 py-2.5 font-medium">{i.number}</td>
              <td className="px-4 py-2.5">{i.poNumber}</td>
              <td className="px-4 py-2.5">{i.supplierName}</td>
              <td className="px-4 py-2.5 tabular-nums">{formatUsd(i.amount)}</td>
              <td className="px-4 py-2.5">
                <Badge tone={matchTone(i.match)}>{i.match.replaceAll('_', ' ')}</Badge>
              </td>
              <td className="px-4 py-2.5 text-app-secondary">{i.status}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  )
}

function CostDownPanel() {
  const { costDown } = useOemDesk()
  const gap = costDown.reduce((n, r) => n + (r.lastQuote - r.target), 0)
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Target gap" value={formatUsd(gap)} hint="Quote vs target, per unit" />
        <Kpi label="Parts in play" value={String(costDown.length)} />
        <Kpi label="Should-cost" value="Engineering + buy" hint="Not live yet" />
      </div>
      <Panel title="Should-cost vs quoted vs target">
        <DataTable columns={['Part', 'Should-cost', 'Last quote', 'Target', 'Gap', 'Idea']}>
          {costDown.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5 font-medium tabular-nums">{r.partNumber}</td>
              <td className="px-4 py-2.5 tabular-nums">{formatUsd(r.shouldCost)}</td>
              <td className="px-4 py-2.5 tabular-nums">{formatUsd(r.lastQuote)}</td>
              <td className="px-4 py-2.5 tabular-nums">{formatUsd(r.target)}</td>
              <td className="px-4 py-2.5">
                <Badge tone={r.lastQuote > r.target ? 'warn' : 'ok'}>
                  {formatUsd(r.lastQuote - r.target)}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-app-secondary">{r.idea}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  )
}

