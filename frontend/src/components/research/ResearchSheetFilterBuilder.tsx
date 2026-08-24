import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, GripVertical, HelpCircle, Plus, Trash2 } from 'lucide-react'
import {
  FILTER_OPERATORS,
  type FilterBuilderTopItem,
  type FilterConditionRow,
  type FilterOperator,
  newFilterConditionRow,
  operatorNeedsValue,
  operatorUsesMultiPills,
} from '@/lib/researchSheetFilter'

function normalizeTopItems(list: FilterBuilderTopItem[]): FilterBuilderTopItem[] {
  const next = [...list]
  if (next[0]?.type === 'line') {
    next[0] = { ...next[0], join: 'where' }
  }
  for (let i = 1; i < next.length; i++) {
    const it = next[i]
    if (it?.type === 'line' && it.join === 'where') {
      next[i] = { ...it, join: 'and' }
    }
  }
  return next
}

type Props = {
  headers: string[]
  items: FilterBuilderTopItem[]
  onChange: (items: FilterBuilderTopItem[]) => void
  getDistinctColumnValues: (colIdx: number) => string[]
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

export function ResearchSheetFilterBuilder({
  headers,
  items,
  onChange,
  getDistinctColumnValues,
}: Props) {
  const [valuePickerFor, setValuePickerFor] = useState<{
    kind: 'line' | 'or'
    topId: string
    rowId: string
  } | null>(null)

  const updateLineRow = useCallback(
    (topId: string, patch: Partial<FilterConditionRow> | ((r: FilterConditionRow) => FilterConditionRow)) => {
      onChange(
        items.map((it) => {
          if (it.type !== 'line' || it.id !== topId) return it
          const next =
            typeof patch === 'function' ? patch(it.row) : { ...it.row, ...patch }
          return { ...it, row: next }
        })
      )
    },
    [items, onChange]
  )

  const updateGroupRow = useCallback(
    (
      groupId: string,
      rowId: string,
      patch: Partial<FilterConditionRow> | ((r: FilterConditionRow) => FilterConditionRow)
    ) => {
      onChange(
        items.map((it) => {
          if (it.type !== 'orGroup' || it.id !== groupId) return it
          return {
            ...it,
            rows: it.rows.map((r) => {
              if (r.id !== rowId) return r
              return typeof patch === 'function' ? patch(r) : { ...r, ...patch }
            }),
          }
        })
      )
    },
    [items, onChange]
  )

  const removeTopItem = useCallback(
    (id: string) => {
      const next = items.filter((it) => it.id !== id)
      if (next.length === 0) {
        onChange([{ type: 'line', id: crypto.randomUUID(), join: 'where', row: newFilterConditionRow() }])
        return
      }
      onChange(normalizeTopItems(next))
    },
    [items, onChange]
  )

  const removeGroupRow = useCallback(
    (groupId: string, rowId: string) => {
      onChange(
        items.flatMap((it) => {
          if (it.type !== 'orGroup' || it.id !== groupId) return [it]
          const rows = it.rows.filter((r) => r.id !== rowId)
          if (rows.length === 0) return []
          return [{ ...it, rows }]
        })
      )
    },
    [items, onChange]
  )

  const addCondition = useCallback(() => {
    onChange([
      ...items,
      { type: 'line', id: crypto.randomUUID(), join: 'and', row: newFilterConditionRow() },
    ])
  }, [items, onChange])

  const addConditionGroup = useCallback(() => {
    onChange([
      ...items,
      {
        type: 'orGroup',
        id: crypto.randomUUID(),
        join: 'and',
        rows: [newFilterConditionRow(), newFilterConditionRow()],
      },
    ])
  }, [items, onChange])

  const addGroupCondition = useCallback(
    (groupId: string) => {
      onChange(
        items.map((it) =>
          it.type === 'orGroup' && it.id === groupId
            ? { ...it, rows: [...it.rows, newFilterConditionRow()] }
            : it
        )
      )
    },
    [items, onChange]
  )

  const onDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDropReorder = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault()
    const from = Number(e.dataTransfer.getData('text/plain'))
    if (Number.isNaN(from) || from === toIndex) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    if (!moved) return
    next.splice(toIndex, 0, moved)
    onChange(normalizeTopItems(next))
  }

  const pickerOptions = useMemo(() => {
    if (!valuePickerFor) return []
    const top = items.find(
      (it) =>
        (it.type === 'line' && valuePickerFor.kind === 'line' && it.id === valuePickerFor.topId) ||
        (it.type === 'orGroup' && valuePickerFor.kind === 'or' && it.id === valuePickerFor.topId)
    )
    if (!top) return []
    const row =
      top.type === 'line'
        ? top.row
        : top.rows.find((r) => r.id === valuePickerFor.rowId)
    if (!row || row.fieldCol == null) return []
    return getDistinctColumnValues(row.fieldCol)
  }, [valuePickerFor, items, getDistinctColumnValues])

  const renderValueEditor = (
    row: FilterConditionRow,
    topId: string,
    kind: 'line' | 'or',
    rowId: string
  ) => {
    const multi = operatorUsesMultiPills(row.operator)
    const needs = operatorNeedsValue(row.operator)
    if (!needs) {
      return <span className="text-[11px] text-slate-400">—</span>
    }
    if (multi) {
      return (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {row.multiValues.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 rounded-md bg-teal-100 px-1.5 py-0.5 text-[11px] font-medium text-teal-900"
            >
              {tag}
              <button
                type="button"
                className="rounded hover:bg-teal-200/80"
                aria-label={`Remove ${tag}`}
                onClick={() => {
                  const next = row.multiValues.filter((t) => t !== tag)
                  if (kind === 'line') updateLineRow(topId, { multiValues: next })
                  else updateGroupRow(topId, rowId, { multiValues: next })
                }}
              >
                <span className="sr-only">Remove</span>×
              </button>
            </span>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                setValuePickerFor(
                  valuePickerFor?.rowId === rowId && valuePickerFor.topId === topId
                    ? null
                    : { kind, topId, rowId }
                )
              }
              className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Add…
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            {valuePickerFor?.rowId === rowId &&
              valuePickerFor.topId === topId &&
              valuePickerFor.kind === kind && (
                <div className="absolute left-0 top-[calc(100%+4px)] z-10 max-h-40 w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-md">
                  {pickerOptions.length === 0 ? (
                    <p className="px-2 py-1.5 text-[11px] text-slate-400">No values in column</p>
                  ) : (
                    pickerOptions.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="block w-full truncate px-2 py-1 text-left text-[11px] hover:bg-slate-50"
                        onClick={() => {
                          if (row.multiValues.includes(v)) {
                            setValuePickerFor(null)
                            return
                          }
                          const next = [...row.multiValues, v]
                          if (kind === 'line') updateLineRow(topId, { multiValues: next })
                          else updateGroupRow(topId, rowId, { multiValues: next })
                          setValuePickerFor(null)
                        }}
                      >
                        {v}
                      </button>
                    ))
                  )}
                </div>
              )}
          </div>
        </div>
      )
    }
    return (
      <input
        type="text"
        value={row.value}
        onChange={(e) => {
          const v = e.target.value
          if (kind === 'line') updateLineRow(topId, { value: v })
          else updateGroupRow(topId, rowId, { value: v })
        }}
        placeholder="Enter a value"
        className="min-w-[6rem] flex-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
      />
    )
  }

  const renderConditionRow = (
    row: FilterConditionRow,
    leading: React.ReactNode,
    topId: string,
    kind: 'line' | 'or',
    rowId: string,
    onRemove: () => void,
    dragIndex: number | null
  ) => (
    <div
      key={rowId}
      className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 py-2 last:border-b-0"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => dragIndex != null && onDropReorder(e, dragIndex)}
    >
      <div className="w-14 shrink-0 text-[11px] font-medium text-slate-500">{leading}</div>
      <select
        value={row.fieldCol ?? ''}
        onChange={(e) => {
          const v = e.target.value
          const col = v === '' ? null : Number(v)
          if (kind === 'line') updateLineRow(topId, { fieldCol: col })
          else updateGroupRow(topId, rowId, { fieldCol: col })
        }}
        className="max-w-[9rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-800"
      >
        <option value="">Select field</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {truncate((h || `Column ${i + 1}`).trim(), 42)}
          </option>
        ))}
      </select>
      <select
        value={row.operator}
        onChange={(e) => {
          const op = e.target.value as FilterOperator
          const patch: Partial<FilterConditionRow> = { operator: op }
          if (op === 'has_any_of') patch.value = ''
          if (op === 'is_empty' || op === 'is_not_empty') {
            patch.value = ''
            patch.multiValues = []
          }
          if (kind === 'line') updateLineRow(topId, patch)
          else updateGroupRow(topId, rowId, patch)
        }}
        className="max-w-[8.5rem] shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-800"
      >
        {FILTER_OPERATORS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex min-w-0 flex-1 basis-[8rem] items-center">{renderValueEditor(row, topId, kind, rowId)}</div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Remove condition"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        {dragIndex != null && (
          <div
            draggable
            onDragStart={(e) => onDragStart(e, dragIndex)}
            className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
            aria-label="Reorder"
            title="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex max-h-[min(70vh,520px)] flex-col">
      <div className="border-b border-slate-100 pb-2">
        <h3 className="text-sm font-semibold text-slate-900">Filter</h3>
        <p className="mt-0.5 text-[11px] text-slate-500">In this view, show records</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {items.map((it, index) => {
          if (it.type === 'line') {
            const leading =
              index === 0 ? (
                'Where'
              ) : (
                <select
                  value={it.join === 'where' ? 'and' : it.join}
                  onChange={(e) => {
                    const join = e.target.value as 'and' | 'or'
                    onChange(
                      items.map((x) => (x.id === it.id && x.type === 'line' ? { ...x, join } : x))
                    )
                  }}
                  className="w-full rounded border border-transparent bg-transparent py-0.5 text-[11px] font-medium text-slate-700 hover:border-slate-200"
                >
                  <option value="and">and</option>
                  <option value="or">or</option>
                </select>
              )
            return renderConditionRow(
              it.row,
              leading,
              it.id,
              'line',
              it.row.id,
              () => removeTopItem(it.id),
              index
            )
          }
          return (
            <div
              key={it.id}
              className="my-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropReorder(e, index)}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-600">
                  {index > 0 ? (
                    <select
                      value={it.join}
                      onChange={(e) => {
                        const join = e.target.value as 'and' | 'or'
                        onChange(
                          items.map((x) =>
                            x.id === it.id && x.type === 'orGroup' ? { ...x, join } : x
                          )
                        )
                      }}
                      className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] font-medium text-slate-800"
                    >
                      <option value="and">and</option>
                      <option value="or">or</option>
                    </select>
                  ) : (
                    <span className="text-slate-500">Where</span>
                  )}
                  <span className="font-normal text-slate-500">any of the following match</span>
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => removeTopItem(it.id)}
                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600"
                    aria-label="Remove group"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <div
                    draggable
                    onDragStart={(e) => onDragStart(e, index)}
                    className="cursor-grab rounded p-1 text-slate-400 hover:bg-white active:cursor-grabbing"
                    aria-label="Reorder group"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
              {it.rows.map((row, ri) =>
                renderConditionRow(
                  row,
                  ri === 0 ? 'Where' : 'or',
                  it.id,
                  'or',
                  row.id,
                  () => removeGroupRow(it.id, row.id),
                  null
                )
              )}
              <button
                type="button"
                onClick={() => addGroupCondition(it.id)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3 w-3" />
                Add condition in group
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={addCondition}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
        >
          <Plus className="h-3 w-3" />
          Add condition
        </button>
        <button
          type="button"
          onClick={addConditionGroup}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50"
        >
          <Plus className="h-3 w-3" />
          Add condition group
        </button>
        <button
          type="button"
          className="ml-auto rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Filters apply to rows in this sheet. Values are matched as text."
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
