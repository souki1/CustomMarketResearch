import { useCallback, useEffect, useMemo, useState } from 'react'
import { ReportGalleryHome, ReportStudio } from '@/components/reports'
import {
  aiGroqChat,
  createReport,
  deleteReport,
  listDataSheetSelections,
  listPortfolioItems,
  listReports,
  listResearchUrls,
  updateReport,
  type PortfolioItem,
  type ScrapedDataItem,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  apiResponseToSavedReport,
  createEmptyBlock,
  normalizeBlock,
  type ReportBlock,
  type ReportBlockType,
  type SavedReport,
} from '@/lib/savedReports'

const PORTFOLIO_REPORT_CONTEXT_KEY = 'ir-portfolio-report-context-v1'
const PORTFOLIO_CTX_MARKER = '[[PORTFOLIO_CONTEXT]]'
const REPORT_DATASET_MARKER = '[[REPORT_DATASET]]'

type StudioMode = 'home' | 'studio'

type PortfolioReportContext = {
  version: 1
  updatedAt: string
  parts: Array<{
    part_number: string | null
    selected_offer: {
      vendor_name: string | null
      price: string | null
      quantity: number | null
      url: string | null
    }
  }>
}

function newBlockId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createTitleBlock(text: string): ReportBlock {
  return { id: newBlockId(), type: 'title', text, align: 'left' }
}

function createHeadingBlock(text: string): ReportBlock {
  return { id: newBlockId(), type: 'heading', text, align: 'left' }
}

function createParagraphBlock(text: string): ReportBlock {
  return { id: newBlockId(), type: 'paragraph', text, align: 'left' }
}

function createBulletsBlock(items: string[]): ReportBlock {
  return { id: newBlockId(), type: 'bullets', items, align: 'left' }
}

function extractJsonCandidate(raw: string): string {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch && fencedMatch[1]) return fencedMatch[1].trim()
  return raw.trim()
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseAiToReportDraft(userPrompt: string, raw: string): { title: string; blocks: ReportBlock[] } {
  let parsed: Record<string, unknown> | null = null
  const candidate = extractJsonCandidate(raw)
  try {
    const json = JSON.parse(candidate) as unknown
    if (json && typeof json === 'object' && !Array.isArray(json)) parsed = json as Record<string, unknown>
  } catch {
    parsed = null
  }

  const fallbackTitle = userPrompt.trim().slice(0, 80) || 'AI generated report'
  const title = readString(parsed?.title) ?? fallbackTitle
  const blocks: ReportBlock[] = [createTitleBlock(title)]

  const summary = readString(parsed?.summary)
  if (summary) blocks.push(createParagraphBlock(summary))

  const sections = parsed && Array.isArray(parsed.sections) ? parsed.sections : []
  for (const section of sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue
    const row = section as Record<string, unknown>
    const heading = readString(row.heading)
    if (heading) blocks.push(createHeadingBlock(heading))
    for (const p of readStringArray(row.paragraphs)) {
      blocks.push(createParagraphBlock(p))
    }
    const bullets = readStringArray(row.bullets)
    if (bullets.length) blocks.push(createBulletsBlock(bullets))
  }

  const keyPoints = readStringArray(parsed?.key_points)
  if (keyPoints.length) {
    blocks.push(createHeadingBlock('Key points'))
    blocks.push(createBulletsBlock(keyPoints))
  }

  const conclusion = readString(parsed?.conclusion)
  if (conclusion) {
    blocks.push(createHeadingBlock('Conclusion'))
    blocks.push(createParagraphBlock(conclusion))
  }

  if (blocks.length > 1) return { title, blocks }

  const chunks = raw
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  for (const chunk of chunks) {
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue

    const markdownHeading = lines[0]?.match(/^#{1,6}\s+(.+)$/)
    if (markdownHeading?.[1]) {
      blocks.push(createHeadingBlock(markdownHeading[1].trim()))
      const body = lines.slice(1).join(' ').trim()
      if (body) blocks.push(createParagraphBlock(body))
      continue
    }

    const bulletItems = lines
      .filter((line) => /^[-*•]\s+/.test(line))
      .map((line) => line.replace(/^[-*•]\s+/, '').trim())
      .filter(Boolean)
    if (bulletItems.length >= 2 && bulletItems.length === lines.length) {
      blocks.push(createBulletsBlock(bulletItems))
      continue
    }

    blocks.push(createParagraphBlock(lines.join(' ')))
  }

  if (blocks.length === 1) {
    blocks.push(createParagraphBlock(raw.trim() || 'No AI content generated.'))
  }

  return { title, blocks }
}

function buildPortfolioContextText(ctx: PortfolioReportContext): string {
  return ctx.parts
    .map((p, idx) => {
      const pn = p.part_number ?? null
      const offer = p.selected_offer
      return [
        `Part ${idx + 1}:`,
        `part_number: ${pn ?? '—'}`,
        `vendor_name: ${offer.vendor_name ?? '—'}`,
        `price: ${offer.price ?? '—'}`,
        `quantity: ${offer.quantity ?? '—'}`,
        `url: ${offer.url ?? '—'}`,
      ].join('\n')
    })
    .join('\n\n')
}

function buildDefaultAiPromptFromPortfolio(ctx: PortfolioReportContext): string {
  const ctxText = buildPortfolioContextText(ctx)
  return [
    'Generate a professional report from the portfolio selection provided.',
    'Create exactly one report section per selected part, in the same order as provided.',
    'Use only the provided vendor/price/quantity/url values. Do not invent additional specifications.',
    'For each section:',
    '- Use the part number as the section heading (or "Part" if missing).',
    '- Write a short paragraph that summarizes the offer.',
    '- Add bullets for: vendor, price, quantity, and link (when available).',
    '',
    PORTFOLIO_CTX_MARKER,
    ctxText,
  ].join('\n')
}

type ReportDataset = {
  portfolio: Array<{
    part_number: string | null
    offers: PortfolioItem[]
  }>
  scraped: Array<{
    row_index: number
    search_query: string
    scraped_data: ScrapedDataItem[]
  }>
}

function buildReportDatasetContextText(dataset: ReportDataset): string {
  const portfolioSection = dataset.portfolio
    .map((row, idx) => {
      const offersText = row.offers
        .map((o, offerIdx) =>
          [
            `  Offer ${offerIdx + 1}:`,
            `    vendor_name: ${o.vendor_name ?? '—'}`,
            `    price: ${o.price ?? '—'}`,
            `    quantity: ${o.quantity ?? '—'}`,
            `    url: ${o.url ?? '—'}`,
          ].join('\n')
        )
        .join('\n')
      return [`Part ${idx + 1}: ${row.part_number ?? '—'}`, offersText || '  Offers: none'].join('\n')
    })
    .join('\n\n')

  const scrapedSection = dataset.scraped
    .map((row, idx) => {
      const scrapedItems = row.scraped_data
        .map((entry, entryIdx) => {
          const json = JSON.stringify(entry.data ?? {})
          return [`  Source ${entryIdx + 1}:`, `    url: ${entry.url}`, `    data_json: ${json}`].join('\n')
        })
        .join('\n')
      return [
        `Scraped row ${idx + 1}:`,
        `  row_index: ${row.row_index}`,
        `  search_query: ${row.search_query || '—'}`,
        scrapedItems || '  Sources: none',
      ].join('\n')
    })
    .join('\n\n')

  return [
    'PORTFOLIO_DATA:',
    portfolioSection || 'No portfolio data.',
    '',
    'SCRAPED_DATA:',
    scrapedSection || 'No scraped data.',
  ].join('\n')
}

async function loadReportDataset(token: string): Promise<ReportDataset> {
  const selections = await listDataSheetSelections(token)
  const portfolioBatches = await Promise.all(
    selections.map((s) => listPortfolioItems(token, s.id).catch(() => [] as PortfolioItem[]))
  )

  const byPart = new Map<string, { part_number: string | null; offers: PortfolioItem[] }>()
  for (const batch of portfolioBatches) {
    for (const offer of batch) {
      const key = offer.part_number ?? '__null_part__'
      const existing = byPart.get(key)
      if (existing) {
        existing.offers.push(offer)
      } else {
        byPart.set(key, { part_number: offer.part_number ?? null, offers: [offer] })
      }
    }
  }

  const allResearch = await listResearchUrls(token).catch(() => [])
  const scraped = allResearch
    .filter((r) => Array.isArray(r.scraped_data) && r.scraped_data.length > 0)
    .map((r) => ({
      row_index: r.row_index,
      search_query: r.search_query,
      scraped_data: r.scraped_data ?? [],
    }))

  return {
    portfolio: Array.from(byPart.values()),
    scraped,
  }
}

export function GenerateReportPage() {
  const token = useMemo(() => getToken(), [])
  const [studioMode, setStudioMode] = useState<StudioMode>('home')
  const [tab, setTab] = useState<'list' | 'create'>('list')
  const [reports, setReports] = useState<SavedReport[]>([])
  const [loading, setLoading] = useState(false)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [readOnlyPreview, setReadOnlyPreview] = useState(false)
  const [docTitle, setDocTitle] = useState('Untitled report')
  const [blocks, setBlocks] = useState<ReportBlock[]>(() => [
    createEmptyBlock('title'),
    createEmptyBlock('paragraph'),
  ])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAiComposer, setShowAiComposer] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [portfolioCtx, setPortfolioCtx] = useState<PortfolioReportContext | null>(null)

  const fetchReports = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await listReports(token)
      setReports(data.map(apiResponseToSavedReport))
    } catch {
      // silently fail — user sees empty list
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void fetchReports()
  }, [fetchReports])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PORTFOLIO_REPORT_CONTEXT_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object') return
      const obj = parsed as Partial<PortfolioReportContext>
      if (obj.version !== 1) return
      if (!Array.isArray(obj.parts)) return
      setPortfolioCtx(parsed as PortfolioReportContext)
    } catch {
      // ignore
    }
  }, [])

  const sorted = useMemo(
    () => [...reports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [reports]
  )

  const openStudioNew = useCallback(() => {
    setEditingId(null)
    setReadOnlyPreview(false)
    setDocTitle('Untitled report')
    setBlocks([createEmptyBlock('title'), createEmptyBlock('paragraph')])
    setSelectedId(null)
    setShowAiComposer(false)
    setAiPrompt('')
    setAiError(null)
    setStudioMode('studio')
  }, [])

  const openStudioAi = useCallback(() => {
    setEditingId(null)
    setReadOnlyPreview(false)
    setDocTitle('Untitled report')
    setBlocks([createEmptyBlock('title'), createEmptyBlock('paragraph')])
    setSelectedId(null)
    setShowAiComposer(true)
    setAiPrompt(portfolioCtx ? buildDefaultAiPromptFromPortfolio(portfolioCtx) : '')
    setAiError(null)
    setStudioMode('studio')
  }, [portfolioCtx])

  const openStudioEdit = useCallback((r: SavedReport) => {
    setEditingId(r.id)
    setReadOnlyPreview(false)
    setDocTitle(r.title)
    setBlocks(r.blocks.map((b) => normalizeBlock(structuredClone(b))))
    setSelectedId(r.blocks[0]?.id ?? null)
    setShowAiComposer(false)
    setAiError(null)
    setStudioMode('studio')
  }, [])

  const openStudioPreview = useCallback((r: SavedReport) => {
    setEditingId(r.id)
    setReadOnlyPreview(true)
    setDocTitle(r.title)
    setBlocks(r.blocks.map((b) => normalizeBlock(structuredClone(b))))
    setSelectedId(null)
    setShowAiComposer(false)
    setAiError(null)
    setStudioMode('studio')
  }, [])

  const closeStudio = useCallback(() => {
    setStudioMode('home')
    setReadOnlyPreview(false)
    setSelectedId(null)
    setAiGenerating(false)
    setAiError(null)
    void fetchReports()
  }, [fetchReports])

  const generateWithAi = useCallback(async () => {
    let prompt = aiPrompt.trim()
    if (!prompt && portfolioCtx) prompt = buildDefaultAiPromptFromPortfolio(portfolioCtx)
    if (!prompt) return
    if (!token) {
      setAiError('Sign in to generate reports with AI.')
      return
    }

    setAiGenerating(true)
    setAiError(null)
    try {
      const dataset = await loadReportDataset(token)
      const datasetText = buildReportDatasetContextText(dataset)

      const instruction = [
        'Generate a professional report from the user prompt.',
        'Return JSON only (no markdown), using this schema:',
        '{"title":"string","summary":"string","sections":[{"heading":"string","paragraphs":["string"],"bullets":["string"]}],"key_points":["string"],"conclusion":"string"}',
        'Use concise, factual language and avoid unsafe or unverifiable claims.',
        'Use all provided portfolio data, all vendor offers, and all scraped research data when present.',
        'In sections, clearly present vendor comparisons (price, quantity, source URL) and scraped highlights by source.',
        portfolioCtx ? 'If portfolio context is provided, create one section per selected part using those details.' : '',
      ].join('\n')

      const effectivePrompt = portfolioCtx
        ? prompt.includes(PORTFOLIO_CTX_MARKER)
          ? prompt
          : `${prompt}\n\n${PORTFOLIO_CTX_MARKER}\n${buildPortfolioContextText(portfolioCtx)}`
        : prompt

      const messageWithDataset = [
        instruction,
        '',
        'User prompt:',
        effectivePrompt,
        '',
        REPORT_DATASET_MARKER,
        datasetText,
      ].join('\n')

      const res = await aiGroqChat(token, {
        mode: 'report',
        message: messageWithDataset,
        history: [],
      })

      const generated = parseAiToReportDraft(prompt, res.content)
      const normalizedBlocks = generated.blocks.map((b) => normalizeBlock(structuredClone(b)))
      setDocTitle(generated.title)
      setBlocks(normalizedBlocks)
      setSelectedId(normalizedBlocks[0]?.id ?? null)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to generate report')
    } finally {
      setAiGenerating(false)
    }
  }, [aiPrompt, token, portfolioCtx])

  const addBlock = useCallback((type: ReportBlockType) => {
    const nb = createEmptyBlock(type)
    setBlocks((prev) => {
      if (!selectedId) return [...prev, nb]
      const i = prev.findIndex((b) => b.id === selectedId)
      if (i < 0) return [...prev, nb]
      return [...prev.slice(0, i + 1), nb, ...prev.slice(i + 1)]
    })
    setSelectedId(nb.id)
  }, [selectedId])

  const updateBlock = useCallback((id: string, next: ReportBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? normalizeBlock(next) : b)))
  }, [])

  const removeBlock = useCallback((id: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((b) => b.id !== id)
      setSelectedId((cur) => (cur === id ? next[0]?.id ?? null : cur))
      return next
    })
  }, [])

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const t = next[i]!
      next[i] = next[j]!
      next[j] = t
      return next
    })
  }, [])

  const moveBlockToIndex = useCallback((id: string, toIndex: number) => {
    setBlocks((prev) => {
      const fromIndex = prev.findIndex((b) => b.id === id)
      if (fromIndex < 0) return prev
      const nextIndex = Math.max(0, Math.min(toIndex, prev.length - 1))
      if (nextIndex === fromIndex) return prev

      const next = [...prev]
      const [item] = next.splice(fromIndex, 1)
      next.splice(nextIndex, 0, item!)
      return next
    })
  }, [])

  const saveDocument = useCallback(async () => {
    if (!token) return
    const title = docTitle.trim() || 'Untitled report'
    const normalized = blocks.map((b) => normalizeBlock(structuredClone(b)))
    const blocksPayload = normalized as unknown as Array<Record<string, unknown>>

    setSaving(true)
    try {
      if (editingId) {
        const updated = await updateReport(token, editingId, { title, blocks: blocksPayload })
        const saved = apiResponseToSavedReport(updated)
        setReports((prev) => prev.map((r) => (r.id === editingId ? saved : r)))
      } else {
        const created = await createReport(token, { title, blocks: blocksPayload })
        const saved = apiResponseToSavedReport(created)
        setReports((prev) => [saved, ...prev])
        setEditingId(saved.id)
      }
    } catch {
      // save failed silently — could add toast
    } finally {
      setSaving(false)
    }
  }, [docTitle, editingId, blocks, token])

  const handleDelete = useCallback(async (id: number) => {
    if (!window.confirm('Delete this report?')) return
    if (!token) return
    try {
      await deleteReport(token, id)
      setReports((prev) => prev.filter((r) => r.id !== id))
    } catch {
      // delete failed silently
    }
  }, [token])

  /** Same height as app sidebar so reports split (nav | content) stays aligned on large screens */
  const reportsRouteShell =
    'box-border flex h-[calc(100vh-3.5rem)] w-full max-w-full flex-col overflow-hidden'

  if (studioMode === 'studio') {
    const portfolioHint = portfolioCtx
      ? `Using ${portfolioCtx.parts.length} selected part${portfolioCtx.parts.length === 1 ? '' : 's'} from Portfolio`
      : null
    return (
      <div className={reportsRouteShell}>
        <ReportStudio
          docTitle={docTitle}
          onDocTitleChange={setDocTitle}
          onClose={closeStudio}
          onSave={() => void saveDocument()}
          saving={saving}
          editingId={editingId}
          readOnly={readOnlyPreview}
          blocks={blocks}
          selectedId={selectedId}
          onSelectId={setSelectedId}
          onAddBlock={addBlock}
          onUpdateBlock={updateBlock}
          onRemoveBlock={removeBlock}
          onMoveBlock={moveBlock}
          onMoveBlockToIndex={moveBlockToIndex}
          showAiComposer={showAiComposer}
          aiPrompt={aiPrompt}
          aiGenerating={aiGenerating}
          aiError={aiError}
          aiContextHint={portfolioHint}
          onAiPromptChange={setAiPrompt}
          onGenerateWithAi={() => void generateWithAi()}
        />
      </div>
    )
  }

  return (
    <div className={reportsRouteShell}>
      <ReportGalleryHome
        tab={tab}
        onTabChange={setTab}
        sorted={sorted}
        loading={loading}
        onOpenStudioNew={openStudioNew}
        onOpenStudioAi={openStudioAi}
        onOpenStudioEdit={openStudioEdit}
        onOpenStudioPreview={openStudioPreview}
        onDeleteReport={(id) => void handleDelete(id)}
      />
    </div>
  )
}

export default GenerateReportPage
