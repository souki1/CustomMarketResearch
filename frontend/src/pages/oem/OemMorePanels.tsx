import { Link } from 'react-router-dom'
import { SUPPLIER_HOME_PATH } from '@/lib/paths'
import { useOemDesk } from './OemDeskContext'
import type { ApprovalStatus } from './oemTypes'
import { AccentButton, Badge, DataTable, GhostButton, Kpi, Panel, formatUsd } from './oemUi'

function approvalTone(status: ApprovalStatus) {
  switch (status) {
    case 'pending':
      return 'warn' as const
    case 'approved':
      return 'ok' as const
    case 'rejected':
      return 'danger' as const
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function OverviewPanel() {
  const { rfqs, track, approvals, demand, portalPos } = useOemDesk()
  const shortage = demand.filter((d) => d.shortage > 0).length
  const pendingAck = portalPos.filter((p) => p.ack === 'pending').length
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Open RFQs" value={String(rfqs.filter((r) => r.status === 'open').length)} />
        <Kpi label="Approvals waiting" value={String(approvals.filter((a) => a.status === 'pending').length)} />
        <Kpi label="Shortage lines" value={String(shortage)} hint="Demand vs stock" />
        <Kpi label="POs awaiting vendor" value={String(pendingAck)} />
      </div>
      <div className="grid gap-3.5 md:grid-cols-2">
        <Panel title="At risk this week">
          <ul className="divide-y divide-app-separator">
            {demand
              .filter((d) => d.shortage > 0)
              .map((d) => (
                <li key={d.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="font-medium tabular-nums">{d.partNumber}</span>
                  <Badge tone="danger">short {d.shortage}</Badge>
                </li>
              ))}
            {shortage === 0 ? (
              <li className="px-4 py-3 text-[13px] text-app-secondary">No shortages in the sample.</li>
            ) : null}
          </ul>
        </Panel>
        <Panel title="Open track">
          <ul className="divide-y divide-app-separator">
            {track.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span className="tabular-nums">{t.partNumber}</span>
                <span className="text-app-secondary">{t.stage.replaceAll('_', ' ')}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <p className="text-xs text-app-secondary">
        Vendors use the{' '}
        <Link to={SUPPLIER_HOME_PATH} className="font-medium text-app-accent hover:underline">
          supplier portal
        </Link>{' '}
        to bid and acknowledge POs.
      </p>
    </div>
  )
}

export function DemandPanel() {
  const { demand } = useOemDesk()
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Shortage lines" value={String(demand.filter((d) => d.shortage > 0).length)} />
        <Kpi
          label="Units short"
          value={String(demand.reduce((n, d) => n + d.shortage, 0))}
        />
        <Kpi label="Covered by PO" value={String(demand.reduce((n, d) => n + d.onOrder, 0))} />
      </div>
      <Panel title="Need vs on-hand vs on-order">
        <DataTable columns={['Part', 'Need', 'On hand', 'On order', 'Shortage', 'Need by']}>
          {demand.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-2.5 font-medium tabular-nums">{d.partNumber}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.need}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.onHand}</td>
              <td className="px-4 py-2.5 tabular-nums">{d.onOrder}</td>
              <td className="px-4 py-2.5">
                {d.shortage > 0 ? <Badge tone="danger">{d.shortage}</Badge> : <Badge tone="ok">0</Badge>}
              </td>
              <td className="px-4 py-2.5">{d.needBy}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  )
}

export function ScorecardsPanel() {
  const { suppliers } = useOemDesk()
  return (
    <Panel title="Delivery and quality score">
      <DataTable columns={['Supplier', 'On-time', 'Quality', 'Composite', 'Risk']}>
        {suppliers.map((s) => {
          const composite = Math.round(s.onTime * 0.6 + s.quality * 0.4)
          return (
            <tr key={s.id}>
              <td className="px-4 py-2.5 font-medium">{s.name}</td>
              <td className="px-4 py-2.5 tabular-nums">{s.onTime}%</td>
              <td className="px-4 py-2.5 tabular-nums">{s.quality}%</td>
              <td className="px-4 py-2.5 tabular-nums font-semibold">{composite}</td>
              <td className="px-4 py-2.5 text-app-secondary">{s.risk}</td>
            </tr>
          )
        })}
      </DataTable>
    </Panel>
  )
}

export function ApprovalsPanel() {
  const { approvals, decideApproval } = useOemDesk()
  return (
    <Panel title="Spend approvals">
      <DataTable columns={['Type', 'Number', 'Requester', 'Amount', 'Status', '']}>
        {approvals.map((a) => (
          <tr key={a.id}>
            <td className="px-4 py-2.5 uppercase text-app-secondary">{a.kind}</td>
            <td className="px-4 py-2.5 font-medium">{a.number}</td>
            <td className="px-4 py-2.5">{a.requester}</td>
            <td className="px-4 py-2.5 tabular-nums">{formatUsd(a.amount)}</td>
            <td className="px-4 py-2.5">
              <Badge tone={approvalTone(a.status)}>{a.status}</Badge>
            </td>
            <td className="px-4 py-2.5 text-right">
              {a.status === 'pending' ? (
                <div className="flex justify-end gap-2">
                  <GhostButton onClick={() => decideApproval(a.id, 'rejected')}>Reject</GhostButton>
                  <AccentButton onClick={() => decideApproval(a.id, 'approved')}>Approve</AccentButton>
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

export function ChangesPanel() {
  const { changeOrders } = useOemDesk()
  return (
    <Panel title="PO change orders">
      <DataTable columns={['PO', 'Part', 'From', 'To', 'Reason', 'Status']}>
        {changeOrders.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2.5 font-medium">{c.poNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{c.partNumber}</td>
            <td className="px-4 py-2.5 tabular-nums">{c.fromQty}</td>
            <td className="px-4 py-2.5 tabular-nums">{c.toQty}</td>
            <td className="px-4 py-2.5 text-app-secondary">{c.reason}</td>
            <td className="px-4 py-2.5">
              <Badge tone={c.status === 'accepted' ? 'ok' : 'info'}>{c.status}</Badge>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

export function PaymentsPanel({ vendorView }: { vendorView?: boolean }) {
  const { payments, markPaid } = useOemDesk()
  const rows = vendorView ? payments.filter((p) => p.supplierName === 'Messicks') : payments
  return (
    <Panel title={vendorView ? 'Your payments from this OEM' : 'AP schedule'}>
      <DataTable columns={['Invoice', 'Supplier', 'Amount', 'Due', 'Status', '']}>
        {rows.map((p) => (
          <tr key={p.id}>
            <td className="px-4 py-2.5 font-medium">{p.invoiceNumber}</td>
            <td className="px-4 py-2.5">{p.supplierName}</td>
            <td className="px-4 py-2.5 tabular-nums">{formatUsd(p.amount)}</td>
            <td className="px-4 py-2.5">{p.due}</td>
            <td className="px-4 py-2.5">
              <Badge
                tone={p.status === 'paid' ? 'ok' : p.status === 'hold' ? 'danger' : 'warn'}
              >
                {p.status}
              </Badge>
            </td>
            <td className="px-4 py-2.5 text-right">
              {!vendorView && p.status !== 'paid' ? (
                <AccentButton onClick={() => markPaid(p.id)}>Mark paid</AccentButton>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

export function CompliancePanel() {
  const { compliance } = useOemDesk()
  return (
    <Panel title="Certificates and declarations">
      <DataTable columns={['Supplier', 'Item', 'Expires', 'Status']}>
        {compliance.map((c) => (
          <tr key={c.id}>
            <td className="px-4 py-2.5 font-medium">{c.supplierName}</td>
            <td className="px-4 py-2.5">{c.item}</td>
            <td className="px-4 py-2.5">{c.expires}</td>
            <td className="px-4 py-2.5">
              <Badge
                tone={c.status === 'valid' ? 'ok' : c.status === 'expiring' ? 'warn' : 'danger'}
              >
                {c.status}
              </Badge>
            </td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  )
}

