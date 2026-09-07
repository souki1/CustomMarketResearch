import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import type { CalloutTone, ReportBlock } from '@/lib/savedReports'
import { patchAlign } from '@/components/reports/reportBlockUtils'
import { FORMAT_BTN, FORMAT_BTN_OFF, FORMAT_BTN_ON } from '@/components/reports/reportStudioStyles'

type Props = {
  block: ReportBlock
  onChange: (next: ReportBlock) => void
}

export function ReportBlockFormatBar({ block, onChange }: Props) {
  const align = 'align' in block ? (block.align ?? 'left') : 'left'

  const alignGroup =
    'align' in block ? (
      <div className="flex items-center gap-0.5 rounded-md bg-app-fill p-0.5" role="group" aria-label="Alignment">
        {(
          [
            { v: 'left' as const, Icon: AlignLeft },
            { v: 'center' as const, Icon: AlignCenter },
            { v: 'right' as const, Icon: AlignRight },
          ] as const
        ).map(({ v, Icon }) => (
          <button
            key={v}
            type="button"
            title={`Align ${v}`}
            className={`${FORMAT_BTN} ${align === v ? FORMAT_BTN_ON : FORMAT_BTN_OFF}`}
            onClick={() => onChange(patchAlign(block, v))}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    ) : null

  if (block.type === 'callout') {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {alignGroup}
        <label className="flex items-center gap-1.5 text-xs text-app-secondary">
          <span className="sr-only">Callout style</span>
          <select
            className="rounded-md border border-app-separator bg-app-surface px-2 py-1 text-xs font-medium text-app-label"
            value={block.tone ?? 'amber'}
            onChange={(e) => onChange({ ...block, tone: e.target.value as CalloutTone })}
          >
            <option value="amber">Warm</option>
            <option value="blue">Info</option>
            <option value="emerald">Success</option>
            <option value="slate">Neutral</option>
          </select>
        </label>
      </div>
    )
  }

  if (block.type === 'divider') {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-app-secondary">Line style</span>
        <div className="flex gap-1">
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs font-medium ${block.style !== 'dashed' ? 'bg-blue-100 text-app-accent' : 'bg-app-surface text-app-secondary ring-1 ring-slate-200'}`}
            onClick={() => onChange({ ...block, style: 'solid' })}
          >
            Solid
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs font-medium ${block.style === 'dashed' ? 'bg-blue-100 text-app-accent' : 'bg-app-surface text-app-secondary ring-1 ring-slate-200'}`}
            onClick={() => onChange({ ...block, style: 'dashed' })}
          >
            Dashed
          </button>
        </div>
      </div>
    )
  }

  if (block.type === 'spacer') {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-app-secondary">Height</span>
        <div className="flex gap-1">
          {(['sm', 'md', 'lg'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`rounded-md px-2 py-1 text-xs font-medium uppercase ${block.size === s ? 'bg-blue-100 text-app-accent' : 'bg-app-surface text-app-secondary ring-1 ring-slate-200'}`}
              onClick={() => onChange({ ...block, size: s })}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (block.type === 'table') {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {alignGroup}
        <label className="flex cursor-pointer items-center gap-2 text-xs text-app-secondary">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-app-separator text-app-accent focus:ring-app-accent/20"
            checked={block.showHeader}
            onChange={(e) => onChange({ ...block, showHeader: e.target.checked })}
          />
          Header row
        </label>
      </div>
    )
  }

  if (!alignGroup) return null
  return <div className="mb-2 flex flex-wrap items-center gap-2">{alignGroup}</div>
}
