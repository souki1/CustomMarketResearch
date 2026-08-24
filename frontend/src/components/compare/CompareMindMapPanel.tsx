import { useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { type CompareDecisionRow } from './CompareDecisionWorkspace'

type Props = {
  partLabel: string
  rows: CompareDecisionRow[]
  onViewChange: (v: 'table' | 'insights' | 'mindmap') => void
  onAddToBucket?: (id: string) => void
}

type SortMode = 'price' | 'score'
type Tier = 'best' | 'good' | 'mid' | 'high'

type MindMapVendor = {
  id: string
  n: string
  sh: string
  p: number | null
  sc: number | null
  ct: string
  dl: string
  td: boolean
  url: string
}

const TIER_LIGHT: Record<Tier, { fill: string; stroke: string; text: string; dot: string }> = {
  best: { fill: '#EAF3DE', stroke: '#1D9E75', text: '#27500A', dot: '#1D9E75' },
  good: { fill: '#E6F1FB', stroke: '#185FA5', text: '#0C447C', dot: '#378ADD' },
  mid: { fill: '#FAEEDA', stroke: '#854F0B', text: '#633806', dot: '#EF9F27' },
  high: { fill: '#FAECE7', stroke: '#993C1D', text: '#712B13', dot: '#D85A30' },
}

const CX = 340
const CY = 290
const VR = 148
const LR = 238
const NW = 118
const NH = 50

function shortVendorName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= 14) return trimmed
  const first = trimmed.split(/\s+/)[0]
  if (first.length >= 4 && first.length <= 14) return first
  return `${trimmed.slice(0, 12)}…`
}

function scoreValue(row: CompareDecisionRow): number | null {
  if (row.rating == null || Number.isNaN(row.rating)) return null
  return Math.round(row.rating)
}

function fromRow(row: CompareDecisionRow): MindMapVendor {
  const delivery = row.delivery?.trim() || '—'
  const deliveryLower = delivery.toLowerCase()
  return {
    id: row.id,
    n: row.vendor,
    sh: shortVendorName(row.vendor),
    p: row.price,
    sc: scoreValue(row),
    ct: row.contact?.trim() || '—',
    dl: delivery,
    td: deliveryLower.includes('today') || deliveryLower.includes('same day'),
    url: row.url,
  }
}

function getTier(vendor: MindMapVendor, mode: SortMode): Tier {
  if (mode === 'score') {
    const score = vendor.sc ?? 0
    if (score >= 70) return 'best'
    if (score >= 50) return 'good'
    if (score >= 30) return 'mid'
    return 'high'
  }
  const price = vendor.p ?? Number.POSITIVE_INFINITY
  if (price < 35) return 'best'
  if (price < 50) return 'good'
  if (price < 70) return 'mid'
  return 'high'
}

function vendorPosition(index: number, total: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(1, total)
  return { x: CX + VR * Math.cos(angle), y: CY + VR * Math.sin(angle), a: angle }
}

function money(price: number | null): string {
  if (price == null || Number.isNaN(price)) return '—'
  return `$${price.toFixed(2)}`
}

export function CompareMindMapPanel({ partLabel, rows, onViewChange, onAddToBucket }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<SortMode>('price')

  const vendors = useMemo(
    () =>
      [...rows]
        .map(fromRow)
        .sort((a, b) => (a.p ?? Number.POSITIVE_INFINITY) - (b.p ?? Number.POSITIVE_INFINITY)),
    [rows]
  )

  const avgPrice = useMemo(() => {
    const prices = vendors.map((vendor) => vendor.p).filter((price): price is number => price != null)
    if (prices.length === 0) return null
    return prices.reduce((sum, price) => sum + price, 0) / prices.length
  }, [vendors])

  useEffect(() => {
    setSelectedId((current) => (current && vendors.some((vendor) => vendor.id === current) ? current : null))
  }, [vendors, mode])

  const selectedIndex = vendors.findIndex((vendor) => vendor.id === selectedId)
  const selectedVendor = selectedIndex >= 0 ? vendors[selectedIndex] : null
  const selectedColors = selectedVendor ? TIER_LIGHT[getTier(selectedVendor, mode)] : null

  const leaves =
    selectedIndex >= 0
      ? (() => {
          const position = vendorPosition(selectedIndex, vendors.length)
          const vendor = vendors[selectedIndex]
          const priceLabel = money(vendor.p)
          const score = vendor.sc ?? 0
          return [
            { da: -30, label: priceLabel, col: '#1D9E75' },
            {
              da: 0,
              label: vendor.td ? 'Ships today' : 'No same-day',
              col: vendor.td ? '#1D9E75' : '#888780',
            },
            {
              da: 30,
              label: vendor.sc != null ? `Score ${vendor.sc}` : 'Score —',
              col: score > 60 ? '#185FA5' : score > 30 ? '#854F0B' : '#A32D2D',
            },
          ].map((leaf) => {
            const leafAngle = position.a + (leaf.da * Math.PI) / 180
            return {
              ...leaf,
              x: CX + LR * Math.cos(leafAngle),
              y: CY + LR * Math.sin(leafAngle),
              px: position.x,
              py: position.y,
            }
          })
        })()
      : []

  function toggleVendor(id: string) {
    setSelectedId((current) => (current === id ? null : id))
  }

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-[#f7f5f0] text-[#1a1a18]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e0ddd4] bg-white px-4 py-2.5">
        <div className="min-w-0">
          <span className="font-mono text-sm font-medium text-slate-900">{partLabel}</span>
          <span className="ml-2 text-xs text-[#73726c]">
            · {vendors.length} vendors · click a node to expand
          </span>
        </div>
        <div className="flex gap-1.5">
          {(['price', 'score'] as const).map((sortMode) => (
            <button
              key={sortMode}
              type="button"
              onClick={() => setMode(sortMode)}
              className={`rounded px-2.5 py-1 text-[11px] transition-colors ${
                mode === sortMode
                  ? 'border border-[#185FA5] bg-[#E6F1FB] text-[#0C447C]'
                  : 'border border-[#c8c6be] bg-[#f7f5f0] text-[#73726c] hover:bg-white'
              }`}
            >
              By {sortMode}
            </button>
          ))}
        </div>
      </div>

      <div className="flex border-b border-[#e0ddd4] bg-white px-4">
        {(['table', 'insights', 'mindmap'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onViewChange(tab)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === 'mindmap'
                ? 'border-b-2 border-[#378ADD] font-medium text-[#185FA5]'
                : 'border-b-2 border-transparent text-[#73726c] hover:text-slate-700'
            }`}
          >
            {tab === 'table' ? 'Table' : tab === 'insights' ? 'Insights' : 'Mind map'}
          </button>
        ))}
      </div>

      <svg width="100%" viewBox="0 0 680 580" className="block bg-[#f7f5f0]" role="img" aria-label="Vendor mind map">
        {vendors.map((vendor, index) => {
          const position = vendorPosition(index, vendors.length)
          const isSelected = selectedId === vendor.id
          return (
            <line
              key={`line-${vendor.id}`}
              x1={CX}
              y1={CY}
              x2={position.x}
              y2={position.y}
              stroke={isSelected ? '#378ADD' : '#D3D1C7'}
              strokeWidth={isSelected ? 1.5 : 0.5}
            />
          )
        })}

        {leaves.map((leaf, index) => (
          <line
            key={`leaf-line-${index}`}
            x1={leaf.px}
            y1={leaf.py}
            x2={leaf.x}
            y2={leaf.y}
            stroke="#D3D1C7"
            strokeWidth={0.5}
            strokeDasharray="3,3"
          />
        ))}

        <rect x={CX - 56} y={CY - 22} width={112} height={44} rx={22} fill="#378ADD" />
        <text
          x={CX}
          y={CY - 5}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight={500}
          fill="#E6F1FB"
          fontFamily="ui-monospace, monospace"
        >
          {partLabel}
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          fill="#B5D4F4"
        >
          {vendors.length} vendor{vendors.length === 1 ? '' : 's'}
        </text>

        {leaves.map((leaf, index) => (
          <g key={`leaf-${index}`}>
            <rect x={leaf.x - 44} y={leaf.y - 11} width={88} height={22} rx={11} fill="#f7f5f0" stroke="#e0ddd4" strokeWidth={0.5} />
            <text
              x={leaf.x}
              y={leaf.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={10}
              fontWeight={500}
              fill={leaf.col}
              fontFamily="ui-monospace, monospace"
            >
              {leaf.label}
            </text>
          </g>
        ))}

        {vendors.map((vendor, index) => {
          const position = vendorPosition(index, vendors.length)
          const colors = TIER_LIGHT[getTier(vendor, mode)]
          const isSelected = selectedId === vendor.id
          const boxX = position.x - NW / 2
          const boxY = position.y - NH / 2
          return (
            <g key={vendor.id} onClick={() => toggleVendor(vendor.id)} className="cursor-pointer">
              <rect
                x={boxX}
                y={boxY}
                width={NW}
                height={NH}
                rx={8}
                fill={colors.fill}
                stroke={isSelected ? '#378ADD' : colors.stroke}
                strokeWidth={isSelected ? 2 : 0.5}
              />
              {isSelected && <rect x={boxX} y={boxY} width={NW} height={NH} rx={8} fill="#378ADD" opacity={0.07} />}
              <text
                x={position.x}
                y={position.y - 7}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontWeight={500}
                fill={colors.text}
              >
                {vendor.sh}
              </text>
              <text
                x={position.x}
                y={position.y + 9}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill={colors.text}
                fontFamily="ui-monospace, monospace"
                opacity={0.85}
              >
                {money(vendor.p)}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="flex flex-wrap items-center gap-3.5 border-t border-[#e0ddd4] bg-[#f7f5f0] px-4 py-2">
        <span className="text-[11px] text-[#73726c]">Price tier</span>
        {[
          ['#1D9E75', 'Best $22–35'],
          ['#378ADD', 'Good $35–50'],
          ['#EF9F27', 'Mid $50–70'],
          ['#D85A30', 'High $70+'],
        ].map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-[#73726c]">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </span>
        ))}
      </div>

      {selectedVendor && selectedColors && (
        <div className="mx-4 mb-4 rounded-xl border border-[#e0ddd4] bg-white p-3.5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-[15px] font-medium text-slate-900">{selectedVendor.n}</div>
              <div className="mt-1 font-mono text-xs text-[#73726c]">{selectedVendor.ct}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[22px] font-medium" style={{ color: selectedColors.text }}>
                {money(selectedVendor.p)}
              </div>
              {avgPrice != null && selectedVendor.p != null && (
                <div
                  className="mt-0.5 text-[11px]"
                  style={{ color: selectedVendor.p < avgPrice ? '#3B6D11' : '#A32D2D' }}
                >
                  {selectedVendor.p < avgPrice
                    ? `${(((avgPrice - selectedVendor.p) / avgPrice) * 100).toFixed(0)}% below avg`
                    : `+${(((selectedVendor.p - avgPrice) / avgPrice) * 100).toFixed(0)}% above avg`}
                </div>
              )}
            </div>
          </div>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              ['Delivery', selectedVendor.dl, '#1a1a18'],
              ['Score', selectedVendor.sc != null ? `${selectedVendor.sc} / 100` : '—', selectedColors.dot],
              ['Same-day', selectedVendor.td ? 'Yes' : 'No', selectedVendor.td ? '#1D9E75' : '#73726c'],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-md border border-[#e0ddd4] bg-[#f7f5f0] px-2.5 py-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-[#73726c]">{label}</div>
                <div className="text-xs font-medium" style={{ color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onAddToBucket?.(selectedVendor.id)}
              className="inline-flex items-center justify-center gap-1 rounded-md bg-[#378ADD] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2f78c2]"
            >
              Add to bucket
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => selectedVendor.url && window.open(selectedVendor.url, '_blank', 'noopener')}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[#c8c6be] bg-white px-3 py-2 text-xs font-medium text-[#73726c] transition-colors hover:bg-[#f7f5f0]"
            >
              Vendor profile
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
