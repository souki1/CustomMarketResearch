/** Airtable-style sheet filter builder (evaluated client-side only). */

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'is_exactly'
  | 'contains'
  | 'does_not_contain'
  | 'has_any_of'
  | 'is_empty'
  | 'is_not_empty'

export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'is_exactly', label: 'is exactly' },
  { value: 'contains', label: 'contains' },
  { value: 'does_not_contain', label: 'does not contain' },
  { value: 'has_any_of', label: 'has any of' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

export type FilterConditionRow = {
  id: string
  fieldCol: number | null
  operator: FilterOperator
  /** Single-line / text operators */
  value: string
  /** Multi-select tags for has_any_of */
  multiValues: string[]
}

export type FilterBuilderTopItem =
  | { type: 'line'; id: string; join: 'where' | 'and' | 'or'; row: FilterConditionRow }
  | { type: 'orGroup'; id: string; join: 'and' | 'or'; rows: FilterConditionRow[] }

export function newFilterConditionRow(): FilterConditionRow {
  return {
    id: crypto.randomUUID(),
    fieldCol: null,
    operator: 'contains',
    value: '',
    multiValues: [],
  }
}

export function defaultFilterBuilderItems(): FilterBuilderTopItem[] {
  return [{ type: 'line', id: crypto.randomUUID(), join: 'where', row: newFilterConditionRow() }]
}

function cellTokens(s: string): string[] {
  return s.split(/[,;|]/).map((x) => x.trim()).filter(Boolean)
}

export function evalFilterConditionRow(row: FilterConditionRow, cells: string[]): boolean {
  if (row.fieldCol == null) return true
  const raw = String(cells[row.fieldCol] ?? '')
  const cell = raw.trim()
  const cellL = cell.toLowerCase()
  const val = row.value.trim()
  const valL = val.toLowerCase()
  const pills = row.multiValues.map((p) => p.trim()).filter(Boolean)

  switch (row.operator) {
    case 'is':
    case 'is_exactly':
      return cellL === valL
    case 'is_not':
      return cellL !== valL
    case 'contains':
      return cellL.includes(valL)
    case 'does_not_contain':
      return !cellL.includes(valL)
    case 'is_empty':
      return cell.length === 0
    case 'is_not_empty':
      return cell.length > 0
    case 'has_any_of': {
      const needles =
        pills.length > 0 ? pills : val.split(',').map((x) => x.trim()).filter(Boolean)
      if (needles.length === 0) return true
      const tokens = new Set(cellTokens(cell).map((t) => t.toLowerCase()))
      if (tokens.size > 0) {
        return needles.some((n) => tokens.has(n.toLowerCase()))
      }
      return needles.some((n) => cellL.includes(n.toLowerCase()))
    }
    default:
      return true
  }
}

/**
 * Left-associative AND / OR between top-level lines and groups.
 * Inactive / incomplete rows are skipped (they do not widen matches).
 */
export function evalFilterBuilder(items: FilterBuilderTopItem[], cells: string[]): boolean {
  if (items.length === 0) return true
  let acc: boolean | null = null
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    let current: boolean | null = null
    if (item.type === 'line') {
      if (!filterConditionRowIsActive(item.row)) continue
      current = evalFilterConditionRow(item.row, cells)
    } else {
      const active = item.rows.filter(filterConditionRowIsActive)
      if (active.length === 0) continue
      current = active.some((r) => evalFilterConditionRow(r, cells))
    }
    if (acc === null) {
      acc = current
      continue
    }
    const combine = item.join === 'or' ? 'or' : 'and'
    acc = combine === 'or' ? acc || current : acc && current
  }
  return acc ?? true
}

export function filterConditionRowIsActive(row: FilterConditionRow): boolean {
  if (row.fieldCol == null) return false
  if (row.operator === 'is_empty' || row.operator === 'is_not_empty') return true
  if (row.operator === 'has_any_of') {
    return (
      row.multiValues.some((p) => p.trim().length > 0) || row.value.trim().length > 0
    )
  }
  return row.value.trim().length > 0
}

export function filterBuilderIsActive(items: FilterBuilderTopItem[]): boolean {
  for (const it of items) {
    if (it.type === 'line') {
      if (filterConditionRowIsActive(it.row)) return true
    } else if (it.rows.some(filterConditionRowIsActive)) {
      return true
    }
  }
  return false
}

export function filterBuilderSummaryLabels(
  items: FilterBuilderTopItem[],
  headers: string[]
): string[] {
  const names: string[] = []
  const pushCol = (c: number | null) => {
    if (c == null) return
    const label = (headers[c] || `Column ${c + 1}`).trim()
    if (!names.includes(label)) names.push(label)
  }
  for (const it of items) {
    if (it.type === 'line') {
      if (filterConditionRowIsActive(it.row)) pushCol(it.row.fieldCol)
    } else {
      for (const r of it.rows) {
        if (filterConditionRowIsActive(r)) pushCol(r.fieldCol)
      }
    }
  }
  return names
}

export function operatorNeedsValue(op: FilterOperator): boolean {
  return op !== 'is_empty' && op !== 'is_not_empty'
}

export function operatorUsesMultiPills(op: FilterOperator): boolean {
  return op === 'has_any_of'
}
