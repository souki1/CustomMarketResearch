/** First non-whitespace cell in a spreadsheet row, or null if the row has no text. */
export function primaryTextFromDataRow(row: string[] | undefined): string | null {
  if (!row) return null
  for (const cell of row) {
    const t = String(cell ?? '').trim()
    if (t.length > 0) return t
  }
  return null
}
