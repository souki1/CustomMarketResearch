export type SheetColumnUpdate = {
  column: string
  value: string
}

function titleCaseLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function scalarToCellValue(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'string') {
    const s = val.trim()
    return s || null
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) {
    const parts = val
      .map((v) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v).trim() : ''))
      .filter(Boolean)
    return parts.length > 0 ? parts.join(' | ') : null
  }
  return null
}

/** Flatten scraped source JSON into sheet column name + value pairs. */
export function flattenScrapedToColumnUpdates(
  data: Record<string, unknown>,
  prefix = ''
): SheetColumnUpdate[] {
  const out: SheetColumnUpdate[] = []
  for (const [rawKey, val] of Object.entries(data)) {
    const label = prefix ? `${prefix} ${titleCaseLabel(rawKey)}` : titleCaseLabel(rawKey)
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      out.push(...flattenScrapedToColumnUpdates(val as Record<string, unknown>, label))
      continue
    }
    const cell = scalarToCellValue(val)
    if (cell != null) out.push({ column: label, value: cell })
  }
  return out
}

const SHEET_UPDATES_FENCE = /```sheet_updates\s*([\s\S]*?)```/i

/** Parse optional sheet update JSON from an assistant reply. */
export function parseSheetUpdatesFromAssistantMessage(content: string): SheetColumnUpdate[] {
  const match = content.match(SHEET_UPDATES_FENCE)
  if (!match?.[1]) return []
  try {
    const parsed = JSON.parse(match[1].trim()) as unknown
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { updates?: unknown }).updates)
        ? (parsed as { updates: unknown[] }).updates
        : null
    if (!rows) return []
    const out: SheetColumnUpdate[] = []
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const column = String((row as { column?: unknown }).column ?? '').trim()
      const value = String((row as { value?: unknown }).value ?? '').trim()
      if (column) out.push({ column, value })
    }
    return out
  } catch {
    return []
  }
}

export const RESEARCH_AI_SHEET_INSTRUCTIONS = [
  'When the user asks to add, fill, or update datasheet columns for this row, include a fenced JSON block:',
  '```sheet_updates',
  '{"updates":[{"column":"Column Header","value":"cell value"}]}',
  '```',
  'Use column names that match existing sheet headers when possible; otherwise propose clear new header names.',
  'Only include fields supported by the scraped data or the user request. Keep normal prose outside the fence.',
].join('\n')
