import type { ReportBlock } from '@/lib/savedReports'
import { alignClass } from '@/components/reports/reportBlockUtils'

type ListBlock = Extract<ReportBlock, { type: 'bullets' }> | Extract<ReportBlock, { type: 'numbered' }>

type Props = {
  block: ListBlock
  selected: boolean
  onSelect: () => void
  onChange: (next: ReportBlock) => void
  ordered: boolean
}

export function ReportListBlockEditor({ block, selected, onSelect, onChange, ordered }: Props) {
  const ring = selected ? 'ring-2 ring-blue-500 ring-offset-2' : 'ring-1 ring-transparent hover:ring-slate-200'
  const baseWrap = `group relative rounded-lg transition-shadow ${ring}`
  const value = block.items.join('\n')
  const ListTag = ordered ? 'ol' : 'ul'
  const listClass = ordered ? 'list-decimal' : 'list-disc'

  return (
    <div className={baseWrap} onClick={onSelect} role="presentation">
      <div className={`${alignClass(block.align)}`}>
        <ListTag className={`${listClass} space-y-1 py-1 pl-5 text-sm text-gray-800`}>
          {block.items.filter((x) => x.trim()).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
          {!block.items.some((x) => x.trim()) && (
            <li className="text-gray-400">{ordered ? 'One line per item…' : 'One bullet per line…'}</li>
          )}
        </ListTag>
      </div>
      {selected && (
        <label className="mt-2 block text-xs font-medium text-slate-500">
          {ordered ? 'Edit list (one per line)' : 'Edit bullets (one per line)'}
          <textarea
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            rows={4}
            value={value}
            onChange={(e) => {
              const items = e.target.value.split('\n')
              onChange({ ...block, items: items.length ? items : [''] } as ReportBlock)
            }}
          />
        </label>
      )}
    </div>
  )
}
