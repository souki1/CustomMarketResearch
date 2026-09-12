export type BlockAlign = 'left' | 'center' | 'right'

export type CalloutTone = 'amber' | 'blue' | 'emerald' | 'slate'

export type SpacerSize = 'sm' | 'md' | 'lg'

export type DividerStyle = 'solid' | 'dashed'

export type ReportBlockType =
  | 'title'
  | 'heading'
  | 'subheading'
  | 'paragraph'
  | 'bullets'
  | 'numbered'
  | 'divider'
  | 'callout'
  | 'quote'
  | 'spacer'
  | 'image'
  | 'metric'
  | 'code'
  | 'table'

/** Clickable cell in exports (PDF shows label; full URL is the link target). */
export type TableLinkCell = { type: 'link'; label: string; href: string }

export type TableCell = string | TableLinkCell

/** Optional placement metadata for PDF overlay annotations. */
export type ReportBlockPdfMeta = {
  pdf_overlay?: boolean
  pdf_auto?: boolean
  pdf_role?: 'text' | 'field' | 'label'
  pdf_page?: number
  pdf_x?: number
  pdf_y?: number
  pdf_width?: number
  pdf_height?: number
  pdf_field_name?: string
}

type ReportBlockCore =
  | { id: string; type: 'title'; text: string; align?: BlockAlign }
  | { id: string; type: 'heading'; text: string; align?: BlockAlign }
  | { id: string; type: 'subheading'; text: string; align?: BlockAlign }
  | { id: string; type: 'paragraph'; text: string; align?: BlockAlign }
  | { id: string; type: 'bullets'; items: string[]; align?: BlockAlign }
  | { id: string; type: 'numbered'; items: string[]; align?: BlockAlign }
  | { id: string; type: 'divider'; style?: DividerStyle }
  | { id: string; type: 'callout'; text: string; align?: BlockAlign; tone?: CalloutTone }
  | { id: string; type: 'quote'; text: string; align?: BlockAlign }
  | { id: string; type: 'spacer'; size: SpacerSize }
  | { id: string; type: 'image'; src: string; alt: string; caption: string; align?: BlockAlign }
  | { id: string; type: 'metric'; label: string; value: string; align?: BlockAlign }
  | { id: string; type: 'code'; text: string; align?: BlockAlign }
  | {
      id: string
      type: 'table'
      showHeader: boolean
      rows: TableCell[][]
      align?: BlockAlign
      /** Optional column widths in inches (PDF export). */
      colWidths?: number[]
    }

export type ReportBlock = ReportBlockCore & ReportBlockPdfMeta

export type SavedReport = {
  id: number
  title: string
  createdAt: string
  updatedAt: string
  blocks: ReportBlock[]
  /** Workspace item id when this report was imported from a Word file. */
  sourceWorkspaceFileId?: number | null
}

export function isPdfOverlayBlock(b: ReportBlock): boolean {
  return b.pdf_overlay === true
}

function attachPdfMeta(block: ReportBlock, raw: Record<string, unknown>): ReportBlock {
  const pdf_overlay = raw.pdf_overlay === true
  const pdf_auto = raw.pdf_auto === true
  const pdf_role =
    raw.pdf_role === 'text' || raw.pdf_role === 'field' || raw.pdf_role === 'label'
      ? raw.pdf_role
      : undefined
  const pdf_page = typeof raw.pdf_page === 'number' ? raw.pdf_page : undefined
  const pdf_x = typeof raw.pdf_x === 'number' ? raw.pdf_x : undefined
  const pdf_y = typeof raw.pdf_y === 'number' ? raw.pdf_y : undefined
  const pdf_width = typeof raw.pdf_width === 'number' ? raw.pdf_width : undefined
  const pdf_height = typeof raw.pdf_height === 'number' ? raw.pdf_height : undefined
  const pdf_field_name = typeof raw.pdf_field_name === 'string' ? raw.pdf_field_name : undefined
  if (
    !pdf_overlay &&
    !pdf_auto &&
    !pdf_role &&
    pdf_page == null &&
    pdf_x == null &&
    pdf_y == null &&
    pdf_width == null &&
    pdf_height == null &&
    !pdf_field_name
  ) {
    return block
  }
  return {
    ...block,
    pdf_overlay,
    pdf_auto,
    pdf_role,
    pdf_page,
    pdf_x,
    pdf_y,
    pdf_width,
    pdf_height,
    pdf_field_name,
  }
}

export function reportBlockToPayload(block: ReportBlock): Record<string, unknown> {
  const normalized = normalizeBlock(block)
  const payload = { ...normalized } as Record<string, unknown>
  if (normalized.pdf_overlay) payload.pdf_overlay = true
  if (normalized.pdf_auto) payload.pdf_auto = true
  if (normalized.pdf_role) payload.pdf_role = normalized.pdf_role
  if (normalized.pdf_page != null) payload.pdf_page = normalized.pdf_page
  if (normalized.pdf_x != null) payload.pdf_x = normalized.pdf_x
  if (normalized.pdf_y != null) payload.pdf_y = normalized.pdf_y
  if (normalized.pdf_width != null) payload.pdf_width = normalized.pdf_width
  if (normalized.pdf_height != null) payload.pdf_height = normalized.pdf_height
  if (normalized.pdf_field_name) payload.pdf_field_name = normalized.pdf_field_name
  return payload
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function parseAlign(v: unknown): BlockAlign {
  if (v === 'center' || v === 'right') return v
  return 'left'
}

function parseTone(v: unknown): CalloutTone {
  if (v === 'blue' || v === 'emerald' || v === 'slate') return v
  return 'amber'
}

function parseDividerStyle(v: unknown): DividerStyle {
  return v === 'dashed' ? 'dashed' : 'solid'
}

function parseSpacerSize(v: unknown): SpacerSize {
  if (v === 'sm' || v === 'lg') return v
  return 'md'
}

function defaultTableRows(): TableCell[][] {
  return [
    ['Column 1', 'Column 2', 'Column 3'],
    ['', '', ''],
    ['', '', ''],
  ]
}

function parseTableCell(raw: unknown): TableCell {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (o.type === 'link' && typeof o.href === 'string') {
      return {
        type: 'link',
        label: typeof o.label === 'string' ? o.label : 'Link',
        href: o.href,
      }
    }
  }
  return raw == null ? '' : String(raw)
}

function normalizeTableRect(rows: TableCell[][]): TableCell[][] {
  if (rows.length === 0) return [['']]
  const maxCols = Math.max(1, ...rows.map((r) => r.length))
  return rows.map((r) => {
    const cells: TableCell[] = r.map((c) => parseTableCell(c))
    while (cells.length < maxCols) cells.push('')
    return cells.slice(0, maxCols)
  })
}

export function createEmptyBlock(type: ReportBlockType): ReportBlock {
  const id = newId()
  switch (type) {
    case 'title':
      return { id, type: 'title', text: '', align: 'left' }
    case 'heading':
      return { id, type: 'heading', text: 'Section heading', align: 'left' }
    case 'subheading':
      return { id, type: 'subheading', text: 'Subheading', align: 'left' }
    case 'paragraph':
      return { id, type: 'paragraph', text: '', align: 'left' }
    case 'bullets':
      return { id, type: 'bullets', items: [''], align: 'left' }
    case 'numbered':
      return { id, type: 'numbered', items: [''], align: 'left' }
    case 'divider':
      return { id, type: 'divider', style: 'solid' }
    case 'callout':
      return { id, type: 'callout', text: '', align: 'left', tone: 'amber' }
    case 'quote':
      return { id, type: 'quote', text: '', align: 'left' }
    case 'spacer':
      return { id, type: 'spacer', size: 'md' }
    case 'image':
      return { id, type: 'image', src: '', alt: '', caption: '', align: 'left' }
    case 'metric':
      return { id, type: 'metric', label: 'Metric', value: '—', align: 'left' }
    case 'code':
      return { id, type: 'code', text: '', align: 'left' }
    case 'table':
      return { id, type: 'table', showHeader: true, rows: defaultTableRows(), align: 'left' }
    default: {
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}

function parseOneBlock(raw: unknown): ReportBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : newId()
  const t = r.type
  const align = parseAlign(r.align)
  switch (t) {
    case 'title':
      return { id, type: 'title', text: typeof r.text === 'string' ? r.text : '', align }
    case 'heading':
      return { id, type: 'heading', text: typeof r.text === 'string' ? r.text : '', align }
    case 'subheading':
      return { id, type: 'subheading', text: typeof r.text === 'string' ? r.text : '', align }
    case 'paragraph':
      return { id, type: 'paragraph', text: typeof r.text === 'string' ? r.text : '', align }
    case 'bullets': {
      const items = r.items
      if (!Array.isArray(items)) return { id, type: 'bullets', items: [''], align }
      const strings = items.filter((x): x is string => typeof x === 'string')
      return { id, type: 'bullets', items: strings.length ? strings : [''], align }
    }
    case 'numbered': {
      const items = r.items
      if (!Array.isArray(items)) return { id, type: 'numbered', items: [''], align }
      const strings = items.filter((x): x is string => typeof x === 'string')
      return { id, type: 'numbered', items: strings.length ? strings : [''], align }
    }
    case 'divider':
      return { id, type: 'divider', style: parseDividerStyle(r.style) }
    case 'callout':
      return {
        id,
        type: 'callout',
        text: typeof r.text === 'string' ? r.text : '',
        align,
        tone: parseTone(r.tone),
      }
    case 'quote':
      return { id, type: 'quote', text: typeof r.text === 'string' ? r.text : '', align }
    case 'spacer':
      return { id, type: 'spacer', size: parseSpacerSize(r.size) }
    case 'image':
      return {
        id,
        type: 'image',
        src: typeof r.src === 'string' ? r.src : '',
        alt: typeof r.alt === 'string' ? r.alt : '',
        caption: typeof r.caption === 'string' ? r.caption : '',
        align,
      }
    case 'metric':
      return {
        id,
        type: 'metric',
        label: typeof r.label === 'string' ? r.label : 'Metric',
        value: typeof r.value === 'string' ? r.value : '—',
        align,
      }
    case 'code':
      return { id, type: 'code', text: typeof r.text === 'string' ? r.text : '', align }
    case 'table': {
      const showHeader = r.showHeader !== false
      let rows: TableCell[][] = defaultTableRows()
      if (Array.isArray(r.rows) && r.rows.length > 0) {
        rows = r.rows.map((row) => {
          if (!Array.isArray(row)) return ['']
          const cells = row.map((c) => parseTableCell(c))
          return cells.length ? cells : ['']
        })
      }
      rows = normalizeTableRect(rows)
      return { id, type: 'table', showHeader, rows, align }
    }
    default:
      return null
  }
}

export function parseBlocksArray(arr: unknown[]): ReportBlock[] {
  const out: ReportBlock[] = []
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue
    const b = parseOneBlock(row)
    if (b) out.push(attachPdfMeta(b, row as Record<string, unknown>))
  }
  return out
}

/** Migrate blocks saved before align/tone fields existed */
export function normalizeBlock(b: ReportBlock): ReportBlock {
  switch (b.type) {
    case 'divider':
      return { ...b, style: b.style ?? 'solid' }
    case 'spacer':
      return { ...b, size: b.size ?? 'md' }
    case 'title':
    case 'heading':
    case 'subheading':
    case 'paragraph':
    case 'quote':
    case 'code':
      return { ...b, align: b.align ?? 'left' }
    case 'bullets':
    case 'numbered':
      return { ...b, align: b.align ?? 'left' }
    case 'callout':
      return { ...b, align: b.align ?? 'left', tone: b.tone ?? 'amber' }
    case 'image':
      return { ...b, align: b.align ?? 'left' }
    case 'metric':
      return { ...b, align: b.align ?? 'left' }
    case 'table':
      return {
        ...b,
        align: b.align ?? 'left',
        showHeader: b.showHeader !== false,
        rows: normalizeTableRect(b.rows.length ? b.rows : defaultTableRows()),
        ...(Array.isArray(b.colWidths) && b.colWidths.length > 0 ? { colWidths: b.colWidths } : {}),
      }
    default: {
      const _e: never = b
      return _e
    }
  }
}

/** Plain text export for previews / search */
export function blocksToPlainText(blocks: ReportBlock[]): string {
  const lines: string[] = []
  for (const b of blocks) {
    switch (b.type) {
      case 'title':
      case 'heading':
      case 'subheading':
      case 'paragraph':
      case 'callout':
      case 'quote':
      case 'code':
        lines.push(b.text)
        break
      case 'bullets':
        for (const item of b.items) lines.push(`• ${item}`)
        break
      case 'numbered':
        b.items.forEach((item, i) => lines.push(`${i + 1}. ${item}`))
        break
      case 'divider':
        lines.push(b.style === 'dashed' ? '- - -' : '—')
        break
      case 'spacer':
        lines.push('')
        break
      case 'image': {
        const cap = b.caption.trim() || b.alt.trim() || 'Image'
        lines.push(b.src.trim() ? `${cap}: ${b.src}` : cap)
        break
      }
      case 'metric':
        lines.push(`${b.label}: ${b.value}`)
        break
      case 'table':
        for (const row of b.rows) {
          lines.push(
            row
              .map((c) =>
                typeof c === 'string'
                  ? c
                  : c.type === 'link'
                    ? `${c.label} (${c.href})`
                    : String(c),
              )
              .join('\t'),
          )
        }
        break
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

function extractJsonCandidate(raw: string): string {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) return raw.slice(start, end + 1)
  return raw.trim()
}

function readReportString(value: unknown, maxLen = 8000): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLen)
}

function readReportStringArray(value: unknown, maxItems = 24, maxLen = 4000): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (!trimmed) continue
    out.push(trimmed.slice(0, maxLen))
    if (out.length >= maxItems) break
  }
  return out
}

function titleBlock(text: string): ReportBlock {
  return { id: newId(), type: 'title', text, align: 'left' }
}

function headingBlock(text: string): ReportBlock {
  return { id: newId(), type: 'heading', text, align: 'left' }
}

function paragraphBlock(text: string): ReportBlock {
  return { id: newId(), type: 'paragraph', text, align: 'left' }
}

function bulletsBlock(items: string[]): ReportBlock {
  return { id: newId(), type: 'bullets', items, align: 'left' }
}

function numberedBlock(items: string[]): ReportBlock {
  return { id: newId(), type: 'numbered', items, align: 'left' }
}

function appendMarkdownFallback(blocks: ReportBlock[], raw: string): void {
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
      blocks.push(headingBlock(markdownHeading[1].trim().slice(0, 200)))
      const body = lines.slice(1).join(' ').trim()
      if (body) blocks.push(paragraphBlock(body.slice(0, 8000)))
      continue
    }

    const bulletItems = lines
      .filter((line) => /^[-*•]\s+/.test(line))
      .map((line) => line.replace(/^[-*•]\s+/, '').trim())
      .filter(Boolean)
    if (bulletItems.length >= 2 && bulletItems.length === lines.length) {
      blocks.push(bulletsBlock(bulletItems.map((item) => item.slice(0, 4000))))
      continue
    }

    const numberedItems = lines
      .filter((line) => /^\d+[.)]\s+/.test(line))
      .map((line) => line.replace(/^\d+[.)]\s+/, '').trim())
      .filter(Boolean)
    if (numberedItems.length >= 2 && numberedItems.length === lines.length) {
      blocks.push(numberedBlock(numberedItems.map((item) => item.slice(0, 4000))))
      continue
    }

    blocks.push(paragraphBlock(lines.join(' ').slice(0, 8000)))
  }
}

/**
 * Turn Groq report JSON into studio blocks: title, TL;DR, numbered Key Findings,
 * analysis sections, sources, and conclusion. Also accepts the older
 * summary / key_points schema.
 */
export function parseIntelligenceReportDraft(
  raw: string,
  fallbackTitle = 'Supplier & Vendor Intelligence Report'
): { title: string; blocks: ReportBlock[] } {
  let parsed: Record<string, unknown> | null = null
  try {
    const json = JSON.parse(extractJsonCandidate(raw)) as unknown
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      parsed = json as Record<string, unknown>
    }
  } catch {
    parsed = null
  }

  const title =
    readReportString(parsed?.title, 240) ??
    (fallbackTitle.trim().slice(0, 240) || 'Supplier & Vendor Intelligence Report')
  const blocks: ReportBlock[] = [titleBlock(title)]

  const tldr = readReportStringArray(parsed?.tldr)
  if (tldr.length) {
    blocks.push(headingBlock('TL;DR'))
    blocks.push(bulletsBlock(tldr))
  } else {
    const summary = readReportString(parsed?.summary)
    if (summary) {
      blocks.push(headingBlock('TL;DR'))
      blocks.push(paragraphBlock(summary))
    }
  }

  const keyFindings = readReportStringArray(parsed?.key_findings)
  if (keyFindings.length) {
    blocks.push(headingBlock('Key Findings'))
    blocks.push(numberedBlock(keyFindings))
  } else {
    const keyPoints = readReportStringArray(parsed?.key_points)
    if (keyPoints.length) {
      blocks.push(headingBlock('Key Findings'))
      blocks.push(numberedBlock(keyPoints))
    }
  }

  const sections = parsed && Array.isArray(parsed.sections) ? parsed.sections : []
  for (const section of sections) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue
    const row = section as Record<string, unknown>
    const heading = readReportString(row.heading, 200)
    if (heading) blocks.push(headingBlock(heading))
    for (const p of readReportStringArray(row.paragraphs, 12, 8000)) {
      blocks.push(paragraphBlock(p))
    }
    const bullets = readReportStringArray(row.bullets)
    if (bullets.length) blocks.push(bulletsBlock(bullets))
    const numbered = readReportStringArray(row.numbered)
    if (numbered.length) blocks.push(numberedBlock(numbered))
  }

  const sources = readReportStringArray(parsed?.sources, 40, 500)
  if (sources.length) {
    blocks.push(headingBlock('Sources'))
    blocks.push(bulletsBlock(sources))
  }

  const conclusion = readReportString(parsed?.conclusion)
  if (conclusion) {
    blocks.push(headingBlock('Conclusion'))
    blocks.push(paragraphBlock(conclusion))
  }

  if (blocks.length > 1) return { title, blocks }

  appendMarkdownFallback(blocks, raw)
  if (blocks.length === 1) {
    blocks.push(paragraphBlock(raw.trim().slice(0, 8000) || 'No AI content generated.'))
  }
  return { title, blocks }
}

/**
 * Convert a backend ReportResponse (raw blocks as Record[]) into a typed SavedReport.
 */
export function apiResponseToSavedReport(resp: {
  id: number
  title: string
  blocks: Array<Record<string, unknown>>
  created_at: string
  updated_at: string
  source_workspace_file_id?: number | null
  source_workspace_pdf_id?: number | null
}): SavedReport {
  const sourceWorkspaceFileId =
    resp.source_workspace_file_id ?? resp.source_workspace_pdf_id ?? null
  const blocks = parseBlocksArray(resp.blocks)
  return {
    id: resp.id,
    title: resp.title,
    createdAt: resp.created_at,
    updatedAt: resp.updated_at,
    sourceWorkspaceFileId,
    blocks: blocks.length
      ? blocks.map(normalizeBlock)
      : [createEmptyBlock('title'), createEmptyBlock('paragraph')],
  }
}
