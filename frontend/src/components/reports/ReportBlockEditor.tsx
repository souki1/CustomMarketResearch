import type { ReportBlock } from '@/lib/savedReports'
import { ReportListBlockEditor } from '@/components/reports/ReportListBlockEditor'
import { alignClass, calloutToneClass, spacerHeight } from '@/components/reports/reportBlockUtils'

type Props = {
  block: ReportBlock
  selected: boolean
  onSelect: () => void
  onChange: (next: ReportBlock) => void
}

export function ReportBlockEditor({ block, selected, onSelect, onChange }: Props) {
  const ring = selected ? 'ring-2 ring-blue-500 ring-offset-2' : 'ring-1 ring-transparent hover:ring-slate-200'
  const baseWrap = `group relative rounded-lg transition-shadow ${ring}`

  if (block.type === 'divider') {
    const dashed = block.style === 'dashed'
    return (
      <button type="button" className={`${baseWrap} w-full py-2`} onClick={onSelect} aria-label="Divider">
        {dashed ? <div className="border-t-2 border-dashed border-slate-300" /> : <div className="h-px w-full bg-slate-200" />}
      </button>
    )
  }

  if (block.type === 'spacer') {
    return (
      <button
        type="button"
        className={`${baseWrap} flex w-full items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/50 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-400`}
        onClick={onSelect}
        aria-label="Spacer"
      >
        <span className={`w-full ${spacerHeight(block.size)}`} />
        <span className="sr-only">Spacer</span>
      </button>
    )
  }

  if (block.type === 'bullets') {
    return (
      <ReportListBlockEditor block={block} selected={selected} onSelect={onSelect} onChange={onChange} ordered={false} />
    )
  }

  if (block.type === 'numbered') {
    return (
      <ReportListBlockEditor block={block} selected={selected} onSelect={onSelect} onChange={onChange} ordered={true} />
    )
  }

  if (block.type === 'table') {
    const colCount = Math.max(1, ...block.rows.map((r) => r.length))
    const paddedRows = block.rows.map((r) => {
      const c = [...r]
      while (c.length < colCount) c.push('')
      return c.slice(0, colCount)
    })

    const setCell = (ri: number, ci: number, value: string) => {
      const next = paddedRows.map((r, i) => (i === ri ? r.map((cell, j) => (j === ci ? value : cell)) : r))
      onChange({ ...block, rows: next })
    }

    const addRow = () => {
      onChange({ ...block, rows: [...paddedRows, Array(colCount).fill('')] })
    }

    const removeRow = () => {
      if (paddedRows.length <= 1) return
      onChange({ ...block, rows: paddedRows.slice(0, -1) })
    }

    const addCol = () => {
      onChange({ ...block, rows: paddedRows.map((r) => [...r, '']) })
    }

    const removeCol = () => {
      if (colCount <= 1) return
      onChange({ ...block, rows: paddedRows.map((r) => r.slice(0, -1)) })
    }

    const dataRows = block.showHeader && paddedRows.length > 0 ? paddedRows.slice(1) : paddedRows

    const cellClass =
      'min-w-[5rem] border-slate-200 px-2 py-2 text-left align-top text-sm first:border-l-0 last:border-r-0 max-sm:min-w-[4rem]'
    const inputClass =
      'w-full min-w-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/30'

    return (
      <div className={baseWrap} onClick={onSelect} role="presentation">
        <div className={`overflow-x-auto ${alignClass(block.align)}`}>
          <table className="w-full min-w-0 border-collapse rounded-md border border-slate-200 text-gray-800">
            {block.showHeader && paddedRows.length > 0 ? (
              <thead>
                <tr>
                  {paddedRows[0].map((cell, ci) => (
                    <th
                      key={ci}
                      className={`${cellClass} border-b border-slate-200 bg-slate-100 font-semibold text-slate-800`}
                    >
                      {selected ? (
                        <input
                          type="text"
                          className={inputClass}
                          value={cell}
                          onChange={(e) => setCell(0, ci, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="block min-h-5">{cell.trim() ? cell : '—'}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {dataRows.map((row, ri) => {
                const actualRi = block.showHeader ? ri + 1 : ri
                return (
                  <tr key={actualRi} className="odd:bg-white even:bg-slate-50/80">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`${cellClass} border-t border-slate-200`}>
                        {selected ? (
                          <input
                            type="text"
                            className={inputClass}
                            value={cell}
                            onChange={(e) => setCell(actualRi, ci, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="block min-h-5">{cell.trim() ? cell : ''}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {selected && (
          <div className="mt-2 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={addRow}
            >
              + Row
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={paddedRows.length <= 1}
              onClick={removeRow}
            >
              − Row
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={addCol}
            >
              + Column
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={colCount <= 1}
              onClick={removeCol}
            >
              − Column
            </button>
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'image') {
    const hasSrc = block.src.trim().length > 0
    return (
      <div className={baseWrap} onClick={onSelect} role="presentation">
        <figure className={`${alignClass(block.align)}`}>
          {hasSrc ? (
            <img
              src={block.src}
              alt={block.alt || 'Report image'}
              className="mx-auto max-h-48 w-auto max-w-full rounded-md object-contain ring-1 ring-slate-200/80"
            />
          ) : (
            <div className="mx-auto flex min-h-24 max-w-full items-center justify-center rounded-md bg-slate-100 text-sm text-slate-400 ring-1 ring-slate-200/80">
              Image URL
            </div>
          )}
          {block.caption.trim() ? (
            <figcaption className="mt-2 text-xs text-slate-600">{block.caption}</figcaption>
          ) : null}
        </figure>
        {selected && (
          <div className="mt-2 space-y-2">
            <label className="block text-xs font-medium text-slate-500">
              Image URL
              <input
                type="url"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                value={block.src}
                onChange={(e) => onChange({ ...block, src: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Alt text
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                value={block.alt}
                onChange={(e) => onChange({ ...block, alt: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-slate-500">
              Caption
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                value={block.caption}
                onChange={(e) => onChange({ ...block, caption: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    )
  }

  if (block.type === 'metric') {
    return (
      <div className={baseWrap} onClick={onSelect} role="presentation">
        <div className={`rounded-xl border border-slate-200 bg-linear-to-br from-slate-50 to-white px-4 py-4 shadow-sm ${alignClass(block.align)}`}>
          {selected ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <label className="block text-xs font-medium text-slate-500">
                Label
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={block.label}
                  onChange={(e) => onChange({ ...block, label: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-slate-500">
                Value
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={block.value}
                  onChange={(e) => onChange({ ...block, value: e.target.value })}
                />
              </label>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold tracking-tight text-gray-900">{block.value || '—'}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{block.label}</div>
            </>
          )}
        </div>
      </div>
    )
  }

  if (block.type === 'code') {
    return (
      <div className={baseWrap} onClick={onSelect} role="presentation">
        <div className={`${alignClass(block.align)}`}>
          {selected ? (
            <textarea
              className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              rows={6}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              spellCheck={false}
            />
          ) : (
            <pre className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100">
              {block.text.trim() ? block.text : <span className="text-slate-500">Code snippet…</span>}
            </pre>
          )}
        </div>
      </div>
    )
  }

  const textStyles =
    block.type === 'title'
      ? 'text-3xl font-bold tracking-tight text-gray-900'
      : block.type === 'heading'
        ? 'text-xl font-semibold text-gray-900'
        : block.type === 'subheading'
          ? 'text-xs font-semibold uppercase tracking-wider text-slate-500'
          : block.type === 'quote'
            ? 'border-l-4 border-slate-300 pl-4 text-base italic text-gray-700'
            : block.type === 'callout'
              ? calloutToneClass(block.tone)
              : 'text-sm leading-relaxed text-gray-800'

  const textValue =
    block.type === 'title' ||
    block.type === 'heading' ||
    block.type === 'subheading' ||
    block.type === 'paragraph' ||
    block.type === 'callout' ||
    block.type === 'quote'
      ? block.text
      : ''

  return (
    <div className={baseWrap} onClick={onSelect} role="presentation">
      <div className={alignClass(block.align)}>
        {selected ? (
          <textarea
            className={`w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
              block.type === 'title' ? 'min-h-14 text-3xl font-bold' : ''
            } ${block.type === 'subheading' ? 'text-xs font-semibold uppercase tracking-wider' : ''}`}
            rows={block.type === 'paragraph' || block.type === 'callout' ? 4 : 2}
            value={textValue}
            placeholder={
              block.type === 'title'
                ? 'Report title'
                : block.type === 'heading'
                  ? 'Section heading'
                  : block.type === 'subheading'
                    ? 'Subheading'
                    : block.type === 'quote'
                      ? 'Quoted text'
                      : 'Type here…'
            }
            onChange={(e) => {
              if (
                block.type === 'title' ||
                block.type === 'heading' ||
                block.type === 'subheading' ||
                block.type === 'paragraph' ||
                block.type === 'callout' ||
                block.type === 'quote'
              ) {
                onChange({ ...block, text: e.target.value })
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className={`min-h-6 whitespace-pre-wrap py-1 ${
              block.type === 'callout' ? calloutToneClass(block.tone) : textStyles
            }`}
          >
            {textValue.trim() ? (
              textValue
            ) : (
              <span className="text-gray-400">
                {block.type === 'title' ? 'Report title' : 'Empty block — click to edit'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
