import type { ReportBlock, ReportBlockPdfMeta, TableCell } from '@/lib/savedReports'
import { ReportListBlockEditor } from '@/components/reports/ReportListBlockEditor'
import { alignClass, calloutToneClass, spacerHeight } from '@/components/reports/reportBlockUtils'

type PdfOverlayOpts = Pick<
  ReportBlockPdfMeta,
  'pdf_role' | 'pdf_width' | 'pdf_height' | 'pdf_auto' | 'pdf_field_name'
>

type Props = {
  block: ReportBlock
  selected: boolean
  onSelect: () => void
  onChange: (next: ReportBlock) => void
  pdfOverlay?: PdfOverlayOpts
}

function tableCellToInputString(cell: TableCell): string {
  return typeof cell === 'string' ? cell : cell.label
}

export function ReportBlockEditor({ block, selected, onSelect, onChange, pdfOverlay }: Props) {
  const isPdfField = pdfOverlay?.pdf_role === 'field'
  const isPdfLabel = pdfOverlay?.pdf_role === 'label'
  const ring = selected
    ? isPdfField
      ? 'ring-2 ring-violet-500 ring-offset-app-bg'
      : 'ring-2 ring-blue-500 ring-offset-app-bg'
    : pdfOverlay?.pdf_auto
      ? 'ring-1 ring-dashed ring-violet-300/80'
      : 'ring-1 ring-transparent hover:ring-slate-200'
  const baseWrap = `group relative rounded transition-shadow ${ring}`
  const overlayBoxStyle =
    pdfOverlay?.pdf_width || pdfOverlay?.pdf_height
      ? {
          width: pdfOverlay.pdf_width ? `${pdfOverlay.pdf_width}px` : undefined,
          minHeight: pdfOverlay.pdf_height ? `${pdfOverlay.pdf_height}px` : undefined,
        }
      : undefined

  if (block.type === 'divider') {
    const dashed = block.style === 'dashed'
    return (
      <button type="button" className={`${baseWrap} w-full py-2`} onClick={onSelect} aria-label="Divider">
        {dashed ? <div className="border-t-2 border-dashed border-app-separator" /> : <div className="h-px w-full bg-app-fill-strong" />}
      </button>
    )
  }

  if (block.type === 'spacer') {
    return (
      <button
        type="button"
        className={`${baseWrap} flex w-full items-center justify-center rounded-md border border-dashed border-app-separator bg-app-fill/50 py-1 text-[10px] font-medium uppercase tracking-wide text-app-tertiary`}
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
      'min-w-[5rem] border-app-separator px-2 py-2 text-left align-top text-sm first:border-l-0 last:border-r-0 max-sm:min-w-[4rem]'
    const inputClass =
      'w-full min-w-0 rounded border border-app-separator bg-app-surface px-1.5 py-1 text-sm text-app-label focus:border-app-accent focus:outline-none focus:ring-1 focus:ring-app-accent/30'

    return (
      <div className={baseWrap} onClick={onSelect} role="presentation">
        <div className={`overflow-x-auto ${alignClass(block.align)}`}>
          <table className="w-full min-w-0 border-collapse rounded-md border border-app-separator text-app-label">
            {block.showHeader && paddedRows.length > 0 ? (
              <thead>
                <tr>
                  {paddedRows[0].map((cell, ci) => (
                    <th
                      key={ci}
                      className={`${cellClass} border-b border-app-separator bg-app-fill font-semibold text-app-label`}
                    >
                      {selected ? (
                        <input
                          type="text"
                          className={inputClass}
                          value={tableCellToInputString(cell)}
                          onChange={(e) => setCell(0, ci, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : typeof cell !== 'string' && cell.type === 'link' ? (
                        <a
                          href={cell.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={cell.href}
                          className="block min-h-5 text-app-accent underline"
                        >
                          {cell.label}
                        </a>
                      ) : (
                        <span className="block min-h-5">{tableCellToInputString(cell).trim() ? tableCellToInputString(cell) : '—'}</span>
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
                  <tr key={actualRi} className="odd:bg-app-surface even:bg-app-fill/80">
                    {row.map((cell, ci) => (
                      <td key={ci} className={`${cellClass} border-t border-app-separator`}>
                        {selected ? (
                          <input
                            type="text"
                            className={inputClass}
                            value={tableCellToInputString(cell)}
                            onChange={(e) => setCell(actualRi, ci, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : typeof cell !== 'string' && cell.type === 'link' ? (
                          <a
                            href={cell.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={cell.href}
                            className="block min-h-5 text-app-accent underline"
                          >
                            {cell.label}
                          </a>
                        ) : (
                          <span className="block min-h-5">{tableCellToInputString(cell).trim() ? tableCellToInputString(cell) : ''}</span>
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
              className="rounded-md border border-app-separator bg-app-surface px-2 py-1 text-xs font-medium text-app-secondary hover:bg-app-fill"
              onClick={addRow}
            >
              + Row
            </button>
            <button
              type="button"
              className="rounded-md border border-app-separator bg-app-surface px-2 py-1 text-xs font-medium text-app-secondary hover:bg-app-fill disabled:opacity-40"
              disabled={paddedRows.length <= 1}
              onClick={removeRow}
            >
              − Row
            </button>
            <button
              type="button"
              className="rounded-md border border-app-separator bg-app-surface px-2 py-1 text-xs font-medium text-app-secondary hover:bg-app-fill"
              onClick={addCol}
            >
              + Column
            </button>
            <button
              type="button"
              className="rounded-md border border-app-separator bg-app-surface px-2 py-1 text-xs font-medium text-app-secondary hover:bg-app-fill disabled:opacity-40"
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
              className="mx-auto max-h-48 w-auto max-w-full rounded-md object-contain ring-1 ring-app-separator"
            />
          ) : (
            <div className="mx-auto flex min-h-24 max-w-full items-center justify-center rounded-md bg-app-fill text-sm text-app-tertiary ring-1 ring-app-separator">
              Image URL
            </div>
          )}
          {block.caption.trim() ? (
            <figcaption className="mt-2 text-xs text-app-secondary">{block.caption}</figcaption>
          ) : null}
        </figure>
        {selected && (
          <div className="mt-2 space-y-2">
            <label className="block text-xs font-medium text-app-secondary">
              Image URL
              <input
                type="url"
                className="mt-1 w-full rounded-md border border-app-separator bg-app-surface px-2 py-1.5 text-sm"
                value={block.src}
                onChange={(e) => onChange({ ...block, src: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <label className="block text-xs font-medium text-app-secondary">
              Alt text
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-app-separator bg-app-surface px-2 py-1.5 text-sm"
                value={block.alt}
                onChange={(e) => onChange({ ...block, alt: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-app-secondary">
              Caption
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-app-separator bg-app-surface px-2 py-1.5 text-sm"
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
        <div className={`rounded-xl border border-app-separator bg-linear-to-br from-slate-50 to-white px-4 py-4 shadow-sm ${alignClass(block.align)}`}>
          {selected ? (
            <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
              <label className="block text-xs font-medium text-app-secondary">
                Label
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-app-separator bg-app-surface px-2 py-1.5 text-sm"
                  value={block.label}
                  onChange={(e) => onChange({ ...block, label: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-app-secondary">
                Value
                <input
                  type="text"
                  className="mt-1 w-full rounded-md border border-app-separator bg-app-surface px-2 py-1.5 text-sm"
                  value={block.value}
                  onChange={(e) => onChange({ ...block, value: e.target.value })}
                />
              </label>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold tracking-tight text-app-label">{block.value || '—'}</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wide text-app-secondary">{block.label}</div>
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
              className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100 focus:border-app-accent focus:outline-none focus:ring-2 focus:ring-app-accent/30"
              rows={6}
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              spellCheck={false}
            />
          ) : (
            <pre className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100">
              {block.text.trim() ? block.text : <span className="text-app-secondary">Code snippet…</span>}
            </pre>
          )}
        </div>
      </div>
    )
  }

  const textStyles =
    block.type === 'title'
      ? 'text-3xl font-bold tracking-tight text-app-label'
      : block.type === 'heading'
        ? 'text-xl font-semibold text-app-label'
        : block.type === 'subheading'
          ? 'text-xs font-semibold uppercase tracking-wider text-app-secondary'
          : block.type === 'quote'
            ? 'border-l-4 border-app-separator pl-4 text-base italic text-app-secondary'
            : block.type === 'callout'
              ? calloutToneClass(block.tone)
              : 'text-sm leading-relaxed text-app-label'

  const textValue =
    block.type === 'title' ||
    block.type === 'heading' ||
    block.type === 'subheading' ||
    block.type === 'paragraph' ||
    block.type === 'callout' ||
    block.type === 'quote'
      ? block.text
      : ''

  const pdfPlaceholder =
    pdfOverlay?.pdf_field_name?.trim() ||
    (isPdfField ? 'Enter value…' : isPdfLabel ? 'Label' : 'Type here…')

  const overlayInputClass = isPdfField
    ? 'w-full rounded border border-violet-300 bg-app-surface/95 px-1.5 py-0.5 text-sm text-app-label shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400/30'
    : isPdfLabel
      ? 'w-full rounded border border-transparent bg-app-surface/70 px-1 py-0.5 text-xs font-semibold text-app-label focus:border-violet-300 focus:bg-app-surface focus:outline-none'
      : 'w-full resize-none rounded border border-violet-200/80 bg-app-surface/85 px-1.5 py-0.5 text-sm leading-snug text-app-label focus:border-violet-400 focus:bg-app-surface focus:outline-none focus:ring-2 focus:ring-violet-400/20'

  return (
    <div className={baseWrap} style={overlayBoxStyle} onClick={onSelect} role="presentation">
      <div className={pdfOverlay ? '' : alignClass(block.align)}>
        {selected ? (
          isPdfField ? (
            <input
              type="text"
              className={overlayInputClass}
              value={textValue}
              placeholder={pdfPlaceholder}
              onChange={(e) => {
                if (block.type === 'paragraph' || block.type === 'callout' || block.type === 'quote') {
                  onChange({ ...block, text: e.target.value })
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <textarea
              className={
                pdfOverlay
                  ? overlayInputClass
                  : `w-full resize-y rounded-md border border-app-separator bg-app-surface px-2 py-2 text-sm text-app-label focus:border-app-accent focus:outline-none focus:ring-2 focus:ring-app-accent/20 ${
                      block.type === 'title' ? 'min-h-14 text-3xl font-bold' : ''
                    } ${block.type === 'subheading' ? 'text-xs font-semibold uppercase tracking-wider' : ''}`
              }
              rows={
                pdfOverlay
                  ? Math.max(1, Math.min(4, Math.ceil((pdfOverlay.pdf_height ?? 24) / 20)))
                  : block.type === 'paragraph' || block.type === 'callout'
                    ? 4
                    : 2
              }
              value={textValue}
              placeholder={pdfPlaceholder}
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
          )
        ) : (
          <div
            className={`min-h-6 whitespace-pre-wrap py-1 ${
              pdfOverlay
                ? `${overlayInputClass} ${!textValue.trim() ? 'text-app-tertiary' : ''}`
                : block.type === 'callout'
                  ? calloutToneClass(block.tone)
                  : textStyles
            }`}
          >
            {textValue.trim() ? (
              textValue
            ) : (
              <span className="text-app-tertiary">
                {pdfOverlay ? pdfPlaceholder : block.type === 'title' ? 'Report title' : 'Empty block — click to edit'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
