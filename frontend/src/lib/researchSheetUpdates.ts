export type SheetColumnUpdate = {
  column: string
  value: string
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
