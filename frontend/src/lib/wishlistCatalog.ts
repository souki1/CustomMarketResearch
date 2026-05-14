import { listPortfolioItems, listResearchUrls, type PortfolioItem, type ResearchUrlItem } from '@/lib/api'
import { primaryTextFromDataRow } from '@/components/compare/dataRow'

export type WishlistCatalogItem = {
  id: string
  part: string
  vendor: string
  companyBrand: string
  price: number | null
  score: number | null
  contact: string
  delivery: string
  shipsToday: boolean
  available: boolean
  url?: string
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function getVendorNameFromSourceData(data: Record<string, unknown>, url: string): string {
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
  return extractDomain(url)
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

function parseScoreValue(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw.replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function isAvailable(availabilityRaw: string | null): boolean {
  if (!availabilityRaw) return true
  return /in stock|available|low stock/i.test(availabilityRaw)
}

function shipsTodayFromDelivery(delivery: string, availabilityRaw: string | null): boolean {
  if (/ships?\s*today|same\s*day/i.test(delivery)) return true
  if (availabilityRaw && /ships?\s*today/i.test(availabilityRaw)) return true
  return false
}

function catalogId(part: string, vendor: string, url: string, researchId: number, index: number): string {
  const base = `${researchId}::${index}::${part}::${vendor}::${url}`.trim()
  return base.replace(/\s+/g, '_')
}

function partLabelFromResearch(row: ResearchUrlItem): string {
  const fromRow = primaryTextFromDataRow(row.row_data)
  if (fromRow) return fromRow
  const query = row.search_query?.trim()
  if (query) return query
  return '—'
}

function getCompanyBrandFromSourceData(data: Record<string, unknown>, vendor: string): string {
  const company = pickFirstFieldValue(data, [/^company$/i, /company/i, /corporation/i, /business/i])
  const brand = pickFirstFieldValue(data, [/^brand$/i, /brand/i, /manufacturer/i, /make/i, /oem/i])
  const parts = [company, brand].filter((value): value is string => Boolean(value?.trim()))
  if (parts.length > 0) return parts.join(' · ')
  return vendor
}

function mapScrapedSource(
  row: ResearchUrlItem,
  sourceIndex: number,
  url: string,
  data: Record<string, unknown>
): WishlistCatalogItem {
  const part = partLabelFromResearch(row)
  const vendor = getVendorNameFromSourceData(data, url)
  const companyBrand = getCompanyBrandFromSourceData(data, vendor)
  const priceRaw = pickFirstFieldValue(data, [/^price$/i, /price/i, /cost/i, /amount/i, /msrp/i])
  const availabilityRaw =
    pickFirstFieldValue(data, [/availability/i, /stock/i, /status/i]) ?? null
  const ratingRaw = pickFirstFieldValue(data, [/rating/i, /score/i, /stars?/i])
  const delivery = pickFirstFieldValue(data, [/delivery/i, /eta/i, /lead.?time/i, /shipping/i]) ?? '—'
  const contact = pickFirstFieldValue(data, [/contact/i, /phone/i, /email/i, /support/i]) ?? '—'
  const price = parseMoneyValue(priceRaw)
  const score = parseScoreValue(ratingRaw)
  return {
    id: catalogId(part, vendor, url, row.id, sourceIndex),
    part,
    vendor,
    companyBrand,
    price,
    score,
    contact,
    delivery,
    shipsToday: shipsTodayFromDelivery(delivery, availabilityRaw),
    available: isAvailable(availabilityRaw),
    url,
  }
}

function mapPortfolioItem(item: PortfolioItem, index: number): WishlistCatalogItem | null {
  const part = (item.part_number ?? '').trim()
  const vendor = (item.vendor_name ?? '').trim()
  const url = (item.url ?? '').trim()
  if (!part && !vendor) return null
  const price = parseMoneyValue(item.price)
  const resolvedVendor = vendor || (url ? extractDomain(url) : '—')
  return {
    id: `portfolio::${index}::${part}::${vendor}::${url}`.replace(/\s+/g, '_'),
    part: part || '—',
    vendor: resolvedVendor,
    companyBrand: resolvedVendor,
    price,
    score: null,
    contact: '—',
    delivery: '—',
    shipsToday: false,
    available: true,
    url: url || undefined,
  }
}

export function buildWishlistCatalogFromResearch(items: ResearchUrlItem[]): WishlistCatalogItem[] {
  const out: WishlistCatalogItem[] = []
  for (const row of items) {
    const scraped = row.scraped_data ?? []
    if (scraped.length === 0) continue
    scraped.forEach((source, index) => {
      const data = (source.data ?? {}) as Record<string, unknown>
      const url = (source.url ?? row.urls[index] ?? row.urls[0] ?? '').trim()
      if (!url && Object.keys(data).length === 0) return
      out.push(mapScrapedSource(row, index, url, data))
    })
  }
  return out
}

export function mergeWishlistCatalogItems(
  researchItems: ResearchUrlItem[],
  portfolioItems: PortfolioItem[]
): WishlistCatalogItem[] {
  const byId = new Map<string, WishlistCatalogItem>()
  for (const item of buildWishlistCatalogFromResearch(researchItems)) {
    byId.set(item.id, item)
  }
  portfolioItems.forEach((item, index) => {
    const mapped = mapPortfolioItem(item, index)
    if (!mapped) return
    if (!byId.has(mapped.id)) byId.set(mapped.id, mapped)
  })
  return [...byId.values()].sort((a, b) => {
    const partCmp = a.part.localeCompare(b.part)
    if (partCmp !== 0) return partCmp
    return a.vendor.localeCompare(b.vendor)
  })
}

export async function fetchWishlistCatalogItems(token: string): Promise<WishlistCatalogItem[]> {
  const [researchItems, portfolioItems] = await Promise.all([
    listResearchUrls(token).catch(() => [] as ResearchUrlItem[]),
    listPortfolioItems(token).catch(() => [] as PortfolioItem[]),
  ])
  return mergeWishlistCatalogItems(researchItems, portfolioItems)
}
