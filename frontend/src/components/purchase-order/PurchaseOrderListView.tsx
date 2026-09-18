import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Calendar, ChevronDown, Eye, Filter, Loader2, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PURCHASE_ORDER_PATH } from '@/lib/paths'
import type { PortfolioItem, PurchaseOrderResponse } from '@/lib/api'
import { ScanQuotationModal, type ScannedOffer } from './ScanQuotationModal'
import { AiMark, StatusBadge } from './StatusBadge'
import {
  formatDisplayDate,
  formatMoneyUsd,
  isAiSourced,
  isInRevision,
  locationLabel,
  departmentLabel,
  poSubtotal,
  type StatusFilter,
} from './poShared'

type PurchaseOrderListViewProps = {
  token: string | null
  orders: PurchaseOrderResponse[]
  loading: boolean
  loadError: string | null
  saveError: string | null
  creating: boolean
  onCreateBlank: () => void
  onScanCreate: (offers: ScannedOffer[], vendorName: string) => void
  scanOffers: PortfolioItem[]
  scanLoading: boolean
  requesterEmail: string
}

export function PurchaseOrderListView({
  token,
  orders,
  loading,
  loadError,
  saveError,
  creating,
  onCreateBlank,
  onScanCreate,
  scanOffers,
  scanLoading,
  requesterEmail,
}: PurchaseOrderListViewProps) {
  const navigate = useNavigate()
  const [scanOpen, setScanOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [locationFilter, setLocationFilter] = useState('all')
  const [deliveryFilter, setDeliveryFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [sortKey, setSortKey] = useState<'id' | 'total' | 'delivery'>('id')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const draftCount = orders.filter((o) => o.status === 'draft' && !isInRevision(o)).length
  const revisionCount = orders.filter((o) => isInRevision(o)).length
  const pendingCount = orders.filter((o) => o.status === 'submitted').length

  const suppliers = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) {
      const v = o.vendor_name.trim()
      if (v) set.add(v)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [orders])

  const locations = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) set.add(locationLabel(o.ship_to))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [orders])

  const departments = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) set.add(departmentLabel(o.notes))
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [orders])

  const deliveries = useMemo(() => {
    const set = new Set<string>()
    for (const o of orders) {
      if (o.required_by.trim()) set.add(o.required_by.trim())
    }
    return [...set].sort()
  }, [orders])

  const filtered = useMemo(() => {
    const rows = orders.filter((o) => {
      if (statusFilter === 'in_revision' && !isInRevision(o)) return false
      if (statusFilter === 'draft' && (o.status !== 'draft' || isInRevision(o))) return false
      if (statusFilter !== 'all' && statusFilter !== 'in_revision' && statusFilter !== 'draft' && o.status !== statusFilter) {
        return false
      }
      if (supplierFilter !== 'all' && o.vendor_name.trim() !== supplierFilter) return false
      if (locationFilter !== 'all' && locationLabel(o.ship_to) !== locationFilter) return false
      if (deliveryFilter !== 'all' && o.required_by.trim() !== deliveryFilter) return false
      if (departmentFilter !== 'all' && departmentLabel(o.notes) !== departmentFilter) return false
      return true
    })
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'id') cmp = a.id - b.id
      else if (sortKey === 'total') cmp = poSubtotal(a) - poSubtotal(b)
      else cmp = a.required_by.localeCompare(b.required_by)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [orders, statusFilter, supplierFilter, locationFilter, deliveryFilter, departmentFilter, sortKey, sortDir])

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'id' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="min-h-full bg-[#F3F5FA] px-5 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#1B2559]">Purchase Orders</h1>
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#25245A] bg-white px-4 text-[13px] font-medium text-[#25245A] hover:bg-[#F3F5FA]"
                >
                  Scan Quotation
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem onSelect={() => setScanOpen(true)}>
                  From saved supplier quotes
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onCreateBlank()}>Create blank draft</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={onCreateBlank}
              disabled={!token || creating}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25245A] px-4 text-[13px] font-medium text-white hover:bg-[#1C1B45] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              Create
            </button>
          </div>
        </div>

        {!token && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
            <Link to="/signin" className="font-medium underline hover:no-underline">
              Sign in
            </Link>{' '}
            to load, create, and approve purchase orders.
          </div>
        )}
        {loadError && (
          <p className="mt-4 text-[13px] text-red-600" role="alert">
            {loadError}
          </p>
        )}
        {saveError && (
          <p className="mt-2 text-[13px] text-red-600" role="alert">
            {saveError}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <StatusChip
            count={draftCount}
            label="Draft"
            active={statusFilter === 'draft'}
            tone="neutral"
            onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
          />
          <StatusChip
            count={revisionCount}
            label="In revision"
            active={statusFilter === 'in_revision'}
            tone="warn"
            onClick={() => setStatusFilter(statusFilter === 'in_revision' ? 'all' : 'in_revision')}
          />
          <StatusChip
            count={pendingCount}
            label="Pending"
            active={statusFilter === 'submitted'}
            tone="warn"
            onClick={() => setStatusFilter(statusFilter === 'submitted' ? 'all' : 'submitted')}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all')
              setSupplierFilter('all')
              setLocationFilter('all')
              setDeliveryFilter('all')
              setDepartmentFilter('all')
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#25245A] px-3 text-[12px] font-medium text-white"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden />
            Filters
          </button>
          <FilterSelect
            icon={<Calendar className="h-3.5 w-3.5 text-[#8A91A8]" aria-hidden />}
            label="Delivery Date"
            value={deliveryFilter}
            options={deliveries.map((d) => ({ value: d, label: formatDisplayDate(d) }))}
            onChange={setDeliveryFilter}
          />
          <FilterSelect
            label="Status"
            value={statusFilter === 'all' || statusFilter === 'in_revision' ? statusFilter : statusFilter}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'in_revision', label: 'In revision' },
              { value: 'submitted', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'sent', label: 'Sent' },
              { value: 'partial', label: 'Not billed' },
              { value: 'closed', label: 'Paid' },
            ]}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
          <FilterSelect
            label="Location"
            value={locationFilter}
            options={locations.map((l) => ({ value: l, label: l }))}
            onChange={setLocationFilter}
          />
          <FilterSelect
            label="Supplier"
            value={supplierFilter}
            options={suppliers.map((s) => ({ value: s, label: s }))}
            onChange={setSupplierFilter}
          />
          <FilterSelect
            label="Departments"
            value={departmentFilter}
            options={departments.map((d) => ({ value: d, label: d }))}
            onChange={setDepartmentFilter}
          />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[#E8EBF3] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#EEF0F5] text-[12px] font-medium text-[#8A91A8]">
                  <th className="px-4 py-3">
                    <SortBtn active={sortKey === 'id'} dir={sortDir} onClick={() => toggleSort('id')}>
                      #
                    </SortBtn>
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Location / Requester</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3 text-right">
                    <SortBtn active={sortKey === 'total'} dir={sortDir} onClick={() => toggleSort('total')}>
                      Total
                    </SortBtn>
                  </th>
                  <th className="px-4 py-3">Related Documents</th>
                  <th className="px-4 py-3">
                    <SortBtn active={sortKey === 'delivery'} dir={sortDir} onClick={() => toggleSort('delivery')}>
                      Delivery Date
                    </SortBtn>
                  </th>
                  <th className="w-12 px-3 py-3" aria-label="View" />
                </tr>
              </thead>
              <tbody>
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#F3F5FA]">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="h-8 animate-pulse rounded-lg bg-[#F3F5FA]" />
                      </td>
                    </tr>
                  ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-[13px] text-[#8A91A8]">
                      No purchase orders match these filters.
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.map((o) => {
                    const money = formatMoneyUsd(poSubtotal(o))
                    return (
                      <tr
                        key={o.id}
                        className="cursor-pointer border-b border-[#F3F5FA] last:border-b-0 hover:bg-[#F8F9FD]"
                        onClick={() => navigate(`${PURCHASE_ORDER_PATH}/${o.id}`)}
                      >
                        <td className="px-4 py-3.5 tabular-nums font-medium text-[#1B2559]">{o.id}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col items-start">
                            <StatusBadge status={o.status} inRevision={isInRevision(o)} />
                            {isAiSourced(o) ? <AiMark /> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-medium text-[#1B2559]">{locationLabel(o.ship_to)}</p>
                          <p className="text-[12px] text-[#8A91A8]">{requesterEmail}</p>
                        </td>
                        <td className="px-4 py-3.5 text-[#3D4468]">{o.vendor_name.trim() || '—'}</td>
                        <td className="px-4 py-3.5 text-right">
                          <p className="tabular-nums font-medium text-[#1B2559]">{money.amount}</p>
                          <p className="text-[11px] text-[#8A91A8]">{money.currency}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          {o.status === 'approved' || o.status === 'sent' || o.status === 'partial' || o.status === 'closed' ? (
                            <span className="text-[#5B5CE6]">Purchase Orders #{o.id}</span>
                          ) : (
                            <span className="text-[#C5CAD8]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-[#3D4468]">{formatDisplayDate(o.required_by)}</td>
                        <td className="px-3 py-3.5">
                          <Link
                            to={`${PURCHASE_ORDER_PATH}/${o.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#8A91A8] hover:bg-[#F3F5FA] hover:text-[#25245A]"
                            aria-label={`View purchase order ${o.number}`}
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ScanQuotationModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        offers={scanOffers}
        loading={scanLoading}
        creating={creating}
        onCreate={(offers, vendorName) => {
          onScanCreate(offers, vendorName)
          setScanOpen(false)
        }}
      />
    </div>
  )
}

function StatusChip({
  count,
  label,
  active,
  tone,
  onClick,
}: {
  count: number
  label: string
  active: boolean
  tone: 'neutral' | 'warn'
  onClick: () => void
}) {
  const circle =
    tone === 'warn'
      ? 'bg-[#F97316] text-white'
      : 'bg-[#EEF0F5] text-[#1B2559]'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 rounded-2xl border bg-white px-4 py-2.5 text-left shadow-[0_1px_0_rgba(28,37,89,0.04)] ${
        active ? 'border-[#5B5CE6] ring-2 ring-[#5B5CE6]/15' : 'border-[#E8EBF3]'
      }`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${circle}`}>
        {count}
      </span>
      <span className="text-[13px] font-medium text-[#1B2559]">{label}</span>
    </button>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  icon,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  icon?: ReactNode
}) {
  const selected = options.find((o) => o.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E4E7F2] bg-white px-3 text-[12px] font-medium text-[#3D4468] hover:bg-[#F8F9FD]"
        >
          {icon}
          {selected ? selected.label : label}
          <ChevronDown className="h-3.5 w-3.5 text-[#8A91A8]" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => onChange('all')}>All {label.toLowerCase()}</DropdownMenuItem>
        {options.map((opt) => (
          <DropdownMenuItem key={opt.value} onSelect={() => onChange(opt.value)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SortBtn({
  children,
  active,
  dir,
  onClick,
}: {
  children: ReactNode
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#8A91A8] hover:text-[#1B2559]"
    >
      {children}
      <ChevronDown className={`h-3 w-3 transition ${active && dir === 'asc' ? 'rotate-180' : ''}`} aria-hidden />
    </button>
  )
}
