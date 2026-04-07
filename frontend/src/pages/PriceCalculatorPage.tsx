import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calculator,
  Clock,
  Crown,
  ExternalLink,
  Loader2,
  Package,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { getToken } from '@/lib/auth'
import { aiGroqChat, listPortfolioItems } from '@/lib/api'
import type { AiChatHistoryMessage, PortfolioItem } from '@/lib/api'
import { Card } from '@/components'

function partLabel(item: PortfolioItem): string {
  const p = item.part_number
  return p != null && String(p).trim() ? String(p).trim() : '—'
}

function vendorLabel(item: PortfolioItem): string {
  const v = item.vendor_name
  return v != null && String(v).trim() ? String(v).trim() : '—'
}

function uniqueSortedPartLabels(items: PortfolioItem[]): string[] {
  const set = new Set<string>()
  for (const item of items) {
    set.add(partLabel(item))
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

function parsePrice(s: string | null | undefined): number | null {
  if (s == null || !String(s).trim()) return null
  const cleaned = String(s).replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(n)
}

function parseNum(s: string): number {
  const t = s.replace(/,/g, '').trim()
  if (t === '' || t === '-') return 0
  const n = Number(t)
  return Number.isFinite(n) ? n : 0
}

function formatPct(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

/** Stable id for a portfolio offer row (for selection / compare slots). */
function offerStableKey(row: PortfolioItem): string {
  const parts = [
    row.part_number ?? '',
    row.vendor_name ?? '',
    row.price ?? '',
    row.quantity != null && Number.isFinite(row.quantity) ? String(row.quantity) : '',
    row.url ?? '',
    row.row_index != null ? String(row.row_index) : '',
  ]
  return parts.join('\u001f')
}

type CompareLine = {
  key: string
  /** Scenario quantity (editable). Empty/invalid falls back to portfolio qty, then 1 for math. */
  qty: string
}

type CompareGroup = {
  id: string
  lines: CompareLine[]
}

function defaultQtyFromRow(row: PortfolioItem): string {
  if (row.quantity != null && Number.isFinite(row.quantity) && row.quantity > 0) {
    return String(row.quantity)
  }
  return '1'
}

function effectiveScenarioQty(qtyInput: string, row: PortfolioItem): number {
  const t = qtyInput.replace(/,/g, '').trim()
  if (t !== '') {
    const n = parseFloat(t)
    if (Number.isFinite(n) && n > 0) return n
  }
  if (row.quantity != null && Number.isFinite(row.quantity) && row.quantity > 0) return row.quantity
  return 1
}

/** JSON sent to AI as chat `context` (grounding). */
function buildScenarioContextPayload(
  groups: CompareGroup[],
  summaries: Array<{ lines: number; sumExt: number; minUnit: number | null }>,
  offerByKey: Map<string, PortfolioItem>,
) {
  return {
    type: 'price_calculator_scenarios' as const,
    generated_at: new Date().toISOString(),
    scenarios: groups.map((g, i) => {
      const s = summaries[i] ?? { lines: 0, sumExt: 0, minUnit: null as number | null }
      const lines = g.lines
        .filter((line) => offerByKey.has(line.key))
        .map((line) => {
          const row = offerByKey.get(line.key)!
          const unit = parsePrice(row.price)
          const qEff = effectiveScenarioQty(line.qty, row)
          const ext = unit != null ? unit * qEff : null
          return {
            part: partLabel(row),
            vendor: vendorLabel(row),
            unit_price_raw: row.price,
            unit_price_numeric: unit,
            scenario_qty_input: line.qty,
            effective_quantity: qEff,
            line_extended_estimate_usd: ext,
          }
        })
      return {
        name: `Compare ${i + 1}`,
        line_count: s.lines,
        estimated_extended_total_usd: s.sumExt,
        best_unit_price_usd: s.minUnit,
        lines,
      }
    }),
  }
}

const SLOT_COLORS = [
  { top: 'border-t-4 border-t-slate-700', badge: 'bg-slate-700', dot: 'bg-slate-600', bar: 'bg-slate-600' },
  { top: 'border-t-4 border-t-emerald-600', badge: 'bg-emerald-600', dot: 'bg-emerald-500', bar: 'bg-emerald-600' },
  { top: 'border-t-4 border-t-blue-600', badge: 'bg-blue-600', dot: 'bg-blue-500', bar: 'bg-blue-600' },
  { top: 'border-t-4 border-t-amber-600', badge: 'bg-amber-600', dot: 'bg-amber-500', bar: 'bg-amber-600' },
  { top: 'border-t-4 border-t-violet-600', badge: 'bg-violet-600', dot: 'bg-violet-500', bar: 'bg-violet-600' },
  { top: 'border-t-4 border-t-rose-600', badge: 'bg-rose-600', dot: 'bg-rose-500', bar: 'bg-rose-600' },
] as const

function slotColor(idx: number) {
  return SLOT_COLORS[idx % SLOT_COLORS.length]!
}

function safeHttpUrl(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const t = raw.trim()
  if (t.length > 2048) return null
  if (!/^https?:\/\//i.test(t)) return null
  return t
}

function urlLinkLabel(href: string): string {
  try {
    const u = new URL(href)
    return u.hostname.replace(/^www\./i, '') || href
  } catch {
    return href.length > 40 ? `${href.slice(0, 37)}\u2026` : href
  }
}

const PART_CHECK =
  'h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 accent-blue-600 focus:ring-blue-500/40'

const INPUT_SM =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

const SELECT_SM =
  'w-full cursor-pointer rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'

type OfferSortMode = 'part-asc' | 'vendor-asc' | 'vendor-desc' | 'price-asc' | 'price-desc'

function offersSubtitle(selected: Set<string>): string {
  const n = selected.size
  if (n === 0) return ''
  if (n === 1) {
    const only = [...selected][0]!
    return only
  }
  const labels = [...selected].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  if (n <= 3) return labels.join(', ')
  return `${n} parts`
}

function rowMatchesSearch(row: PortfolioItem, q: string): boolean {
  if (!q) return true
  const pl = partLabel(row).toLowerCase()
  const vl = vendorLabel(row).toLowerCase()
  const price = (row.price ?? '').toLowerCase()
  const url = (row.url ?? '').toLowerCase()
  let host = ''
  const href = safeHttpUrl(row.url)
  if (href) {
    try {
      host = new URL(href).hostname.toLowerCase()
    } catch {
      // ignore
    }
  }
  return (
    pl.includes(q) ||
    vl.includes(q) ||
    price.includes(q) ||
    url.includes(q) ||
    (host.length > 0 && host.includes(q))
  )
}

function sortOfferRows(rows: PortfolioItem[], mode: OfferSortMode): PortfolioItem[] {
  const out = [...rows]
  out.sort((a, b) => {
    const pa = partLabel(a)
    const pb = partLabel(b)
    const va = vendorLabel(a).toLowerCase()
    const vb = vendorLabel(b).toLowerCase()
    const na = parsePrice(a.price)
    const nb = parsePrice(b.price)

    switch (mode) {
      case 'part-asc': {
        const c = pa.localeCompare(pb, undefined, { sensitivity: 'base' })
        if (c !== 0) return c
        const v = va.localeCompare(vb)
        if (v !== 0) return v
        return (a.price ?? '').localeCompare(b.price ?? '')
      }
      case 'vendor-desc': {
        const c = vb.localeCompare(va)
        if (c !== 0) return c
        const p = pa.localeCompare(pb, undefined, { sensitivity: 'base' })
        if (p !== 0) return p
        return (a.price ?? '').localeCompare(b.price ?? '')
      }
      case 'vendor-asc': {
        const c = va.localeCompare(vb)
        if (c !== 0) return c
        const p = pa.localeCompare(pb, undefined, { sensitivity: 'base' })
        if (p !== 0) return p
        return (a.price ?? '').localeCompare(b.price ?? '')
      }
      case 'price-desc': {
        if (na != null && nb != null && na !== nb) return nb - na
        if (na != null && nb == null) return -1
        if (na == null && nb != null) return 1
        return va.localeCompare(vb)
      }
      case 'price-asc': {
        if (na != null && nb != null && na !== nb) return na - nb
        if (na != null && nb == null) return -1
        if (na == null && nb != null) return 1
        return va.localeCompare(vb)
      }
      default:
        return 0
    }
  })
  return out
}

export function PriceCalculatorPage() {
  const token = useMemo(() => getToken(), [])
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedPartLabels, setSelectedPartLabels] = useState<Set<string>>(() => new Set())

  const [partListSearch, setPartListSearch] = useState('')
  const [offerSearch, setOfferSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState<string>('all')
  const [requireUrl, setRequireUrl] = useState(false)
  const [offerSort, setOfferSort] = useState<OfferSortMode>('part-asc')

  const [checkedOfferKeys, setCheckedOfferKeys] = useState<Set<string>>(() => new Set())
  const [compareGroups, setCompareGroups] = useState<CompareGroup[]>(() => [
    { id: 'compare-1', lines: [] },
    { id: 'compare-2', lines: [] },
  ])
  const [addToSlotIndex, setAddToSlotIndex] = useState(0)

  const [aiMessages, setAiMessages] = useState<AiChatHistoryMessage[]>([])
  const [aiSessionId, setAiSessionId] = useState<string | null>(null)
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [scenarioSwitchCost, setScenarioSwitchCost] = useState('0')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listPortfolioItems(token)
      setItems(data)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load portfolio')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const uniqueParts = useMemo(() => uniqueSortedPartLabels(items), [items])

  const filteredPartsForList = useMemo(() => {
    const q = partListSearch.trim().toLowerCase()
    if (!q) return uniqueParts
    return uniqueParts.filter((p) => p.toLowerCase().includes(q))
  }, [uniqueParts, partListSearch])

  useEffect(() => {
    const valid = new Set(uniqueParts)
    setSelectedPartLabels((prev) => {
      const next = new Set<string>()
      for (const p of prev) {
        if (valid.has(p)) next.add(p)
      }
      if (next.size === prev.size) {
        let same = true
        for (const p of prev) {
          if (!next.has(p)) {
            same = false
            break
          }
        }
        if (same) return prev
      }
      return next
    })
  }, [uniqueParts])

  const togglePart = useCallback((label: string) => {
    setSelectedPartLabels((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const clearPartSelection = useCallback(() => {
    setSelectedPartLabels(new Set())
  }, [])

  const offersForSelection = useMemo(() => {
    if (selectedPartLabels.size === 0) return []
    return items
      .filter((i) => selectedPartLabels.has(partLabel(i)))
      .slice()
      .sort((a, b) => {
        const pa = partLabel(a)
        const pb = partLabel(b)
        const pc = pa.localeCompare(pb, undefined, { sensitivity: 'base' })
        if (pc !== 0) return pc
        const va = vendorLabel(a).toLowerCase()
        const vb = vendorLabel(b).toLowerCase()
        const c = va.localeCompare(vb)
        if (c !== 0) return c
        const pra = (a.price ?? '').localeCompare(b.price ?? '')
        if (pra !== 0) return pra
        return (a.url ?? '').localeCompare(b.url ?? '')
      })
  }, [items, selectedPartLabels])

  const vendorNamesInSelection = useMemo(() => {
    const set = new Set<string>()
    for (const row of offersForSelection) {
      set.add(vendorLabel(row))
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [offersForSelection])

  useEffect(() => {
    if (vendorFilter !== 'all' && !vendorNamesInSelection.includes(vendorFilter)) {
      setVendorFilter('all')
    }
  }, [vendorFilter, vendorNamesInSelection])

  const filteredOffers = useMemo(() => {
    let rows = offersForSelection
    const q = offerSearch.trim().toLowerCase()

    if (vendorFilter !== 'all') {
      rows = rows.filter((r) => vendorLabel(r) === vendorFilter)
    }
    if (requireUrl) {
      rows = rows.filter((r) => safeHttpUrl(r.url) != null)
    }
    if (q) {
      rows = rows.filter((r) => rowMatchesSearch(r, q))
    }
    return sortOfferRows(rows, offerSort)
  }, [offersForSelection, vendorFilter, requireUrl, offerSearch, offerSort])

  const hasActiveOfferFilters =
    offerSearch.trim() !== '' || vendorFilter !== 'all' || requireUrl || offerSort !== 'part-asc'

  const clearOfferFilters = useCallback(() => {
    setOfferSearch('')
    setVendorFilter('all')
    setRequireUrl(false)
    setOfferSort('part-asc')
  }, [])

  const offerByKey = useMemo(() => {
    const m = new Map<string, PortfolioItem>()
    for (const row of items) {
      m.set(offerStableKey(row), row)
    }
    return m
  }, [items])

  useEffect(() => {
    setCheckedOfferKeys((prev) => {
      const next = new Set<string>()
      for (const k of prev) {
        if (offerByKey.has(k)) next.add(k)
      }
      if (next.size === prev.size && [...prev].every((x) => next.has(x))) return prev
      return next
    })
    setCompareGroups((groups) =>
      groups.map((g) => ({
        ...g,
        lines: g.lines.filter((line) => offerByKey.has(line.key)),
      })),
    )
  }, [offerByKey])

  const filteredOfferKeys = useMemo(
    () => filteredOffers.map((r) => offerStableKey(r)),
    [filteredOffers],
  )

  const allFilteredChecked =
    filteredOfferKeys.length > 0 && filteredOfferKeys.every((k) => checkedOfferKeys.has(k))
  const filteredSelectionIndeterminate =
    filteredOfferKeys.some((k) => checkedOfferKeys.has(k)) && !allFilteredChecked

  const toggleOfferChecked = useCallback((key: string) => {
    setCheckedOfferKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleAllFiltered = useCallback(() => {
    setCheckedOfferKeys((prev) => {
      const next = new Set(prev)
      if (filteredOfferKeys.length === 0) return prev
      const allIn = filteredOfferKeys.every((k) => next.has(k))
      if (allIn) {
        for (const k of filteredOfferKeys) next.delete(k)
      } else {
        for (const k of filteredOfferKeys) next.add(k)
      }
      return next
    })
  }, [filteredOfferKeys])

  const addCheckedToSlot = useCallback(() => {
    if (checkedOfferKeys.size === 0) return
    setCompareGroups((groups) => {
      const slot = groups[addToSlotIndex]
      if (!slot) return groups
      const order: string[] = []
      const byKey = new Map<string, CompareLine>()
      for (const line of slot.lines) {
        byKey.set(line.key, line)
        order.push(line.key)
      }
      for (const k of checkedOfferKeys) {
        const row = offerByKey.get(k)
        if (!row) continue
        if (!byKey.has(k)) {
          byKey.set(k, { key: k, qty: defaultQtyFromRow(row) })
          order.push(k)
        }
      }
      const newLines = order.map((k) => byKey.get(k)!)
      return groups.map((g, i) => (i === addToSlotIndex ? { ...g, lines: newLines } : g))
    })
    setCheckedOfferKeys(new Set())
  }, [addToSlotIndex, checkedOfferKeys, offerByKey])

  const removeKeyFromSlot = useCallback((slotIndex: number, key: string) => {
    setCompareGroups((groups) =>
      groups.map((g, i) =>
        i === slotIndex ? { ...g, lines: g.lines.filter((line) => line.key !== key) } : g,
      ),
    )
  }, [])

  const updateLineQty = useCallback((slotIndex: number, key: string, qty: string) => {
    setCompareGroups((groups) =>
      groups.map((g, i) => {
        if (i !== slotIndex) return g
        return {
          ...g,
          lines: g.lines.map((line) => (line.key === key ? { ...line, qty } : line)),
        }
      }),
    )
  }, [])

  const clearSlot = useCallback((slotIndex: number) => {
    setCompareGroups((groups) =>
      groups.map((g, i) => (i === slotIndex ? { ...g, lines: [] } : g)),
    )
  }, [])

  const addCompareSlot = useCallback(() => {
    setCompareGroups((prev) => {
      const next = [
        ...prev,
        { id: `compare-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, lines: [] },
      ]
      queueMicrotask(() => setAddToSlotIndex(next.length - 1))
      return next
    })
  }, [])

  const removeCompareSlot = useCallback((slotIndex: number) => {
    setCompareGroups((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== slotIndex)
      queueMicrotask(() =>
        setAddToSlotIndex((idx) => Math.min(idx, Math.max(0, next.length - 1))),
      )
      return next
    })
  }, [])

  const groupSummaries = useMemo(() => {
    return compareGroups.map((g) => {
      let lines = 0
      let sumExt = 0
      let minUnit: number | null = null
      for (const line of g.lines) {
        const row = offerByKey.get(line.key)
        if (!row) continue
        lines += 1
        const unit = parsePrice(row.price)
        const qEff = effectiveScenarioQty(line.qty, row)
        if (unit != null) {
          minUnit = minUnit == null ? unit : Math.min(minUnit, unit)
          sumExt += unit * qEff
        }
      }
      const vendors = new Set<string>()
      for (const line of g.lines) {
        const row = offerByKey.get(line.key)
        if (row) vendors.add(vendorLabel(row))
      }
      return { lines, sumExt, minUnit, vendorCount: vendors.size }
    })
  }, [compareGroups, offerByKey])

  const lowestTotalSlotIdx = useMemo(() => {
    let best = -1
    let bestVal = Number.POSITIVE_INFINITY
    for (let i = 0; i < groupSummaries.length; i++) {
      const s = groupSummaries[i]!
      if (s.lines > 0 && s.sumExt > 0 && s.sumExt < bestVal) {
        bestVal = s.sumExt
        best = i
      }
    }
    const hasTie = groupSummaries.filter((s) => s.lines > 0 && s.sumExt === bestVal).length > 1
    return hasTie ? -1 : best
  }, [groupSummaries])

  const totalLinesAllSlots = useMemo(
    () => groupSummaries.reduce((a, s) => a + s.lines, 0),
    [groupSummaries],
  )

  const totalVendorsAllSlots = useMemo(() => {
    const s = new Set<string>()
    for (const g of compareGroups) {
      for (const line of g.lines) {
        const row = offerByKey.get(line.key)
        if (row) s.add(vendorLabel(row))
      }
    }
    return s.size
  }, [compareGroups, offerByKey])

  const compare12Metrics = useMemo(() => {
    const s0 = groupSummaries[0]
    const s1 = groupSummaries[1]
    const spendA = s0?.sumExt ?? 0
    const spendB = s1?.sumExt ?? 0
    const nre = parseNum(scenarioSwitchCost)
    const savings = spendA - spendB
    const savingsPct = spendA > 0 ? (savings / spendA) * 100 : 0
    const paybackMonths =
      savings > 0 && nre > 0 ? (nre / savings) * 12 : savings > 0 ? 0 : null
    const maxSpend = Math.max(spendA, spendB, 1)
    const canCompare = (s0?.lines ?? 0) > 0 && (s1?.lines ?? 0) > 0
    return {
      spendA,
      spendB,
      savings,
      savingsPct,
      paybackMonths,
      nre,
      barA: (spendA / maxSpend) * 100,
      barB: (spendB / maxSpend) * 100,
      canCompare,
    }
  }, [groupSummaries, scenarioSwitchCost])

  const hasScenarioLines = useMemo(
    () => compareGroups.some((g) => g.lines.length > 0),
    [compareGroups],
  )

  const runScenarioAi = useCallback(async () => {
    const q = aiInput.trim()
    if (!q || !token) return
    if (!hasScenarioLines) {
      setAiError('Add at least one offer to a compare slot before asking the AI.')
      return
    }
    const prior = aiMessages
    setAiError(null)
    setAiLoading(true)
    setAiInput('')
    setAiMessages([...prior, { role: 'user', content: q }])
    try {
      const payload = buildScenarioContextPayload(compareGroups, groupSummaries, offerByKey)
      const res = await aiGroqChat(token, {
        mode: 'chat',
        message: q,
        history: prior,
        session_id: aiSessionId ?? undefined,
        context: JSON.stringify(payload),
        session_label: 'Price calculator \u2014 scenarios',
        source: 'price_calculator',
      })
      setAiSessionId(res.session_id)
      setAiMessages((prev) => [...prev, { role: 'assistant', content: res.content }])
    } catch (e) {
      setAiMessages(prior)
      setAiInput(q)
      setAiError(e instanceof Error ? e.message : 'AI request failed')
    } finally {
      setAiLoading(false)
    }
  }, [
    aiInput,
    aiMessages,
    aiSessionId,
    compareGroups,
    groupSummaries,
    hasScenarioLines,
    offerByKey,
    token,
  ])

  const clearAiChat = useCallback(() => {
    setAiMessages([])
    setAiSessionId(null)
    setAiError(null)
    setAiInput('')
  }, [])

  const multiPart = selectedPartLabels.size > 1
  const selectedCount = selectedPartLabels.size

  const authHint = !token ? 'Sign in to see parts and vendors from your portfolio.' : null
  const showEmpty = token && !loading && !loadError && items.length === 0

  return (
    <div className="min-h-full bg-linear-to-b from-slate-50/90 to-white pb-12">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2 text-blue-600">
            <Calculator className="h-5 w-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-wide">Pricing</span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900 md:text-3xl">
            Price calculator
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
            Select parts, filter offers, then tick lines and add them to Compare 1, Compare 2, or more slots to
            contrast scenarios side by side—without leaving this page.
          </p>
        </header>

        {authHint && (
          <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
            {authHint}
          </p>
        )}

        {loadError && (
          <p className="rounded-lg border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        )}

        {token && loading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" aria-hidden />
            Loading portfolio…
          </div>
        )}

        {showEmpty && (
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
            No portfolio data yet. Save offers from your research sheets to see parts and vendors here.
          </p>
        )}

        {token && !loading && !loadError && items.length > 0 && (
          <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_1fr]">
            <Card className="border-gray-200/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <Package className="h-4 w-4 text-gray-500" aria-hidden />
                  Parts ({uniqueParts.length})
                </div>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={clearPartSelection}
                    className="text-xs font-medium text-blue-700 underline decoration-blue-400/50 underline-offset-2 hover:text-blue-900"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="relative mt-3">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={partListSearch}
                  onChange={(e) => setPartListSearch(e.target.value)}
                  placeholder="Filter parts\u2026"
                  className={`${INPUT_SM} pl-9`}
                  aria-label="Filter parts list"
                />
              </div>
              <ul
                className="mt-3 max-h-[min(28rem,55vh)] space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-slate-50/50 p-1"
                aria-label="Parts"
              >
                {filteredPartsForList.length === 0 ? (
                  <li className="px-2 py-3 text-center text-xs text-gray-500">No parts match.</li>
                ) : (
                  filteredPartsForList.map((label) => {
                    const checked = selectedPartLabels.has(label)
                    const id = `price-calc-part-${encodeURIComponent(label)}`
                    return (
                      <li key={label}>
                        <label
                          htmlFor={id}
                          className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm transition ${
                            checked ? 'bg-blue-50 font-medium text-gray-900' : 'text-gray-800 hover:bg-white'
                          }`}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePart(label)}
                            className={PART_CHECK}
                          />
                          <span className="min-w-0 flex-1 truncate">{label}</span>
                        </label>
                      </li>
                    )
                  })
                )}
              </ul>
            </Card>

            <Card className="border-gray-200/80 p-5">
              {selectedCount === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-gray-500">
                  <Building2 className="h-10 w-10 text-gray-300" aria-hidden />
                  <p>Select one or more parts on the left to see vendors, prices, and URLs.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-100 pb-3">
                    <h2 className="text-sm font-semibold text-gray-900">
                      {selectedCount === 1 ? (
                        <>
                          Offers for <span className="text-blue-700">{offersSubtitle(selectedPartLabels)}</span>
                        </>
                      ) : (
                        <>
                          Offers for <span className="text-blue-700">{selectedCount} parts</span>
                          <span className="mt-1 block text-xs font-normal text-gray-500">
                            {offersSubtitle(selectedPartLabels)}
                          </span>
                        </>
                      )}
                    </h2>
                    <span className="text-xs text-gray-500">
                      {filteredOffers.length}
                      {filteredOffers.length !== offersForSelection.length
                        ? ` of ${offersForSelection.length}`
                        : ''}{' '}
                      line{filteredOffers.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-100 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Filters</span>
                      {hasActiveOfferFilters && (
                        <button
                          type="button"
                          onClick={clearOfferFilters}
                          className="text-xs font-medium text-blue-700 hover:text-blue-900"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="relative sm:col-span-2 lg:col-span-2">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                          aria-hidden
                        />
                        <input
                          type="search"
                          value={offerSearch}
                          onChange={(e) => setOfferSearch(e.target.value)}
                          placeholder="Search part, vendor, price, URL\u2026"
                          className={`${INPUT_SM} pl-9`}
                          aria-label="Search offers"
                        />
                      </div>
                      <div>
                        <label htmlFor="price-calc-vendor" className="sr-only">
                          Vendor
                        </label>
                        <select
                          id="price-calc-vendor"
                          value={vendorFilter}
                          onChange={(e) => setVendorFilter(e.target.value)}
                          className={SELECT_SM}
                          aria-label="Filter by vendor"
                        >
                          <option value="all">All vendors</option>
                          {vendorNamesInSelection.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="price-calc-sort" className="sr-only">
                          Sort
                        </label>
                        <select
                          id="price-calc-sort"
                          value={offerSort}
                          onChange={(e) => setOfferSort(e.target.value as OfferSortMode)}
                          className={SELECT_SM}
                          aria-label="Sort offers"
                        >
                          <option value="part-asc">Sort: Part A\u2013Z</option>
                          <option value="vendor-asc">Sort: Vendor A\u2013Z</option>
                          <option value="vendor-desc">Sort: Vendor Z\u2013A</option>
                          <option value="price-asc">Sort: Price low \u2192 high</option>
                          <option value="price-desc">Sort: Price high \u2192 low</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={requireUrl}
                        onChange={(e) => setRequireUrl(e.target.checked)}
                        className={PART_CHECK}
                      />
                      <span>Has product link only</span>
                    </label>
                  </div>

                  {filteredOffers.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-600">
                      {offersForSelection.length === 0
                        ? 'No offers found for the selected parts.'
                        : 'No offers match the current filters.'}
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto rounded-lg border border-gray-100">
                      <table className="w-full min-w-lg text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <th className="w-11 px-2 py-2.5">
                              <span className="sr-only">Select row</span>
                              <input
                                type="checkbox"
                                ref={(el) => {
                                  if (el) el.indeterminate = filteredSelectionIndeterminate
                                }}
                                checked={allFilteredChecked}
                                onChange={toggleAllFiltered}
                                disabled={filteredOfferKeys.length === 0}
                                className={PART_CHECK}
                                title="Select all visible rows"
                                aria-label="Select all visible rows"
                              />
                            </th>
                            {multiPart && <th className="px-3 py-2.5">Part</th>}
                            <th className="px-3 py-2.5">Vendor</th>
                            <th className="px-3 py-2.5">Price</th>
                            <th className="px-3 py-2.5">Qty</th>
                            <th className="px-3 py-2.5">URL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {filteredOffers.map((row, idx) => {
                            const href = safeHttpUrl(row.url)
                            const rowKey = offerStableKey(row)
                            const trKey = `${idx}-${rowKey}`
                            const rowChecked = checkedOfferKeys.has(rowKey)
                            return (
                              <tr key={trKey} className="hover:bg-slate-50/60">
                                <td className="px-2 py-2.5 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={rowChecked}
                                    onChange={() => toggleOfferChecked(rowKey)}
                                    className={PART_CHECK}
                                    aria-label={`Select offer ${partLabel(row)} \u00b7 ${vendorLabel(row)}`}
                                  />
                                </td>
                                {multiPart && (
                                  <td className="px-3 py-2.5 font-medium text-gray-800">{partLabel(row)}</td>
                                )}
                                <td className="px-3 py-2.5 font-medium text-gray-900">{vendorLabel(row)}</td>
                                <td className="px-3 py-2.5 tabular-nums text-gray-800">
                                  {row.price != null && String(row.price).trim() ? row.price : '\u2014'}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-gray-700">
                                  {row.quantity != null && Number.isFinite(row.quantity)
                                    ? String(row.quantity)
                                    : '\u2014'}
                                </td>
                                <td className="max-w-48 px-3 py-2.5 sm:max-w-xs">
                                  {href ? (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={href}
                                      className="inline-flex max-w-full items-center gap-1 text-blue-700 hover:underline"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                      <span className="min-w-0 truncate">{urlLinkLabel(href)}</span>
                                    </a>
                                  ) : (
                                    <span className="text-gray-400">\u2014</span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          {selectedCount > 0 && (
            <>
            {/* Scenario builder */}
            <section className="mt-8 space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight text-gray-900">Scenario builder</h3>
                  <p className="mt-1 max-w-xl text-sm text-gray-500">
                    Tick offer rows above, then add them to a scenario slot. Adjust quantities per line.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id="price-calc-add-slot"
                    value={addToSlotIndex}
                    onChange={(e) => setAddToSlotIndex(Number(e.target.value))}
                    className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-gray-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    aria-label="Target compare slot"
                  >
                    {compareGroups.map((g, i) => (
                      <option key={g.id} value={i}>
                        Compare {i + 1}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={addCheckedToSlot}
                    disabled={checkedOfferKeys.size === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add{checkedOfferKeys.size > 0 ? ` ${checkedOfferKeys.size}` : ''}
                  </button>
                  <button
                    type="button"
                    onClick={addCompareSlot}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                  >
                    New slot
                  </button>
                </div>
              </div>

              {totalLinesAllSlots > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Scenarios</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{compareGroups.length}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Total lines</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{totalLinesAllSlots}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Vendors</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{totalVendorsAllSlots}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Best total</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                      {lowestTotalSlotIdx >= 0
                        ? formatUsd(groupSummaries[lowestTotalSlotIdx]!.sumExt)
                        : '\u2014'}
                    </p>
                    {lowestTotalSlotIdx >= 0 && (
                      <p className="mt-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                        Compare {lowestTotalSlotIdx + 1}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {compareGroups.map((group, slotIndex) => {
                  const summary = groupSummaries[slotIndex] ?? {
                    lines: 0,
                    sumExt: 0,
                    minUnit: null as number | null,
                    vendorCount: 0,
                  }
                  const colors = slotColor(slotIndex)
                  const isWinner = lowestTotalSlotIdx === slotIndex
                  return (
                    <div
                      key={group.id}
                      className={`flex flex-col overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm ${colors.top}`}
                    >
                      <div className="flex items-center justify-between gap-2 bg-gray-50/80 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold text-white ${colors.badge}`}>
                            {slotIndex + 1}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">
                            Compare {slotIndex + 1}
                          </span>
                          {isWinner && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                              <Crown className="h-3 w-3" aria-hidden />
                              Best
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => clearSlot(slotIndex)}
                            disabled={group.lines.length === 0}
                            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30"
                          >
                            Clear
                          </button>
                          {compareGroups.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeCompareSlot(slotIndex)}
                              className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                              title="Remove slot"
                              aria-label={`Remove Compare ${slotIndex + 1}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="border-b border-gray-100 px-4 py-4">
                        <p className="text-3xl font-bold tabular-nums tracking-tight text-gray-900">
                          {summary.lines > 0 && summary.sumExt > 0 ? formatUsd(summary.sumExt) : '\u2014'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span>{summary.lines} line{summary.lines === 1 ? '' : 's'}</span>
                          {summary.vendorCount > 0 && (
                            <span>{summary.vendorCount} vendor{summary.vendorCount === 1 ? '' : 's'}</span>
                          )}
                          {summary.minUnit != null && (
                            <span className="tabular-nums">Best unit {formatUsd(summary.minUnit)}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto px-1 py-2" style={{ maxHeight: '16rem' }}>
                        {group.lines.length === 0 ? (
                          <div className="flex flex-col items-center justify-center gap-1 py-8 text-center text-xs text-gray-400">
                            <Package className="h-6 w-6 text-gray-300" aria-hidden />
                            <p>Tick rows above, then &ldquo;Add&rdquo;</p>
                          </div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                                <th className="px-3 pb-1">Part / Vendor</th>
                                <th className="px-2 pb-1 text-right">Unit</th>
                                <th className="w-20 px-2 pb-1 text-right">Qty</th>
                                <th className="px-2 pb-1 text-right">Ext.</th>
                                <th className="w-7 pb-1" />
                              </tr>
                            </thead>
                            <tbody>
                              {group.lines
                                .filter((line) => offerByKey.has(line.key))
                                .map((line) => {
                                  const row = offerByKey.get(line.key)!
                                  const qEff = effectiveScenarioQty(line.qty, row)
                                  const unit = parsePrice(row.price)
                                  return (
                                    <tr key={line.key} className="group border-t border-gray-100/80">
                                      <td className="px-3 py-1.5">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} />
                                          <span className="font-medium text-gray-900">{partLabel(row)}</span>
                                        </div>
                                        <span className="ml-3.5 text-gray-500">{vendorLabel(row)}</span>
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-gray-700">
                                        {row.price != null && String(row.price).trim() ? row.price : '\u2014'}
                                      </td>
                                      <td className="px-2 py-1.5 text-right">
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          value={line.qty}
                                          onChange={(e) => updateLineQty(slotIndex, line.key, e.target.value)}
                                          className="w-full rounded border border-gray-200 bg-transparent px-1.5 py-1 text-right tabular-nums text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                                          aria-label={`Qty ${partLabel(row)} ${vendorLabel(row)}`}
                                        />
                                      </td>
                                      <td className="whitespace-nowrap px-2 py-1.5 text-right font-medium tabular-nums text-gray-900">
                                        {unit != null ? formatUsd(unit * qEff) : '\u2014'}
                                      </td>
                                      <td className="px-1 py-1.5 text-center">
                                        <button
                                          type="button"
                                          onClick={() => removeKeyFromSlot(slotIndex, line.key)}
                                          className="rounded p-0.5 text-gray-300 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                                          aria-label="Remove line"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  )
                                })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Impact analysis */}
            <section className="mt-6 overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-4">
                <h3 className="text-base font-semibold tracking-tight text-gray-900">
                  Impact analysis
                  <span className="ml-2 text-sm font-normal text-gray-500">Compare 1 vs Compare 2</span>
                </h3>
              </div>

              <div className="space-y-5 px-5 py-5">
                <label className="block max-w-xs text-xs font-medium text-gray-600">
                  One-time switch cost
                  <input
                    type="text"
                    inputMode="decimal"
                    value={scenarioSwitchCost}
                    onChange={(e) => setScenarioSwitchCost(e.target.value)}
                    placeholder="0"
                    className={`${INPUT_SM} mt-1`}
                    autoComplete="off"
                  />
                </label>

                {compare12Metrics.canCompare ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border-l-4 border-l-slate-700 bg-gray-50/80 px-4 py-4">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                          Compare 1 \u2014 baseline
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                          {formatUsd(compare12Metrics.spendA)}
                        </p>
                      </div>
                      <div className="rounded-xl border-l-4 border-l-emerald-600 bg-gray-50/80 px-4 py-4">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                          Compare 2 \u2014 alternative
                        </p>
                        <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                          {formatUsd(compare12Metrics.spendB)}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`rounded-2xl p-5 ${
                        compare12Metrics.savings >= 0
                          ? 'bg-linear-to-br from-emerald-50 to-emerald-100/40'
                          : 'bg-linear-to-br from-amber-50 to-amber-100/40'
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-6 lg:gap-10">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {compare12Metrics.savings >= 0 ? (
                              <ArrowDownRight className="h-5 w-5 text-emerald-600" aria-hidden />
                            ) : (
                              <ArrowUpRight className="h-5 w-5 text-amber-600" aria-hidden />
                            )}
                            <span className="text-sm font-semibold text-gray-800">
                              {compare12Metrics.savings >= 0 ? 'Savings' : 'Extra cost'} switching to Compare 2
                            </span>
                          </div>
                          <p className="mt-2 text-4xl font-extrabold tabular-nums tracking-tight text-gray-900">
                            {formatUsd(Math.abs(compare12Metrics.savings))}
                          </p>
                          {compare12Metrics.spendA > 0 && (
                            <p className="mt-1 text-sm tabular-nums text-gray-700">
                              {formatPct(Math.abs(compare12Metrics.savingsPct))}
                              <span className="font-normal text-gray-500">
                                {' '}
                                {compare12Metrics.savings >= 0 ? 'reduction' : 'increase'} vs baseline
                              </span>
                            </p>
                          )}
                        </div>

                        <div className="flex items-start gap-3 rounded-xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-900/5">
                          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" aria-hidden />
                          <div className="text-sm text-gray-700">
                            <p className="font-semibold text-gray-900">Payback</p>
                            {compare12Metrics.savings > 0 &&
                            compare12Metrics.nre > 0 &&
                            compare12Metrics.paybackMonths != null ? (
                              <p className="mt-0.5 tabular-nums">
                                ~{compare12Metrics.paybackMonths.toFixed(1)} months
                                <span className="text-gray-500">
                                  {' '}to recover {formatUsd(compare12Metrics.nre)}
                                </span>
                              </p>
                            ) : compare12Metrics.savings > 0 && compare12Metrics.nre <= 0 ? (
                              <p className="mt-0.5">Immediate \u2014 no switch cost.</p>
                            ) : compare12Metrics.savings <= 0 ? (
                              <p className="mt-0.5 text-gray-500">N/A \u2014 no savings.</p>
                            ) : (
                              <p className="mt-0.5 text-gray-500">Enter a switch cost.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-5 py-4">
                      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">
                        Spend comparison
                      </p>
                      <div className="space-y-3">
                        {[
                          { label: 'Compare 1', value: compare12Metrics.spendA, pct: compare12Metrics.barA, idx: 0 },
                          { label: 'Compare 2', value: compare12Metrics.spendB, pct: compare12Metrics.barB, idx: 1 },
                        ].map((bar) => (
                          <div key={bar.label}>
                            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                              <span className="flex items-center gap-2 font-medium text-gray-700">
                                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${slotColor(bar.idx).bar}`} />
                                {bar.label}
                              </span>
                              <span className="font-bold tabular-nums text-gray-900">{formatUsd(bar.value)}</span>
                            </div>
                            <div className="h-4 overflow-hidden rounded-full bg-gray-200/70">
                              <div
                                className={`h-full rounded-full transition-[width] duration-500 ease-out ${slotColor(bar.idx).bar}`}
                                style={{ width: `${bar.pct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center text-sm text-gray-500">
                    Add offers to <strong className="font-semibold text-gray-700">both</strong> Compare 1 and
                    Compare 2 to see savings, payback, and spend bars.
                  </div>
                )}
              </div>
            </section>

            {/* AI scenario advisor */}
            <section className="mt-6 overflow-hidden rounded-2xl border border-violet-200/60 bg-linear-to-br from-violet-50/70 to-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 bg-violet-50/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-600" aria-hidden />
                  <span className="text-sm font-semibold text-violet-900">AI scenario advisor</span>
                </div>
                {(aiMessages.length > 0 || aiSessionId) && (
                  <button
                    type="button"
                    onClick={clearAiChat}
                    className="text-xs font-medium text-violet-600 hover:text-violet-900"
                  >
                    Clear chat
                  </button>
                )}
              </div>
              <div className="px-5 py-4">
                {!token && (
                  <p className="mb-3 text-xs text-amber-800">Sign in to use AI.</p>
                )}
                {aiError && (
                  <p className="mb-3 text-xs text-red-700" role="alert">
                    {aiError}
                  </p>
                )}
                {aiMessages.length > 0 && (
                  <ul
                    className="mb-4 max-h-60 space-y-2 overflow-y-auto rounded-xl border border-violet-100 bg-white/90 p-3 text-sm"
                    aria-label="AI conversation"
                  >
                    {aiMessages.map((m, i) => (
                      <li
                        key={`ai-msg-${i}-${m.role}`}
                        className={
                          m.role === 'user'
                            ? 'rounded-lg bg-violet-100/70 px-3 py-2 text-violet-950'
                            : 'whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-slate-800'
                        }
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          {m.role === 'user' ? 'You' : 'AI'}
                        </span>
                        <div className="mt-0.5">{m.content}</div>
                      </li>
                    ))}
                    {aiLoading && (
                      <li className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Thinking\u2026
                      </li>
                    )}
                  </ul>
                )}
                {aiMessages.length === 0 && aiLoading && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Thinking\u2026
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void runScenarioAi()
                      }
                    }}
                    placeholder="e.g. Which scenario gives me the lowest total cost and why?"
                    rows={2}
                    disabled={!token || aiLoading}
                    className="min-h-11 flex-1 resize-y rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                    aria-label="Ask AI about compare scenarios"
                  />
                  <button
                    type="button"
                    onClick={() => void runScenarioAi()}
                    disabled={!token || aiLoading || !hasScenarioLines || !aiInput.trim()}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    )}
                    Ask AI
                  </button>
                </div>
                {!hasScenarioLines && token && (
                  <p className="mt-2 text-xs text-gray-500">Add lines to a compare slot first.</p>
                )}
              </div>
            </section>
            </>
          )}
          </>
        )}
      </div>
    </div>
  )
}
