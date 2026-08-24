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
