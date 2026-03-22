const STORAGE_KEY = 'ir-saved-reports-v1'

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

export type ReportBlock =
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
  | { id: string; type: 'table'; showHeader: boolean; rows: string[][]; align?: BlockAlign }

export type SavedReport = {
  id: string
  title: string
  createdAt: string
  blocks: ReportBlock[]
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

function defaultTableRows(): string[][] {
  return [
    ['Column 1', 'Column 2', 'Column 3'],
    ['', '', ''],
    ['', '', ''],
  ]
}

function normalizeTableRect(rows: string[][]): string[][] {
  if (rows.length === 0) return [['']]
  const maxCols = Math.max(1, ...rows.map((r) => r.length))
  return rows.map((r) => {
    const cells = [...r]
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
      let rows: string[][] = defaultTableRows()
      if (Array.isArray(r.rows) && r.rows.length > 0) {
        rows = r.rows.map((row) => {
          if (!Array.isArray(row)) return ['']
          const cells = row.filter((c): c is string => typeof c === 'string')
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

function parseBlocksArray(arr: unknown[]): ReportBlock[] {
  const out: ReportBlock[] = []
  for (const row of arr) {
    const b = parseOneBlock(row)
    if (b) out.push(b)
  }
  return out
}

function legacyBodyToBlocks(body: string, title: string): ReportBlock[] {
  const blocks: ReportBlock[] = [{ id: newId(), type: 'title', text: title, align: 'left' }]
  const chunks = body.split(/\n\n+/).map((s) => s.trim()).filter(Boolean)
  for (const c of chunks) {
    blocks.push({ id: newId(), type: 'paragraph', text: c, align: 'left' })
  }
  if (blocks.length === 1 && !body.trim()) {
    blocks.push({ id: newId(), type: 'paragraph', text: '', align: 'left' })
  }
  return blocks
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
          lines.push(row.join('\t'))
        }
        break
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

function normalizeReport(row: Record<string, unknown>): SavedReport | null {
  const id = typeof row.id === 'string' ? row.id : null
  const title = typeof row.title === 'string' ? row.title : null
  const createdAt = typeof row.createdAt === 'string' ? row.createdAt : null
  if (!id || !title || !createdAt) return null

  if (Array.isArray(row.blocks)) {
    const blocks = parseBlocksArray(row.blocks)
    if (blocks.length > 0) return { id, title, createdAt, blocks: blocks.map(normalizeBlock) }
  }

  const body = typeof row.body === 'string' ? row.body : ''
  return { id, title, createdAt, blocks: legacyBodyToBlocks(body, title) }
}

export function createNewReport(title: string, blocks: ReportBlock[]): SavedReport {
  return {
    id: newId(),
    title: title.trim() || 'Untitled report',
    createdAt: new Date().toISOString(),
    blocks: blocks.length ? blocks.map(normalizeBlock) : [createEmptyBlock('title'), createEmptyBlock('paragraph')],
  }
}

export function loadSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: SavedReport[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue
      const r = normalizeReport(row as Record<string, unknown>)
      if (r) out.push(r)
    }
    return out
  } catch {
    return []
  }
}

export function persistSavedReports(reports: SavedReport[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
  } catch {
    // ignore quota / private mode
  }
}
