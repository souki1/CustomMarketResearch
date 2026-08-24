import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CompareVendorMindMapModel } from '@/components/compare/CompareVendorMindMap'
import { CompareInsightsPanel } from '@/components/compare/CompareInsightsPanel'
import { CompareMindMapPanel } from '@/components/compare/CompareMindMapPanel'
import { CompareSparkAiPanel } from '@/components/compare/CompareSparkAiPanel'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart2,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  Download,
  ExternalLink,
  Filter,
  Heart,
  Layers,
  List,
  Loader2,
  Map as MapIcon,
  Scale,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Store,
  Trophy,
  X,
  Zap,
} from 'lucide-react'
import { getToken } from '@/lib/auth'
import { aiGroqChat } from '@/lib/api'

/** Standard scraped fields shared across vendors (long-tail nested keys are opt-in). */
const COMMON_VENDOR_INFO_KEYS = new Set(
  [
    'contact',
    'delivery',
    'location',
    'price',
    'product_description',
    'product_image',
    'vendor_name',
    'availability',
    'shipping',
    'rating',
    'source_urls',
  ].map((k) => k.toLowerCase())
)

function isCommonVendorInfoField(flatKey: string): boolean {
  const n = flatKey.trim().toLowerCase()
  if (!n) return false
  if (COMMON_VENDOR_INFO_KEYS.has(n)) return true
  const leaf = n.includes('.') ? n.slice(n.lastIndexOf('.') + 1) : n
  return COMMON_VENDOR_INFO_KEYS.has(leaf)
}

function extractRowDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return String(url ?? '').trim().toLowerCase()
  }
}

export type CompareDecisionView = 'table' | 'insights' | 'mindmap' | 'decisions'
export type CompareDecisionLens = 'pricing' | 'leadTime' | 'vendor'

export type CompareDecisionRow = {
  id: string
  url: string
  vendor: string
  price: number | null
  priceLabel: string
  shipping: number | null
  shippingLabel: string
  availability: string
  rating: number | null
  ratingLabel: string
  delivery: string
  location: string
  contact: string
  /** Product image from scraped source data when available. */
  imageUrl?: string | null
  rawData: Record<string, unknown>
  /** Owning part when comparing multiple sheet rows. */
  partId?: string
  partLabel?: string
}

export type ComparePartChip = {
  id: string
  label: string
  vendorCount: number
  selected: boolean
  inPortfolio?: boolean
}

export type CompareLoadedFile = {
  fileId: number
  name: string
}

type Props = {
  partLabel: string
  partCategory?: string
  rows: CompareDecisionRow[]
  filteredRows: CompareDecisionRow[]
  vendorFilter: string
  vendors: string[]
  onVendorFilterChange: (vendor: string) => void
  onlyAvailable: boolean
  onOnlyAvailableChange: (checked: boolean) => void
  minPrice: number
  maxPrice: number
  priceRange: [number, number]
  onPriceRangeChange: (next: [number, number]) => void
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onAddSelectedToBucket: () => void
  onCompareSelected: () => void
  onAddSingleToBucket: (id: string) => void
  availableFields: string[]
  selectedFields: string[]
  onSelectedFieldsChange: (fields: string[]) => void
  view: CompareDecisionView
  onViewChange: (next: CompareDecisionView) => void
  mindMapModel: CompareVendorMindMapModel | null
  onSelectVendorFromMindMap: (vendor: string) => void
  onExportCSV?: () => void
  onSaveView?: () => void
  partChips?: ComparePartChip[]
  activePartId?: string | null
  onActivePartChange?: (id: string) => void
  onPartChipToggle?: (id: string) => void
  onClearPartSelection?: () => void
  selectedPartCount?: number
  fileName?: string
  onChangeFile?: () => void
  loadedFiles?: CompareLoadedFile[]
  activeFileId?: number | null
  onSelectFile?: (fileId: number) => void
  onRemoveFile?: (fileId: number) => void
  /** Domains shared across ≥2 selected parts — used by “Common vendors”. */
  commonVendorDomains?: string[]
  /** All selected parts' vendor rows for the decision board (not just the active part). */
  decisionBoardRows?: CompareDecisionRow[]
  /** Hide the Decisions tab when a parent wizard already has a Decide step. */
  hideDecisionsTab?: boolean
}

function money(n: number | null, fallback: string): string {
  if (n == null || Number.isNaN(n)) return fallback
  return `$${n.toFixed(2)}`
}

function pickFirstFieldValue(data: Record<string, unknown>, candidates: RegExp[]): string | null {
  for (const [k, v] of Object.entries(data)) {
    if (!candidates.some((rx) => rx.test(k))) continue
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      const s = String(v).trim()
      if (s) return s
    }
  }
  return null
}

function parseMoneyValue(raw: string | null): number | null {
  if (!raw) return null
  const m = raw.replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

function vendorNameFromSourceData(data: Record<string, unknown>, url: string): string {
  const preferredKeys = [
    'vendor_name',
    'vendor',
    'seller',
    'store_name',
    'manufacturer',
    'brand',
    'company',
    'supplier',
  ]
  for (const key of preferredKeys) {
    const val = data[key]
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  for (const [key, val] of Object.entries(data)) {
    if (!/(vendor|seller|store|manufacturer|brand|company|supplier)/i.test(key)) continue
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return extractRowDomain(url) || 'Unknown vendor'
}

function parseLeadTimeDays(raw: string): number | null {
  const d = (raw || '').toLowerCase().trim()
  if (!d || d === '—') return null
  if (/today|same[\s-]?day/.test(d)) return 0
  if (/overnight|next[\s-]?day/.test(d)) return 1
  const range = d.match(/(\d+)\s*(?:-|to|–)\s*(\d+)\s*(?:business\s+)?days?/)
  if (range) return Number(range[1])
  const weeks = d.match(/(\d+)\s*weeks?/)
  if (weeks) return Number(weeks[1]) * 7
  const days = d.match(/(\d+)\s*(?:business\s+)?days?/)
  if (days) return Number(days[1])
  const hours = d.match(/(\d+)\s*(?:hr|hrs|hour|hours)/)
  if (hours) return Math.max(0, Math.ceil(Number(hours[1]) / 24))
  return null
}

function formatLeadDays(n: number | null, fallback = 'Unknown'): string {
  if (n == null) return fallback
  if (n <= 0) return 'Ships today'
  if (n === 1) return '1 day'
  return `${n} days`
}

function isInStock(availability: string): boolean {
  return /in stock|available|low stock/i.test(availability)
}

export function rowsFromScrapedSources(
  sources: Array<{ url: string; data: Record<string, unknown> }>,
  part: { id: string; label: string }
): CompareDecisionRow[] {
  return sources.map((item, idx) => {
    const data = (item.data ?? {}) as Record<string, unknown>
    const vendor = vendorNameFromSourceData(data, item.url)
    const priceRaw = pickFirstFieldValue(data, [/^price$/i, /price/i, /cost/i, /amount/i, /msrp/i])
    const shippingRaw = pickFirstFieldValue(data, [/shipping/i, /delivery.?cost/i, /freight/i])
    const availabilityRaw = pickFirstFieldValue(data, [/availability/i, /stock/i, /status/i]) ?? 'Unknown'
    const ratingRaw = pickFirstFieldValue(data, [/rating/i, /score/i, /stars?/i])
    const delivery = pickFirstFieldValue(data, [/delivery/i, /eta/i, /lead.?time/i]) ?? '—'
    const location = pickFirstFieldValue(data, [/location/i, /country/i, /city/i, /region/i]) ?? '—'
    const contact = pickFirstFieldValue(data, [/contact/i, /phone/i, /email/i, /support/i]) ?? '—'
    const priceNumber = parseMoneyValue(priceRaw)
    const shippingNumber = parseMoneyValue(shippingRaw)
    const ratingNumber = ratingRaw ? Number(ratingRaw.replace(/[^\d.]/g, '')) : null
    return {
      id: `${part.id}::${item.url}::${idx}`,
      url: item.url,
      vendor,
      price: priceNumber,
      priceLabel: priceRaw ?? '—',
      shipping: shippingNumber,
      shippingLabel: shippingRaw ?? '—',
      availability: availabilityRaw,
      rating: Number.isFinite(ratingNumber ?? NaN) ? ratingNumber : null,
      ratingLabel: ratingRaw ?? '—',
      delivery,
      location,
      contact,
      rawData: data,
      partId: part.id,
      partLabel: part.label,
    }
  })
}

type DecisionCandidate = {
  id: string
  label: string
  rows: CompareDecisionRow[]
  bestPrice: number | null
  avgPrice: number | null
  bestPriceRow: CompareDecisionRow | null
  fastestDays: number | null
  fastestRow: CompareDecisionRow | null
  shipsTodayCount: number
  inStockCount: number
  vendorCount: number
  topVendor: { name: string; offers: number; bestPrice: number | null; inStock: number } | null
}

function groupDecisionCandidates(rows: CompareDecisionRow[]): DecisionCandidate[] {
  const byPart = new Map<string, CompareDecisionRow[]>()
  for (const row of rows) {
    const key = (row.partId || '').trim()
    if (!key) continue
    const list = byPart.get(key)
    if (list) list.push(row)
    else byPart.set(key, [row])
  }
  const useVendors = byPart.size <= 1
  const groups: { id: string; label: string; rows: CompareDecisionRow[] }[] = useVendors
    ? rows.map((row) => ({
        id: row.id,
        label: row.vendor || extractRowDomain(row.url) || row.id,
        rows: [row],
      }))
    : [...byPart.entries()].map(([id, list]) => ({
        id,
        label: list[0]?.partLabel?.trim() || id,
        rows: list,
      }))

  return groups.map((g) => {
    const priced = g.rows.filter((r) => r.price != null)
    const bestPrice = priced.length ? Math.min(...priced.map((r) => r.price!)) : null
    const avgPrice = priced.length
      ? priced.reduce((sum, r) => sum + (r.price ?? 0), 0) / priced.length
      : null
    const bestPriceRow =
      bestPrice != null ? g.rows.find((r) => r.price === bestPrice) ?? null : null
    let fastestDays: number | null = null
    let fastestRow: CompareDecisionRow | null = null
    let shipsTodayCount = 0
    let inStockCount = 0
    for (const row of g.rows) {
      const days = parseLeadTimeDays(row.delivery)
      if (days != null && (fastestDays == null || days < fastestDays)) {
        fastestDays = days
        fastestRow = row
      }
      const d = (row.delivery || '').toLowerCase()
      if (d.includes('today') || d.includes('same day') || days === 0) shipsTodayCount += 1
      if (isInStock(row.availability)) inStockCount += 1
    }
    const vendorMap = new Map<string, { offers: number; bestPrice: number | null; inStock: number }>()
    for (const row of g.rows) {
      const name = row.vendor.trim() || extractRowDomain(row.url) || 'Unknown vendor'
      const prev = vendorMap.get(name) ?? { offers: 0, bestPrice: null, inStock: 0 }
      prev.offers += 1
      if (row.price != null && (prev.bestPrice == null || row.price < prev.bestPrice)) {
        prev.bestPrice = row.price
      }
      if (isInStock(row.availability)) prev.inStock += 1
      vendorMap.set(name, prev)
    }
    const topVendor =
      [...vendorMap.entries()]
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => {
          if (b.inStock !== a.inStock) return b.inStock - a.inStock
          if (b.offers !== a.offers) return b.offers - a.offers
          return (a.bestPrice ?? Infinity) - (b.bestPrice ?? Infinity)
        })[0] ?? null
    return {
      ...g,
      bestPrice,
      avgPrice,
      bestPriceRow,
      fastestDays,
      fastestRow,
      shipsTodayCount,
      inStockCount,
      vendorCount: vendorMap.size,
      topVendor,
    }
  })
}

type DecisionCardModel = {
  lens: CompareDecisionLens
  number: string
  title: string
  Icon: typeof DollarSign
  winner: DecisionCandidate | null
  metric: string
  why: string
  runnerUp: string
  winnerRow: CompareDecisionRow | null
}

function buildDecisionCards(candidates: DecisionCandidate[]): DecisionCardModel[] {
  const priced = candidates.filter((c) => c.bestPrice != null)
  const pricedSorted = [...priced].sort((a, b) => (a.bestPrice ?? Infinity) - (b.bestPrice ?? Infinity))
  const priceWinner = pricedSorted[0] ?? null
  const priceRunner = pricedSorted[1] ?? null
  let priceWhy = 'No priced offers were found for these parts.'
  if (priceWinner && priceWinner.bestPrice != null) {
    const vendor = priceWinner.bestPriceRow?.vendor ?? 'a listed vendor'
    if (priceRunner && priceRunner.bestPrice != null) {
      const delta = priceRunner.bestPrice - priceWinner.bestPrice
      priceWhy =
        delta > 0
          ? `Lowest offer is ${money(priceWinner.bestPrice, '—')} from ${vendor}. That is ${money(delta, '$0')} below ${priceRunner.label}'s best (${money(priceRunner.bestPrice, '—')}). Average listed price is ${money(priceWinner.avgPrice, '—')}.`
          : `Best listed prices match at ${money(priceWinner.bestPrice, '—')}. ${priceWinner.label} still wins on more priced offers (${priced.filter((c) => c.id === priceWinner.id)[0]?.rows.length ?? 0}).`
    } else {
      priceWhy = `Only ${priceWinner.label} has a usable price: ${money(priceWinner.bestPrice, '—')} from ${vendor}.`
    }
  }

  const timed = candidates.filter((c) => c.fastestDays != null)
  const timedSorted = [...timed].sort((a, b) => {
    if ((a.fastestDays ?? Infinity) !== (b.fastestDays ?? Infinity)) {
      return (a.fastestDays ?? Infinity) - (b.fastestDays ?? Infinity)
    }
    return b.shipsTodayCount - a.shipsTodayCount
  })
  const leadWinner = timedSorted[0] ?? null
  const leadRunner = timedSorted[1] ?? null
  let leadWhy = 'No delivery or lead-time values were found in the research sources.'
  if (leadWinner) {
    const via = leadWinner.fastestRow?.vendor ?? 'a listed vendor'
    if (leadRunner && leadRunner.fastestDays != null && leadWinner.fastestDays != null) {
      const gap = leadRunner.fastestDays - leadWinner.fastestDays
      leadWhy =
        gap > 0
          ? `Fastest source ships in ${formatLeadDays(leadWinner.fastestDays)} via ${via}, ${gap} day${gap === 1 ? '' : 's'} ahead of ${leadRunner.label} (${formatLeadDays(leadRunner.fastestDays)}). ${leadWinner.shipsTodayCount} source${leadWinner.shipsTodayCount === 1 ? '' : 's'} ship today.`
          : `Both can ship in ${formatLeadDays(leadWinner.fastestDays)}. ${leadWinner.label} has more same-day options (${leadWinner.shipsTodayCount} vs ${leadRunner.shipsTodayCount}).`
    } else {
      leadWhy = `Fastest available lead time is ${formatLeadDays(leadWinner.fastestDays)} via ${via}. ${leadWinner.shipsTodayCount} source${leadWinner.shipsTodayCount === 1 ? '' : 's'} ship today.`
    }
  }

  const vendorSorted = [...candidates].sort((a, b) => {
    const aScore = a.inStockCount * 3 + a.vendorCount * 2 + (a.topVendor?.offers ?? 0)
    const bScore = b.inStockCount * 3 + b.vendorCount * 2 + (b.topVendor?.offers ?? 0)
    if (bScore !== aScore) return bScore - aScore
    return (a.bestPrice ?? Infinity) - (b.bestPrice ?? Infinity)
  })
  const vendorWinner = vendorSorted[0] ?? null
  const vendorRunner = vendorSorted[1] ?? null
  let vendorWhy = 'No vendor coverage data is available yet.'
  if (vendorWinner?.topVendor) {
    const tv = vendorWinner.topVendor
    vendorWhy = `Strongest coverage is ${tv.name} for ${vendorWinner.label}: ${tv.offers} offer${tv.offers === 1 ? '' : 's'}, ${tv.inStock} in stock${tv.bestPrice != null ? `, best ${money(tv.bestPrice, '—')}` : ''}. ${vendorWinner.label} has ${vendorWinner.vendorCount} unique vendor${vendorWinner.vendorCount === 1 ? '' : 's'} and ${vendorWinner.inStockCount} in-stock listing${vendorWinner.inStockCount === 1 ? '' : 's'}.`
    if (vendorRunner) {
      vendorWhy += ` ${vendorRunner.label} has ${vendorRunner.vendorCount} vendor${vendorRunner.vendorCount === 1 ? '' : 's'}.`
    }
  }

  return [
    {
      lens: 'pricing',
      number: '01',
      title: 'Pricing',
      Icon: DollarSign,
      winner: priceWinner,
      metric: priceWinner ? money(priceWinner.bestPrice, '—') : '—',
      why: priceWhy,
      runnerUp: priceRunner ? `${priceRunner.label} · ${money(priceRunner.bestPrice, '—')}` : 'No runner-up',
      winnerRow: priceWinner?.bestPriceRow ?? null,
    },
    {
      lens: 'leadTime',
      number: '02',
      title: 'Lead time',
      Icon: Clock,
      winner: leadWinner,
      metric: formatLeadDays(leadWinner?.fastestDays ?? null, '—'),
      why: leadWhy,
      runnerUp: leadRunner
        ? `${leadRunner.label} · ${formatLeadDays(leadRunner.fastestDays)}`
        : 'No runner-up',
      winnerRow: leadWinner?.fastestRow ?? null,
    },
    {
      lens: 'vendor',
      number: '03',
      title: 'Vendor',
      Icon: Store,
      winner: vendorWinner,
      metric: vendorWinner?.topVendor?.name ?? vendorWinner?.label ?? '—',
      why: vendorWhy,
      runnerUp: vendorRunner
        ? `${vendorRunner.label} · ${vendorRunner.vendorCount} vendor${vendorRunner.vendorCount === 1 ? '' : 's'}`
        : 'No runner-up',
      winnerRow:
        vendorWinner?.rows.find((r) => r.vendor === vendorWinner.topVendor?.name) ??
        vendorWinner?.bestPriceRow ??
        null,
    },
  ]
}

const VENDOR_PICK_PREFIX = 'vendor::'

function vendorPickId(name: string): string {
  return `${VENDOR_PICK_PREFIX}${name}`
}

function parseVendorPickName(id: string | null | undefined): string | null {
  if (!id || !id.startsWith(VENDOR_PICK_PREFIX)) return null
  const name = id.slice(VENDOR_PICK_PREFIX.length).trim()
  return name || null
}

type StrategyTab = 'consolidation' | 'delivery' | 'price'

type VendorStrategyLineStatus = 'best-price' | 'fastest' | 'standard'

type VendorStrategyLine = {
  partId: string
  partLabel: string
  partName: string
  row: CompareDecisionRow
  days: number | null
  price: number | null
  qty: number
  extended: number | null
  status: VendorStrategyLineStatus
}

type VendorStrategyCard = {
  vendor: string
  description: string
  lines: VendorStrategyLine[]
  subtotal: number | null
  minDays: number | null
  coverCount: number
  totalUnits: number
}

function clampQty(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 1
  return Math.min(99999, Math.max(1, Math.floor(v)))
}

function qtyForPart(quantities: Record<string, number> | undefined, partId: string): number {
  return clampQty(quantities?.[partId] ?? 1)
}

function vendorKeyFromRow(row: CompareDecisionRow): string {
  return row.vendor.trim() || extractRowDomain(row.url) || 'Unknown vendor'
}

function partNameFromRow(row: CompareDecisionRow): string {
  const fromData = pickFirstFieldValue(row.rawData ?? {}, [
    /product_description/i,
    /product_name/i,
    /description/i,
    /^title$/i,
  ])
  if (fromData && fromData !== '—') return fromData
  return row.partLabel?.trim() || '—'
}

function compactPartId(row: CompareDecisionRow): string {
  const label = row.partLabel?.trim()
  if (label) return label
  const id = row.partId?.trim()
  if (!id) return '—'
  const fileMatch = id.match(/^file-\d+-(.+)$/)
  return fileMatch?.[1] ?? id
}

function lineStatus(args: {
  price: number | null
  days: number | null
  bestPrice: number | null
  fastestDays: number | null
}): VendorStrategyLineStatus {
  const isBest =
    args.price != null && args.bestPrice != null && args.price === args.bestPrice
  const isFast =
    args.days != null && args.fastestDays != null && args.days === args.fastestDays
  if (isBest) return 'best-price'
  if (isFast) return 'fastest'
  return 'standard'
}

function buildVendorStrategyCards(
  rows: CompareDecisionRow[],
  quantities?: Record<string, number>
): VendorStrategyCard[] {
  const partIds = [
    ...new Set(rows.map((r) => (r.partId || '').trim()).filter(Boolean)),
  ]
  const totalParts = partIds.length > 0 ? partIds.length : 1
  const bestPriceByPart = new Map<string, number>()
  const fastestByPart = new Map<string, number>()
  for (const row of rows) {
    const partId = (row.partId || row.id).trim()
    if (row.price != null) {
      const prev = bestPriceByPart.get(partId)
      if (prev == null || row.price < prev) bestPriceByPart.set(partId, row.price)
    }
    const days = parseLeadTimeDays(row.delivery)
    if (days != null) {
      const prev = fastestByPart.get(partId)
      if (prev == null || days < prev) fastestByPart.set(partId, days)
    }
  }

  const byVendor = new Map<string, CompareDecisionRow[]>()
  for (const row of rows) {
    const key = vendorKeyFromRow(row)
    const list = byVendor.get(key)
    if (list) list.push(row)
    else byVendor.set(key, [row])
  }

  return [...byVendor.entries()].map(([vendor, list]) => {
    const byPart = new Map<string, CompareDecisionRow[]>()
    for (const row of list) {
      const partId = (row.partId || row.id).trim()
      const bucket = byPart.get(partId)
      if (bucket) bucket.push(row)
      else byPart.set(partId, [row])
    }
    const lines: VendorStrategyLine[] = [...byPart.entries()].map(([partId, offers]) => {
      const priced = offers.filter((r) => r.price != null)
      const bestOffer =
        [...priced].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0] ??
        [...offers].sort((a, b) => {
          const da = parseLeadTimeDays(a.delivery) ?? Infinity
          const db = parseLeadTimeDays(b.delivery) ?? Infinity
          return da - db
        })[0] ??
        offers[0]!
      const price = bestOffer.price
      const days = parseLeadTimeDays(bestOffer.delivery)
      const qty = qtyForPart(quantities, partId)
      const extended = price != null ? price * qty : null
      return {
        partId,
        partLabel: bestOffer.partLabel?.trim() || partId,
        partName: partNameFromRow(bestOffer),
        row: bestOffer,
        days,
        price,
        qty,
        extended,
        status: lineStatus({
          price,
          days,
          bestPrice: bestPriceByPart.get(partId) ?? null,
          fastestDays: fastestByPart.get(partId) ?? null,
        }),
      }
    })
    lines.sort((a, b) => a.partLabel.localeCompare(b.partLabel))
    const extendedLines = lines.filter((l) => l.extended != null)
    const subtotal = extendedLines.length
      ? extendedLines.reduce((sum, l) => sum + (l.extended ?? 0), 0)
      : null
    const timed = lines.map((l) => l.days).filter((n): n is number => n != null)
    const minDays = timed.length ? Math.min(...timed) : null
    const coverCount = lines.length
    const totalUnits = lines.reduce((sum, l) => sum + l.qty, 0)
    const description =
      coverCount === totalParts
        ? `Covers all ${totalParts} selected part${totalParts === 1 ? '' : 's'} · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}.`
        : `Covers ${coverCount} of ${totalParts} selected parts · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}.`
    return { vendor, description, lines, subtotal, minDays, coverCount, totalUnits }
  })
}

function rankVendorStrategyCards(
  rows: CompareDecisionRow[],
  tab: StrategyTab,
  quantities?: Record<string, number>
): VendorStrategyCard[] {
  const cards = buildVendorStrategyCards(rows, quantities)
  const sorted = [...cards]
  switch (tab) {
    case 'consolidation':
      sorted.sort((a, b) => {
        if (b.coverCount !== a.coverCount) return b.coverCount - a.coverCount
        if (b.totalUnits !== a.totalUnits) return b.totalUnits - a.totalUnits
        return (a.subtotal ?? Infinity) - (b.subtotal ?? Infinity)
      })
      return sorted
    case 'delivery':
      sorted.sort((a, b) => {
        if ((a.minDays ?? Infinity) !== (b.minDays ?? Infinity)) {
          return (a.minDays ?? Infinity) - (b.minDays ?? Infinity)
        }
        if (b.coverCount !== a.coverCount) return b.coverCount - a.coverCount
        return (a.subtotal ?? Infinity) - (b.subtotal ?? Infinity)
      })
      return sorted
    case 'price':
      sorted.sort((a, b) => {
        if ((a.subtotal ?? Infinity) !== (b.subtotal ?? Infinity)) {
          return (a.subtotal ?? Infinity) - (b.subtotal ?? Infinity)
        }
        return b.coverCount - a.coverCount
      })
      return sorted
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

export function recommendedPicksFromRows(
  rows: CompareDecisionRow[]
): Record<CompareDecisionLens, string | null> {
  const cards = buildDecisionCards(groupDecisionCandidates(rows))
  const byLens = new Map(cards.map((c) => [c.lens, c.winner?.id ?? null]))
  const ranked = rankVendorStrategyCards(rows, 'consolidation')
  return {
    pricing: byLens.get('pricing') ?? null,
    leadTime: byLens.get('leadTime') ?? null,
    vendor: ranked[0] ? vendorPickId(ranked[0].vendor) : byLens.get('vendor') ?? null,
  }
}

export type DecisionSummaryLine = {
  lens: CompareDecisionLens
  title: string
  winnerLabel: string
  metric: string
  why: string
  vendor: string
  priceLabel: string
  delivery: string
  url: string
}

export function buildDecisionSummary(
  rows: CompareDecisionRow[],
  picks: Record<CompareDecisionLens, string | null>
): DecisionSummaryLine[] {
  const candidates = groupDecisionCandidates(rows)
  const cards = buildDecisionCards(candidates)
  return cards.map((card) => {
    const id = picks[card.lens] ?? card.winner?.id ?? null
    const vendorName = card.lens === 'vendor' ? parseVendorPickName(id) : null
    const cand = vendorName
      ? null
      : candidates.find((c) => c.id === id) ?? card.winner
    let row: CompareDecisionRow | null = null
    switch (card.lens) {
      case 'pricing':
        row = cand?.bestPriceRow ?? null
        break
      case 'leadTime':
        row = cand?.fastestRow ?? null
        break
      case 'vendor': {
        if (vendorName) {
          const fromVendor = rows.filter((r) => vendorKeyFromRow(r) === vendorName)
          const priced = fromVendor.filter((r) => r.price != null)
          row =
            [...priced].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0] ??
            fromVendor[0] ??
            null
        } else {
          row =
            cand?.rows.find((r) => r.vendor === cand.topVendor?.name) ?? cand?.bestPriceRow ?? null
        }
        break
      }
      default: {
        const _exhaustive: never = card.lens
        return _exhaustive
      }
    }
    const awardedVendor = vendorName ?? row?.vendor ?? cand?.topVendor?.name ?? '—'
    const metric =
      card.lens === 'pricing'
        ? money(cand?.bestPrice ?? null, '—')
        : card.lens === 'leadTime'
          ? formatLeadDays(cand?.fastestDays ?? null, '—')
          : awardedVendor
    const coverCount = vendorName
      ? new Set(
          rows
            .filter((r) => vendorKeyFromRow(r) === vendorName)
            .map((r) => r.partId)
            .filter(Boolean)
        ).size
      : null
    const why =
      card.lens === 'vendor' && vendorName
        ? `Award ${vendorName} for this batch${coverCount != null ? ` (${coverCount} part${coverCount === 1 ? '' : 's'} covered)` : ''}.`
        : card.why
    return {
      lens: card.lens,
      title: card.title,
      winnerLabel: vendorName ?? cand?.label ?? '—',
      metric,
      why,
      vendor: awardedVendor,
      priceLabel: row?.priceLabel ?? money(cand?.bestPrice ?? null, '—'),
      delivery: row?.delivery && row.delivery !== '—' ? row.delivery : formatLeadDays(cand?.fastestDays ?? null, '—'),
      url: row?.url ?? '',
    }
  })
}

function newReportBlockId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function safeHttpUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t || t.length > 2048) return null
  if (!/^https?:\/\//i.test(t)) return null
  return t
}

export function buildApprovedRfqBlocks(args: {
  partTitles: string[]
  summary: DecisionSummaryLine[]
  rows: CompareDecisionRow[]
}): Array<Record<string, unknown>> {
  const { partTitles, summary, rows } = args
  const vendorLine = summary.find((s) => s.lens === 'vendor')
  const awardedVendor =
    vendorLine?.vendor && vendorLine.vendor !== '—'
      ? vendorLine.vendor
      : vendorLine?.winnerLabel ?? '—'
  const issued = new Date().toISOString().slice(0, 10)
  const rfqNumber = `RFQ-${issued.replace(/-/g, '')}-${String(Math.floor(Math.random() * 900 + 100))}`
  const partIds = [
    ...new Set(rows.map((r) => r.partId).filter((id): id is string => Boolean(id?.trim()))),
  ]
  const lineParts =
    partIds.length > 0
      ? partIds.map((id) => {
          const list = rows.filter((r) => r.partId === id)
          const label = list[0]?.partLabel ?? id
          const fromVendor = list.filter((r) => r.vendor === awardedVendor)
          const pool = fromVendor.length > 0 ? fromVendor : list
          const priced = pool.filter((r) => r.price != null)
          const best =
            [...priced].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0] ??
            pool[0] ??
            null
          return {
            part: label,
            vendor: best?.vendor ?? awardedVendor,
            price: best?.priceLabel ?? '—',
            delivery: best?.delivery && best.delivery !== '—' ? best.delivery : '—',
            availability: best?.availability ?? '—',
            url: best?.url ?? '',
          }
        })
      : partTitles.map((title) => ({
          part: title,
          vendor: awardedVendor,
          price: vendorLine?.priceLabel ?? '—',
          delivery: vendorLine?.delivery ?? '—',
          availability: '—',
          url: vendorLine?.url ?? '',
        }))
  const tableRows: Array<Array<string | { type: 'link'; label: string; href: string }>> = [
    ['Part', 'Awarded vendor', 'Price', 'Lead time', 'Availability', 'Source'],
    ...lineParts.map((line) => {
      const href = safeHttpUrl(line.url)
      return [
        line.part,
        line.vendor,
        line.price,
        line.delivery,
        line.availability,
        href ? { type: 'link' as const, label: 'Open source →', href } : '—',
      ]
    }),
  ]
  const compared = partTitles.filter(Boolean).join(' vs ') || 'selected parts'
  return [
    { id: newReportBlockId(), type: 'title', text: `RFQ Approved — ${rfqNumber}`, align: 'left' },
    {
      id: newReportBlockId(),
      type: 'callout',
      text: `Status: APPROVED · Issued ${issued} · Awarded vendor: ${awardedVendor}`,
      align: 'left',
      tone: 'emerald',
    },
    {
      id: newReportBlockId(),
      type: 'paragraph',
      text: `This RFQ was generated from a research comparison of ${compared}. The award follows three recorded decisions: pricing, lead time, and vendor.`,
      align: 'left',
    },
    { id: newReportBlockId(), type: 'heading', text: 'Recorded decisions', align: 'left' },
    {
      id: newReportBlockId(),
      type: 'numbered',
      items: summary.map((s) => `${s.title}: ${s.winnerLabel} (${s.metric}). ${s.why}`),
      align: 'left',
    },
    { id: newReportBlockId(), type: 'heading', text: 'Awarded line items', align: 'left' },
    { id: newReportBlockId(), type: 'table', showHeader: true, rows: tableRows, align: 'left' },
  ]
}

export type CompareWizardStep = 'compare' | 'decide' | 'rfq'

export const COMPARE_WIZARD_STEPS: { id: CompareWizardStep; n: string; label: string }[] = [
  { id: 'compare', n: '1', label: 'Compare' },
  { id: 'decide', n: '2', label: 'Decide' },
  { id: 'rfq', n: '3', label: 'Create RFQ' },
]

export function coerceCompareWizardStep(raw: string | null | undefined): CompareWizardStep {
  if (raw === 'decide' || raw === 'rfq' || raw === 'compare') return raw
  return 'compare'
}

function coerceStrategyTab(raw: unknown): StrategyTab | null {
  if (raw === 'consolidation' || raw === 'delivery' || raw === 'price') return raw
  if (raw === 'vendor' || raw === 'coverage') return 'consolidation'
  if (raw === 'speed' || raw === 'leadTime' || raw === 'fastest') return 'delivery'
  if (raw === 'pricing' || raw === 'cost' || raw === 'cheapest') return 'price'
  return null
}

function parseStrategyAiPayload(raw: string): {
  strategy: StrategyTab | null
  quantities: Record<string, number>
  vendor: string | null
  reason: string | null
} | null {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
  const blob = (fenced?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? '').trim()
  if (!blob.startsWith('{')) return null
  try {
    const parsed = JSON.parse(blob) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return null
    const quantities: Record<string, number> = {}
    const rawQty = parsed.quantities
    if (rawQty && typeof rawQty === 'object' && !Array.isArray(rawQty)) {
      for (const [k, v] of Object.entries(rawQty as Record<string, unknown>)) {
        const key = k.trim()
        if (!key || key.length > 200) continue
        quantities[key] = clampQty(v)
      }
    }
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim().slice(0, 600) : null
    const vendor = typeof parsed.vendor === 'string' ? parsed.vendor.trim().slice(0, 200) : null
    return {
      strategy: coerceStrategyTab(parsed.strategy ?? parsed.preference ?? parsed.tab),
      quantities,
      vendor: vendor || null,
      reason: reason || null,
    }
  } catch {
    return null
  }
}

function strategyRankWhy(tab: StrategyTab): string {
  switch (tab) {
    case 'price':
      return 'Ranked by lowest extended cost at the quantities you set.'
    case 'delivery':
      return 'Ranked by fastest lead time, then extended cost at your quantities.'
    case 'consolidation':
      return 'Ranked by how many parts (and units) one vendor can cover, then extended cost.'
    default: {
      const _exhaustive: never = tab
      return _exhaustive
    }
  }
}

function matchVendorName(raw: string, vendors: string[]): string | null {
  const q = raw.trim().toLowerCase()
  if (!q) return null
  const exact = vendors.find((v) => v.toLowerCase() === q)
  if (exact) return exact
  return vendors.find((v) => v.toLowerCase().includes(q) || q.includes(v.toLowerCase())) ?? null
}

export function ComparePartDecisionsPanel({
  rows,
  onAddToBucket,
  onPicksChange,
}: {
  rows: CompareDecisionRow[]
  onAddToBucket?: (id: string) => void
  onPicksChange?: (picks: Record<CompareDecisionLens, string | null>) => void
}) {
  const [picks, setPicks] = useState<Record<CompareDecisionLens, string | null>>({
    pricing: null,
    leadTime: null,
    vendor: null,
  })
  const [strategyTab, setStrategyTab] = useState<StrategyTab>('consolidation')
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [vendorLocked, setVendorLocked] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiReason, setAiReason] = useState<string | null>(null)

  const partQtyRows = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>()
    for (const row of rows) {
      const id = (row.partId || row.id).trim()
      if (!id || map.has(id)) continue
      map.set(id, { id, label: row.partLabel?.trim() || compactPartId(row) })
    }
    return [...map.values()]
  }, [rows])

  useEffect(() => {
    setQuantities((prev) => {
      let changed = false
      const next = { ...prev }
      for (const part of partQtyRows) {
        if (next[part.id] == null) {
          next[part.id] = 1
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [partQtyRows])

  const partCount = useMemo(() => partQtyRows.length, [partQtyRows])

  const rankedCards = useMemo(
    () => rankVendorStrategyCards(rows, strategyTab, quantities),
    [rows, strategyTab, quantities]
  )
  const recommendedVendor = rankedCards[0]?.vendor ?? null
  const selectedVendor = parseVendorPickName(picks.vendor) ?? recommendedVendor
  const recommendedCard = rankedCards[0] ?? null

  useEffect(() => {
    setVendorLocked(false)
    setPicks(recommendedPicksFromRows(rows))
  }, [rows])

  useEffect(() => {
    if (vendorLocked) return
    if (!recommendedVendor) return
    setPicks((prev) => {
      const nextId = vendorPickId(recommendedVendor)
      if (prev.vendor === nextId) return prev
      return { ...prev, vendor: nextId }
    })
  }, [recommendedVendor, vendorLocked, strategyTab, quantities])

  useEffect(() => {
    onPicksChange?.(picks)
  }, [picks, onPicksChange])

  const applyVendor = (vendor: string) => {
    setVendorLocked(true)
    setPicks((prev) => ({ ...prev, vendor: vendorPickId(vendor) }))
  }

  const setPartQty = (partId: string, nextQty: number) => {
    setVendorLocked(false)
    setAiReason(null)
    setQuantities((prev) => ({ ...prev, [partId]: clampQty(nextQty) }))
  }

  const changeStrategyTab = (tab: StrategyTab) => {
    setVendorLocked(false)
    setStrategyTab(tab)
  }

  const askStrategyAi = useCallback(async () => {
    const trimmed = aiPrompt.trim()
    const token = getToken()
    if (!trimmed) {
      setAiError('Describe what you need — quantity, speed, budget, or a preferred vendor.')
      return
    }
    if (!token) {
      setAiError('Sign in to use AI recommendations.')
      return
    }
    setAiBusy(true)
    setAiError(null)
    const vendorSnapshot = rankVendorStrategyCards(rows, strategyTab, quantities)
      .slice(0, 12)
      .map((card) => ({
        vendor: card.vendor,
        cover: card.coverCount,
        min_days: card.minDays,
        extended_total: card.subtotal,
        lines: card.lines.map((line) => ({
          part: line.partLabel,
          qty: line.qty,
          unit_price: line.price,
          lead_days: line.days,
        })),
      }))
    const context = JSON.stringify({
      assistant_role:
        'You are a procurement strategy assistant. Recommend a sourcing preference and quantities using ONLY the provided vendor table. Reply with a short JSON object, then one sentence of reason. JSON keys: strategy (consolidation|delivery|price), quantities (map of part label to integer qty), vendor (exact vendor name), reason (string).',
      current_strategy: strategyTab,
      current_quantities: quantities,
      parts: partQtyRows.map((p) => ({ id: p.id, label: p.label, qty: qtyForPart(quantities, p.id) })),
      vendors: vendorSnapshot,
    })
    try {
      const res = await aiGroqChat(token, {
        mode: 'chat',
        message: trimmed,
        history: [],
        context,
        session_label: 'Procurement strategy',
        source: 'compare_strategy_ai',
      })
      const parsed = parseStrategyAiPayload(res.content)
      if (!parsed) {
        setAiReason(res.content.trim().slice(0, 600) || null)
        return
      }
      if (parsed.strategy) changeStrategyTab(parsed.strategy)
      if (Object.keys(parsed.quantities).length > 0) {
        setQuantities((prev) => {
          const next = { ...prev }
          for (const [key, qty] of Object.entries(parsed.quantities)) {
            const match = partQtyRows.find(
              (p) =>
                p.id === key ||
                p.label.toLowerCase() === key.toLowerCase() ||
                p.label.toLowerCase().includes(key.toLowerCase())
            )
            if (match) next[match.id] = clampQty(qty)
          }
          return next
        })
      }
      const vendorNames = vendorSnapshot.map((v) => v.vendor)
      const matched = parsed.vendor ? matchVendorName(parsed.vendor, vendorNames) : null
      if (matched) {
        setVendorLocked(true)
        setPicks((prev) => ({ ...prev, vendor: vendorPickId(matched) }))
      } else {
        setVendorLocked(false)
      }
      setAiReason(parsed.reason || res.content.trim().slice(0, 400))
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI request failed')
    } finally {
      setAiBusy(false)
    }
  }, [aiPrompt, quantities, rows, strategyTab, partQtyRows])

  const exportStrategyCsv = () => {
    const header = ['Vendor', 'Part ID', 'Part name', 'Qty', 'Lead time', 'Unit price', 'Extended', 'Status']
    const body = rankedCards.flatMap((card) =>
      card.lines.map((line) => [
        card.vendor,
        compactPartId(line.row),
        line.partName,
        String(line.qty),
        line.days != null ? formatLeadDays(line.days) : line.row.delivery || '—',
        line.price != null ? money(line.price, '—') : line.row.priceLabel,
        line.extended != null ? money(line.extended, '—') : '—',
        line.status === 'best-price' ? 'Best Price' : line.status === 'fastest' ? 'Fastest' : 'Standard',
      ])
    )
    const csv = [header, ...body]
      .map((cols) =>
        cols
          .map((cell) => {
            const s = String(cell)
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(',')
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'procurement-strategy.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const tabs: { id: StrategyTab; label: string }[] = [
    { id: 'consolidation', label: 'Vendor Consolidation' },
    { id: 'delivery', label: 'Delivery Speed' },
    { id: 'price', label: 'Price Optimization' },
  ]

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center">
        <p className="text-sm font-semibold text-slate-800">No vendor offers to decide on yet</p>
        <p className="mt-1 text-xs text-slate-500">Go back to Compare and wait for scraped sources to load.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-slate-900">
            Procurement Strategy: {partCount} Selected Part{partCount === 1 ? '' : 's'}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Set quantities and requirements. The recommended vendor updates as your batch changes.
          </p>
        </div>
        <button
          type="button"
          onClick={exportStrategyCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
          Export CSV
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Requirements
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {partQtyRows.map((part) => (
            <label
              key={part.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="max-w-[160px] truncate font-mono text-xs font-semibold text-slate-800" title={part.label}>
                {part.label}
              </span>
              <span className="text-[11px] text-slate-500">Qty</span>
              <input
                type="number"
                min={1}
                max={99999}
                step={1}
                value={qtyForPart(quantities, part.id)}
                onChange={(e) => setPartQty(part.id, Number(e.target.value))}
                className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
          ))}
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            void askStrategyAi()
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              <Sparkles className="h-3 w-3 text-amber-500" strokeWidth={2} />
              AI requirements
            </span>
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="e.g. I need 40 of each, fastest delivery, keep spend under $5,000"
              className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <button
            type="submit"
            disabled={aiBusy}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {aiBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2} />
            )}
            {aiBusy ? 'Asking…' : 'Ask AI'}
          </button>
        </form>
        {aiError && (
          <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {aiError}
          </p>
        )}
        {(aiReason || recommendedCard) && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
              Best option for these requirements
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {recommendedVendor ?? '—'}
              {recommendedCard?.subtotal != null ? (
                <span className="ml-2 font-mono font-medium text-emerald-800">
                  {money(recommendedCard.subtotal, '—')} extended
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {aiReason ?? strategyRankWhy(strategyTab)}
            </p>
          </div>
        )}
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap gap-5" aria-label="Sourcing strategy">
          {tabs.map((tab) => {
            const active = strategyTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => changeStrategyTab(tab.id)}
                className={`border-b-2 pb-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="space-y-4">
        {rankedCards.map((card) => {
          const isSelected = selectedVendor === card.vendor
          const isRecommended = recommendedVendor === card.vendor
          return (
            <article
              key={card.vendor}
              className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                isSelected ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200'
              }`}
            >
              <header className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-bold text-slate-900">{card.vendor}</h4>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {card.coverCount} Part{card.coverCount === 1 ? '' : 's'} Sourced
                    </span>
                    {isRecommended && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <Trophy className="h-3 w-3" strokeWidth={2.5} />
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{card.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => applyVendor(card.vendor)}
                  className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold shadow-sm ${
                    isSelected
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isSelected ? 'Apply to Order' : 'Select Vendor'}
                </button>
              </header>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-2.5">Part ID</th>
                      <th className="px-4 py-2.5">Part name</th>
                      <th className="px-4 py-2.5">Qty</th>
                      <th className="px-4 py-2.5">Lead time</th>
                      <th className="px-4 py-2.5">Unit price</th>
                      <th className="px-4 py-2.5">Extended</th>
                      <th className="px-5 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.lines.map((line) => {
                      let statusLabel = 'Standard'
                      let statusClass = 'bg-slate-100 text-slate-600'
                      switch (line.status) {
                        case 'best-price':
                          statusLabel = 'Best Price'
                          statusClass = 'bg-emerald-50 text-emerald-800'
                          break
                        case 'fastest':
                          statusLabel = 'Fastest'
                          statusClass = 'bg-sky-50 text-sky-800'
                          break
                        case 'standard':
                          statusLabel = 'Standard'
                          statusClass = 'bg-slate-100 text-slate-600'
                          break
                        default: {
                          const _exhaustive: never = line.status
                          return _exhaustive
                        }
                      }
                      return (
                        <tr key={`${card.vendor}-${line.partId}`} className="border-b border-slate-100 last:border-0">
                          <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-800">
                            {compactPartId(line.row)}
                          </td>
                          <td className="max-w-[280px] truncate px-4 py-3 text-slate-700" title={line.partName}>
                            {line.partName}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              min={1}
                              max={99999}
                              step={1}
                              aria-label={`Quantity for ${line.partLabel}`}
                              value={line.qty}
                              onChange={(e) => setPartQty(line.partId, Number(e.target.value))}
                              className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {line.days != null ? formatLeadDays(line.days) : line.row.delivery || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                            {line.price != null ? money(line.price, '—') : line.row.priceLabel}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800">
                            {line.extended != null ? money(line.extended, '—') : '—'}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusClass}`}
                            >
                              {statusLabel}
                            </span>
                            {onAddToBucket && (
                              <button
                                type="button"
                                onClick={() => onAddToBucket(line.row.id)}
                                className="ml-2 text-[11px] font-medium text-slate-500 hover:text-slate-800"
                              >
                                Bucket
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <footer className="flex justify-end border-t border-slate-100 px-5 py-3">
                <p className="text-sm font-bold tracking-wide text-slate-900">
                  EXTENDED:{' '}
                  <span className="font-mono">
                    {card.subtotal != null ? money(card.subtotal, '—') : '—'}
                  </span>
                </p>
              </footer>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function Tag({
  children,
  variant = 'default',
}: {
  children: ReactNode
  variant?: 'default' | 'blue' | 'green' | 'yellow'
}) {
  const styles = {
    default: 'border-slate-200 bg-slate-100 text-slate-600',
    blue: 'border-blue-100 bg-blue-50 text-blue-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    yellow: 'border-amber-200 bg-amber-50 text-amber-700',
  }[variant]
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium leading-[18px] border ${styles}`}>
      {children}
    </span>
  )
}

function ScoreBar({ score }: { score: number }) {
  let barColor = 'bg-slate-400'
  let textColor = 'text-slate-500'
  if (score >= 70) {
    barColor = 'bg-emerald-500'
    textColor = 'text-emerald-600'
  } else if (score >= 45) {
    barColor = 'bg-blue-500'
    textColor = 'text-blue-600'
  } else if (score >= 25) {
    barColor = 'bg-amber-500'
    textColor = 'text-amber-600'
  } else {
    barColor = 'bg-red-500'
    textColor = 'text-red-600'
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-[3px] w-12 overflow-hidden rounded-sm bg-slate-200">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
      </div>
      <span className={`min-w-[18px] font-mono text-xs font-medium ${textColor}`}>{score}</span>
    </div>
  )
}

function DeliveryDot({ row }: { row: CompareDecisionRow }) {
  const d = (row.delivery || '').toLowerCase()
  const shipsToday = d.includes('today') || d.includes('same day')
  const inStock = /in stock|available|low stock/i.test(row.availability)
  const color = shipsToday ? 'bg-emerald-500' : inStock ? 'bg-amber-500' : 'bg-slate-300'
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
}

function VendorThumb({
  imageUrl,
  vendor,
  size = 'sm',
}: {
  imageUrl?: string | null
  vendor: string
  size?: 'sm' | 'md'
}) {
  const [broken, setBroken] = useState(false)
  const src =
    typeof imageUrl === 'string' &&
    imageUrl.trim().length > 0 &&
    imageUrl.trim().length <= 2048 &&
    /^https?:\/\//i.test(imageUrl.trim())
      ? imageUrl.trim()
      : null
  const dim = size === 'md' ? 'h-12 w-12' : 'h-7 w-7'
  const letter = vendor.trim()[0]?.toUpperCase() ?? '?'

  if (!src || broken) {
    return (
      <div
        className={`flex ${dim} shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-[11px] font-bold text-slate-500`}
        aria-hidden
      >
        {letter}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={`${dim} shrink-0 rounded border border-slate-200 bg-white object-cover`}
    />
  )
}

export function CompareDecisionWorkspace({
  partLabel,
  partCategory,
  rows,
  filteredRows,
  onlyAvailable,
  onOnlyAvailableChange,
  minPrice,
  maxPrice,
  priceRange,
  onPriceRangeChange,
  selectedIds,
  onToggleSelected,
  onAddSelectedToBucket,
  onCompareSelected,
  onAddSingleToBucket,
  availableFields,
  selectedFields,
  onSelectedFieldsChange,
  view,
  onViewChange,
  onExportCSV,
  onSaveView,
  partChips = [],
  activePartId,
  onActivePartChange,
  selectedPartCount = 0,
  fileName,
  onChangeFile,
  onPartChipToggle,
  onClearPartSelection,
  loadedFiles = [],
  activeFileId: activeWorkspaceFileId,
  onSelectFile,
  onRemoveFile,
  commonVendorDomains = [],
  decisionBoardRows,
  hideDecisionsTab = false,
}: Props) {
  const isEmpty = rows.length === 0 && (decisionBoardRows?.length ?? 0) === 0

  const [showParts, setShowParts] = useState(true)
  const [sparkAiOpen, setSparkAiOpen] = useState(false)
  const [partQ, setPartQ] = useState('')
  const [vendorSearch, setVendorSearch] = useState('')
  const [shipsToday, setShipsToday] = useState(false)
  const [commonVendorsOnly, setCommonVendorsOnly] = useState(false)
  const [commonInfoOnly, setCommonInfoOnly] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [sortKey, setSortKey] = useState<string | null>('price')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [hoverRowId, setHoverRowId] = useState<string | null>(null)
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const fieldPickerRef = useRef<HTMLDivElement | null>(null)

  const allFields = useMemo(
    () =>
      availableFields
        .map((f) => f.trim())
        .filter(Boolean)
        .filter((f, i, arr) => arr.indexOf(f) === i),
    [availableFields]
  )
  const commonFields = useMemo(
    () => allFields.filter((f) => isCommonVendorInfoField(f)),
    [allFields]
  )
  useEffect(() => {
    const trimmedAll = new Set(allFields.map((f) => f.trim()).filter(Boolean))
    const cleaned = selectedFields.filter((f) => trimmedAll.has(f.trim()))
    if (cleaned.length !== selectedFields.length) onSelectedFieldsChange(cleaned)
  }, [allFields, selectedFields, onSelectedFieldsChange])

  useEffect(() => {
    if (!commonInfoOnly) return
    const next = commonFields.length > 0 ? commonFields : allFields
    const same =
      next.length === selectedFields.length && next.every((f, i) => f === selectedFields[i])
    if (!same) onSelectedFieldsChange(next)
  }, [commonInfoOnly, commonFields, allFields, selectedFields, onSelectedFieldsChange])

  const commonDomainSet = useMemo(() => {
    return new Set(
      commonVendorDomains
        .map((d) => d.trim().toLowerCase().replace(/^www\./i, ''))
        .filter(Boolean)
    )
  }, [commonVendorDomains])

  useEffect(() => {
    if (commonDomainSet.size === 0 && commonVendorsOnly) setCommonVendorsOnly(false)
  }, [commonDomainSet, commonVendorsOnly])

  useEffect(() => {
    function onDocumentClick(e: MouseEvent) {
      if (!fieldPickerOpen) return
      if (!fieldPickerRef.current?.contains(e.target as Node)) setFieldPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [fieldPickerOpen])

  const displayRows = useMemo(() => {
    let result = filteredRows
    if (vendorSearch.trim()) {
      const q = vendorSearch.trim().toLowerCase()
      result = result.filter((r) => r.vendor.toLowerCase().includes(q))
    }
    if (shipsToday) {
      result = result.filter((r) => {
        const d = (r.delivery || '').toLowerCase()
        return d.includes('today') || d.includes('same day')
      })
    }
    if (commonVendorsOnly && commonDomainSet.size > 0) {
      result = result.filter((r) => commonDomainSet.has(extractRowDomain(r.url)))
    }
    return result
  }, [filteredRows, vendorSearch, shipsToday, commonVendorsOnly, commonDomainSet])

  const sortedRows = useMemo(() => {
    const arr = [...displayRows]
    if (!sortKey) return arr
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'vendor') cmp = a.vendor.localeCompare(b.vendor)
      else if (sortKey === 'price') cmp = (a.price ?? Infinity) - (b.price ?? Infinity)
      else if (sortKey === 'score') cmp = (getScore(a) ?? -1) - (getScore(b) ?? -1)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [displayRows, sortKey, sortDir])

  const bestPrice = useMemo(() => {
    const prices = displayRows.map((r) => r.price).filter((n): n is number => n != null)
    return prices.length ? Math.min(...prices) : null
  }, [displayRows])

  const avgPrice = useMemo(() => {
    const prices = displayRows.map((r) => r.price).filter((n): n is number => n != null)
    return prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0
  }, [displayRows])

  const bestRow = useMemo(
    () => (bestPrice != null ? displayRows.find((r) => r.price === bestPrice) ?? null : null),
    [displayRows, bestPrice]
  )

  const saving = avgPrice > 0 && bestPrice != null ? avgPrice - bestPrice : 0
  const freeShipRow = displayRows.find((r) => r.shipping === 0)
  const totalVendorSources = rows.length

  const filtParts = useMemo(() => {
    if (!partQ.trim()) return partChips
    const q = partQ.trim().toLowerCase()
    return partChips.filter((p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
  }, [partChips, partQ])

  const activeChips = partChips.filter((p) => p.selected)
  const selectedChipCount = activeChips.length
  const effectiveView: CompareDecisionView =
    hideDecisionsTab && view === 'decisions' ? 'table' : view
  const showPartColumn = useMemo(() => {
    const partKeys = new Set(
      displayRows
        .map((r) => r.partId?.trim() || r.partLabel?.trim() || '')
        .filter(Boolean)
    )
    return partKeys.size > 1
  }, [displayRows])
  const viewTabs = useMemo(
    () =>
      (
        [
          hideDecisionsTab ? null : { k: 'decisions' as const, Icon: Scale, label: 'Decisions' },
          { k: 'table' as const, Icon: List, label: 'Table' },
          { k: 'insights' as const, Icon: BarChart2, label: 'Insights' },
          { k: 'mindmap' as const, Icon: MapIcon, label: 'Mind map' },
        ] as const
      ).filter((t): t is Exclude<typeof t, null> => t != null),
    [hideDecisionsTab]
  )

  function getScore(row: CompareDecisionRow): number | null {
    if (row.rating != null && !Number.isNaN(row.rating)) return Math.round(row.rating)
    return null
  }

  function getVsAvg(row: CompareDecisionRow): number | null {
    if (row.price == null || !Number.isFinite(avgPrice) || avgPrice === 0) return null
    return ((row.price - avgPrice) / avgPrice) * 100
  }

  function getDeliverySub(row: CompareDecisionRow): string {
    if (row.shipping === 0) return 'Free shipping'
    if (row.shipping != null) return `+$${row.shipping.toFixed(2)} shipping`
    if (row.shippingLabel && row.shippingLabel !== '—') return row.shippingLabel
    return 'Shipping: TBD'
  }

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'price' ? 'asc' : 'desc')
    }
  }

  function toggleAllRows() {
    if (selectedIds.size === sortedRows.length) {
      sortedRows.forEach((r) => {
        if (selectedIds.has(r.id)) onToggleSelected(r.id)
      })
    } else {
      sortedRows.forEach((r) => {
        if (!selectedIds.has(r.id)) onToggleSelected(r.id)
      })
    }
  }

  function handleExportCSV() {
    if (onExportCSV) {
      onExportCSV()
      return
    }
    const headers = ['Vendor', 'Price', 'VS Avg', 'Contact', 'Delivery', 'Score']
    const csvRows = [headers.join(',')]
    for (const row of sortedRows) {
      const vsAvg = getVsAvg(row)
      const score = getScore(row)
      csvRows.push(
        [
          `"${row.vendor.replace(/"/g, '""')}"`,
          row.price != null ? row.price.toFixed(2) : '',
          vsAvg != null ? `${vsAvg >= 0 ? '+' : ''}${vsAvg.toFixed(1)}%` : '',
          `"${(row.contact || '').replace(/"/g, '""')}"`,
          `"${(row.delivery || '').replace(/"/g, '""')}"`,
          score != null ? String(score) : '',
        ].join(',')
      )
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${partLabel || 'compare'}_vendors.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function SortIcon({ field }: { field: string }) {
    if (sortKey !== field) return <ArrowUpDown className="h-2.5 w-2.5 text-slate-400" strokeWidth={1.75} />
    return sortDir === 'asc' ? (
      <ArrowUp className="h-2.5 w-2.5 text-blue-600" strokeWidth={2} />
    ) : (
      <ArrowDown className="h-2.5 w-2.5 text-blue-600" strokeWidth={2} />
    )
  }

  const maxPriceLimit = maxPrice > minPrice ? maxPrice : minPrice + 5000
  const priceSliderMax = Math.max(maxPriceLimit, priceRange[1], 100)

  const pageHeader = (
    <>
      <div className="-mx-4 border-b border-slate-200 bg-white px-6 py-4 sm:-mx-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-xl font-bold tracking-tight text-slate-900">Product Comparison</h1>
              {selectedPartCount != null && selectedPartCount > 0 && (
                <Tag variant="blue">
                  {selectedPartCount} part{selectedPartCount !== 1 ? 's' : ''} selected
                </Tag>
              )}
              {fileName && loadedFiles.length <= 1 && <Tag>{fileName}</Tag>}
            </div>
            {loadedFiles.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {loadedFiles.map((file) => {
                  const isActive = file.fileId === activeWorkspaceFileId
                  return (
                    <span
                      key={file.fileId}
                      className={`inline-flex cursor-pointer items-center gap-1 rounded-[5px] border px-2 py-0.5 text-[11px] font-medium ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                      onClick={() => onSelectFile?.(file.fileId)}
                      onKeyDown={(e) => e.key === 'Enter' && onSelectFile?.(file.fileId)}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      {onRemoveFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRemoveFile(file.fileId)
                          }}
                          className={`rounded px-0.5 leading-none ${isActive ? 'text-slate-300 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}
                          aria-label={`Remove ${file.name}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
            <p className="m-0 mt-1 text-[13px] text-slate-500">
              Compare vendors, pricing, and availability across your selected parts.
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {onChangeFile && (
              <button
                type="button"
                onClick={onChangeFile}
                className="rounded-[5px] border border-slate-200 bg-white px-2.5 py-[5px] text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Change file
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowParts((p) => !p)}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-slate-200 bg-white px-2.5 py-[5px] text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              {showParts ? (
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {showParts ? 'Collapse' : 'Parts'}
            </button>
          </div>
        </div>
      </div>

      {showParts && (
        <div className="-mx-4 border-b border-slate-200 bg-white px-6 py-3.5 sm:-mx-6">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Select parts</span>
            <span className="text-[11px] text-slate-400">
              {filtParts.length} parts · {selectedChipCount} selected
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setSparkAiOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[5px] border border-slate-900 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition-colors hover:bg-slate-800"
              aria-label="Open Spark AI"
            >
              <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden />
              Spark AI
            </button>
            <div className="flex items-center gap-1 rounded-[5px] border border-slate-200 bg-slate-50 px-2 py-1">
              <Search className="h-2.5 w-2.5 text-slate-400" strokeWidth={2} />
              <input
                value={partQ}
                onChange={(e) => setPartQ(e.target.value)}
                placeholder="Filter…"
                className="w-[90px] border-0 bg-transparent text-xs text-slate-800 outline-none"
              />
            </div>
            {selectedChipCount > 0 && onClearPartSelection && (
              <button
                type="button"
                onClick={onClearPartSelection}
                className="inline-flex items-center gap-1 rounded-[5px] px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              >
                <X className="h-2.5 w-2.5" strokeWidth={2} />
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-[5px]">
            {filtParts.map((p) => {
              const isSel = p.selected
              const hasRes = p.vendorCount > 0
              return (
                <button
                  key={p.id}
                  type="button"
                  title={p.label}
                  onClick={() => {
                    if (onPartChipToggle) onPartChipToggle(p.id)
                    else onActivePartChange?.(p.id)
                  }}
                  className={`inline-flex items-center gap-[5px] rounded-[5px] border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    isSel
                      ? 'border-slate-300 bg-slate-900 font-semibold text-white'
                      : p.inPortfolio
                        ? 'cursor-pointer border-emerald-300 bg-emerald-50 font-normal text-emerald-900 hover:border-emerald-400'
                        : hasRes
                          ? 'cursor-pointer border-slate-200 bg-white font-normal text-slate-700 hover:border-slate-300'
                          : 'cursor-default border-[#ededf0] bg-slate-50 font-normal text-slate-400'
                  }`}
                >
                  {isSel && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />}
                  <span className="font-semibold">{p.label}</span>
                  {hasRes && !isSel && (
                    <span className="text-[10px] font-normal text-slate-400">
                      {p.vendorCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {filtParts.length === 0 && (
            <p className="text-xs text-slate-500">No parts match the filter. Use Change file to load a parts list.</p>
          )}
        </div>
      )}
    </>
  )

  if (isEmpty) {
    return (
      <div className="flex flex-col">
        {pageHeader}
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-800">No vendor data yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Select parts above with research results, or run Research to collect vendor pricing.
          </p>
        </div>
        <CompareSparkAiPanel
          open={sparkAiOpen}
          onClose={() => setSparkAiOpen(false)}
          partLabel={partLabel}
          rows={filteredRows}
          partChips={partChips}
          activePartId={activePartId}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {pageHeader}

      <div className="flex flex-col gap-3 pt-4">
      {/* Part tabs + actions */}
      <div className="flex flex-wrap items-center gap-2">
        {activeChips.length > 0 && (
          <div className="inline-flex flex-wrap gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
            {activeChips.length > 1 && (
              <button
                type="button"
                onClick={() => onActivePartChange?.('all')}
                className={`rounded px-3 py-1 font-mono text-[11px] transition-colors ${
                  activePartId === 'all'
                    ? 'bg-slate-900 font-semibold text-white'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                All
              </button>
            )}
            {activeChips.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onActivePartChange?.(p.id)}
                className={`rounded px-3 py-1 font-mono text-[11px] transition-colors ${
                  activePartId === p.id ? 'bg-slate-900 font-semibold text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {activeChips.length > 0 && <span className="text-slate-300">·</span>}
        <span className="text-sm text-slate-500">{partLabel}</span>
        {partCategory && <Tag>{partCategory}</Tag>}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setSparkAiOpen(true)}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          aria-label="Open Spark AI"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.75} />
          Spark AI
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <Heart className="h-3.5 w-3.5" strokeWidth={1.75} />
          Wishlist
        </button>
        <button
          type="button"
          onClick={onAddSelectedToBucket}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <ShoppingCart className="h-3.5 w-3.5" strokeWidth={1.75} />
          Add to bucket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-4">
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Best price</p>
          <div className="mt-1 flex items-center gap-2.5">
            {bestRow && (
              <VendorThumb imageUrl={bestRow.imageUrl} vendor={bestRow.vendor} size="md" />
            )}
            <div className="min-w-0">
              <p className="truncate font-mono text-xl font-bold text-emerald-600">{money(bestPrice, '—')}</p>
              <p className="truncate text-[11px] text-slate-400">{bestRow?.vendor ?? '—'}</p>
            </div>
          </div>
        </div>
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Avg price</p>
          <p className="font-mono text-xl font-bold text-slate-900">
            {Number.isFinite(avgPrice) ? `$${avgPrice.toFixed(2)}` : '—'}
          </p>
          <p className="truncate text-[11px] text-slate-400">
            {saving > 0 ? `$${saving.toFixed(2)} above best` : 'At best price'}
          </p>
        </div>
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Vendors</p>
          <p className="font-mono text-xl font-bold text-slate-900">
            {displayRows.length} / {totalVendorSources}
          </p>
          <p className="text-[11px] text-slate-400">matching filters</p>
        </div>
        <div className="bg-white px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Free shipping</p>
          <p className={`truncate text-sm font-bold ${freeShipRow ? 'text-emerald-600' : 'text-slate-400'}`}>
            {freeShipRow ? freeShipRow.vendor : 'Not available'}
          </p>
          <p className="text-[11px] text-slate-400">{freeShipRow ? 'Qualifies' : 'No free ship'}</p>
        </div>
      </div>

      {/* Main card */}
      <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-3.5 py-2.5">
          <div className="mr-1.5 inline-flex gap-0.5">
            {viewTabs.map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => onViewChange(t.k)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  effectiveView === t.k ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <t.Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t.label}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
            <Search className="h-3 w-3 text-slate-400" strokeWidth={2} />
            <input
              value={vendorSearch}
              onChange={(e) => setVendorSearch(e.target.value)}
              placeholder="Filter vendors…"
              className="w-32 border-0 bg-transparent text-xs text-slate-800 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setShipsToday((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              shipsToday ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Zap className="h-3 w-3" strokeWidth={1.75} />
            Ships today
          </button>
          <button
            type="button"
            onClick={() => onOnlyAvailableChange(!onlyAvailable)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              onlyAvailable ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Check className="h-3 w-3" strokeWidth={1.75} />
            In stock
          </button>
          <button
            type="button"
            onClick={() => {
              if (commonDomainSet.size === 0) return
              setCommonVendorsOnly((v) => !v)
            }}
            disabled={commonDomainSet.size === 0}
            title={
              commonDomainSet.size > 0
                ? `Show only vendors shared across selected parts (${commonDomainSet.size})`
                : 'Select 2+ parts that share vendors to enable this filter'
            }
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              commonDomainSet.size === 0
                ? 'cursor-not-allowed text-slate-400 opacity-60'
                : commonVendorsOnly
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Layers className="h-3 w-3" strokeWidth={1.75} />
            Common vendors
            {commonDomainSet.size > 0 ? ` (${commonDomainSet.size})` : ''}
          </button>
          <button
            type="button"
            onClick={() => {
              setCommonInfoOnly((v) => {
                const next = !v
                if (next) {
                  onSelectedFieldsChange(commonFields.length > 0 ? commonFields : allFields)
                } else {
                  onSelectedFieldsChange(allFields)
                }
                return next
              })
            }}
            title={
              commonFields.length > 0
                ? `Show only shared field columns (${commonFields.length})`
                : 'Show only shared field columns (price, delivery, contact, …)'
            }
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              commonInfoOnly ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Common info
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((f) => !f)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${
              showFilters ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Filter className="h-3 w-3" strokeWidth={1.75} />
            Filters
          </button>
          <div className="relative" ref={fieldPickerRef}>
            <button
              type="button"
              onClick={() => setFieldPickerOpen((v) => !v)}
              className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Fields ({selectedFields.length > 0 ? selectedFields.length : allFields.length})
            </button>
            {fieldPickerOpen && (
              <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5">
                <input
                  type="search"
                  value={fieldSearch}
                  onChange={(e) => setFieldSearch(e.target.value)}
                  placeholder="Search fields…"
                  className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-400/20"
                />
                <div className="mb-2 flex justify-between px-1 text-[11px] text-slate-500">
                  <button
                    type="button"
                    onClick={() => {
                      setCommonInfoOnly(false)
                      onSelectedFieldsChange(allFields)
                    }}
                    className="hover:text-slate-700"
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCommonInfoOnly(false)
                      onSelectedFieldsChange([])
                    }}
                    className="hover:text-slate-700"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {allFields
                    .filter((f) =>
                      fieldSearch.trim() ? f.toLowerCase().includes(fieldSearch.trim().toLowerCase()) : true
                    )
                    .map((field) => (
                      <label key={field} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(field)}
                          onChange={(e) => {
                            setCommonInfoOnly(false)
                            onSelectedFieldsChange(
                              e.target.checked
                                ? [...selectedFields, field]
                                : selectedFields.filter((v) => v !== field)
                            )
                          }}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        <span className="truncate text-slate-700">{field}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex-1" />
          <span className="text-[11px] text-slate-400">
            {displayRows.length} vendor{displayRows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 bg-slate-50 px-3.5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filters</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Max price</span>
              <input
                type="range"
                min={minPrice}
                max={priceSliderMax}
                step={10}
                value={priceRange[1]}
                onChange={(e) => onPriceRangeChange([priceRange[0], Number(e.target.value)])}
                className="w-24 accent-blue-600"
              />
              <span className="min-w-[60px] font-mono text-xs font-medium text-slate-700">
                {priceRange[1] >= priceSliderMax ? 'No limit' : `$${priceRange[1]}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onOnlyAvailableChange(false)
                setShipsToday(false)
                setCommonVendorsOnly(false)
                setCommonInfoOnly(false)
                onSelectedFieldsChange(allFields)
                onPriceRangeChange([minPrice, maxPrice])
                setVendorSearch('')
              }}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
            >
              Reset all
            </button>
          </div>
        )}

        {/* Selection bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-3.5 py-1.5">
            <span className="text-xs font-semibold text-blue-800">{selectedIds.size} selected</span>
            <div className="h-3.5 w-px bg-blue-200" />
            <button
              type="button"
              onClick={onAddSelectedToBucket}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
            >
              <ShoppingCart className="h-3 w-3" />
              Add to bucket
            </button>
            <button
              type="button"
              onClick={onCompareSelected}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
            >
              Compare
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                selectedIds.forEach((id) => onToggleSelected(id))
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}

        {/* Table */}
        {effectiveView === 'table' && (
          <div className="flex-1 overflow-auto">
            <table className={`w-full table-fixed border-collapse ${showPartColumn ? 'min-w-[920px]' : 'min-w-[780px]'}`}>
              <thead className="sticky top-0 z-[5] bg-slate-50">
                <tr>
                  <th className="h-9 w-10 border-b border-slate-200 pl-3.5">
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < sortedRows.length
                      }}
                      checked={selectedIds.size === sortedRows.length && sortedRows.length > 0}
                      onChange={toggleAllRows}
                      className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                    />
                  </th>
                  {(
                    [
                      ...(showPartColumn ? [{ label: 'Part', key: null, w: '14%' } as const] : []),
                      { label: 'Vendor', key: 'vendor', w: showPartColumn ? '20%' : '24%' },
                      { label: 'Score', key: 'score', w: '10%' },
                      { label: 'Price', key: 'price', w: '10%' },
                      { label: 'vs Avg', key: null, w: '8%' },
                      { label: 'Stock', key: null, w: '10%' },
                      { label: 'Contact', key: null, w: '12%' },
                      { label: 'Delivery', key: null, w: '16%' },
                    ] as const
                  ).map((col) => (
                    <th
                      key={col.label}
                      className="h-9 cursor-pointer select-none border-b border-slate-200 px-3.5 text-left"
                      style={col.w ? { width: col.w } : undefined}
                      onClick={col.key ? () => toggleSort(col.key) : undefined}
                    >
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${
                          sortKey === col.key ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      >
                        {col.label}
                        {col.key && <SortIcon field={col.key} />}
                      </span>
                    </th>
                  ))}
                  <th className="h-9 w-[90px] border-b border-slate-200" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={showPartColumn ? 10 : 9}>
                      <div className="py-12 text-center">
                        <AlertCircle className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">No vendors match current filters</p>
                        <p className="text-xs text-slate-400">Adjust your search or clear filters</p>
                      </div>
                    </td>
                  </tr>
                )}
                {sortedRows.map((row) => {
                  const isSel = selectedIds.has(row.id)
                  const isHov = hoverRowId === row.id
                  const isBest = bestPrice != null && row.price === bestPrice
                  const vsAvg = getVsAvg(row)
                  const vsCol = vsAvg != null && vsAvg <= -5 ? 'text-emerald-600' : vsAvg != null && vsAvg >= 5 ? 'text-red-600' : 'text-slate-500'
                  const score = getScore(row)
                  const d = (row.delivery || '').toLowerCase()
                  const shipsTodayRow = d.includes('today') || d.includes('same day')
                  const isCommonVendor = commonDomainSet.has(extractRowDomain(row.url))

                  return (
                    <tr
                      key={row.id}
                      onMouseEnter={() => setHoverRowId(row.id)}
                      onMouseLeave={() => setHoverRowId(null)}
                      onClick={() => onToggleSelected(row.id)}
                      className={`cursor-pointer border-b border-slate-100 transition-colors ${
                        isSel ? 'bg-blue-50' : isHov ? 'bg-slate-50' : 'bg-white'
                      }`}
                    >
                      <td className="h-11 pl-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => onToggleSelected(row.id)}
                          className="h-3.5 w-3.5 cursor-pointer rounded accent-blue-600"
                        />
                      </td>
                      {showPartColumn && (
                        <td className="h-11 px-3.5">
                          <span className="block truncate font-mono text-[11px] font-medium text-slate-700" title={row.partLabel}>
                            {row.partLabel || '—'}
                          </span>
                        </td>
                      )}
                      <td className="h-11 px-3.5">
                        <div className="flex items-center gap-2">
                          <VendorThumb imageUrl={row.imageUrl} vendor={row.vendor} />
                          <div className="min-w-0">
                            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-slate-800">{row.vendor}</span>
                              {isBest && <Tag variant="green">Best price</Tag>}
                              {shipsTodayRow && <Tag variant="blue">Ships today</Tag>}
                              {isCommonVendor && commonDomainSet.size > 0 && (
                                <Tag variant="yellow">Shared</Tag>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">{getDeliverySub(row)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="h-11 px-3.5">
                        {score != null ? <ScoreBar score={score} /> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="h-11 px-3.5">
                        <span className={`font-mono text-[15px] font-bold ${isBest ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {money(row.price, '—')}
                        </span>
                      </td>
                      <td className="h-11 px-3.5">
                        {vsAvg != null ? (
                          <span className={`font-mono text-xs font-semibold ${vsCol}`}>
                            {vsAvg >= 0 ? '+' : ''}
                            {vsAvg.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="h-11 px-3.5 font-mono text-xs text-slate-600">
                        {row.availability && row.availability !== '—' && row.availability !== 'Unknown' ? (
                          row.availability
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="h-11 px-3.5 font-mono text-xs text-slate-600">
                        {row.contact && row.contact !== '—' ? row.contact : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="h-11 max-w-0 px-3.5">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                          <DeliveryDot row={row} />
                          <span
                            className="truncate text-[11px] leading-snug text-slate-600"
                            title={row.delivery?.trim() || undefined}
                          >
                            {row.delivery || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="h-11 px-2.5" onClick={(e) => e.stopPropagation()}>
                        <div
                          className={`flex justify-end gap-1 transition-opacity ${
                            isHov || isSel ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onAddSingleToBucket(row.id)}
                            className="rounded border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50"
                            aria-label="Add to bucket"
                          >
                            <ShoppingCart className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-slate-600 hover:bg-slate-100"
                            aria-label="Wishlist"
                          >
                            <Heart className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {effectiveView === 'decisions' && (
          <div className="flex-1 overflow-y-auto p-4">
            <ComparePartDecisionsPanel
              rows={decisionBoardRows && decisionBoardRows.length > 0 ? decisionBoardRows : displayRows}
              onAddToBucket={onAddSingleToBucket}
            />
          </div>
        )}

        {effectiveView === 'insights' && (
          <div className="flex-1 overflow-y-auto p-4">
            <CompareInsightsPanel
              partLabel={partLabel}
              rows={filteredRows}
              onViewChange={onViewChange}
              onAddToBucket={onAddSingleToBucket}
            />
          </div>
        )}

        {effectiveView === 'mindmap' && (
          <div className="flex-1 overflow-hidden bg-slate-50 p-4">
            <CompareMindMapPanel
              partLabel={partLabel}
              rows={displayRows}
              onViewChange={onViewChange}
              onAddToBucket={onAddSingleToBucket}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 px-3.5 py-2">
          <span className="text-xs text-slate-400">
            {displayRows.length} vendor{displayRows.length !== 1 ? 's' : ''} · {totalVendorSources} found
          </span>
          {selectedIds.size > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-xs font-medium text-blue-600">{selectedIds.size} selected</span>
            </>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </button>
          {onSaveView && (
            <button
              type="button"
              onClick={onSaveView}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="h-3 w-3" />
              Save view
            </button>
          )}
        </div>
      </div>
      </div>
      <CompareSparkAiPanel
        open={sparkAiOpen}
        onClose={() => setSparkAiOpen(false)}
        partLabel={partLabel}
        rows={filteredRows}
        partChips={partChips}
        activePartId={activePartId}
      />
    </div>
  )
}
