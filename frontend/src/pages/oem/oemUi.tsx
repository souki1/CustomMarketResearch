import type { ReactNode } from 'react'

export function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[12px] border border-app-separator bg-app-surface px-4 py-3.5">
      <p className="text-xs font-medium text-app-secondary">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-app-label">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-app-secondary">{hint}</p> : null}
    </div>
  )
}

export function Badge({
  tone,
  children,
}: {
  tone: 'neutral' | 'ok' | 'warn' | 'danger' | 'info'
  children: ReactNode
}) {
  const cls =
    tone === 'ok'
      ? 'bg-app-ok-soft text-app-ok'
      : tone === 'warn'
        ? 'bg-app-warn-soft text-app-warn'
        : tone === 'danger'
          ? 'bg-app-danger-soft text-app-destructive'
          : tone === 'info'
            ? 'bg-app-accent-soft text-app-accent'
            : 'bg-app-fill text-app-secondary'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {children}
    </span>
  )
}

export function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-app-separator bg-app-surface">
      <div className="flex items-center justify-between gap-3 border-b border-app-separator px-4 py-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-app-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function DataTable({
  columns,
  children,
}: {
  columns: string[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-[13px]">
        <thead className="bg-app-fill/50 text-xs font-semibold uppercase tracking-[0.04em] text-app-tertiary">
          <tr>
            {columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-4 py-2.5 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-app-separator">{children}</tbody>
      </table>
    </div>
  )
}

export function GhostButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center rounded-[8px] border border-app-separator bg-app-surface px-3 text-[13px] font-medium text-app-label hover:bg-app-fill disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function AccentButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center rounded-[8px] bg-app-accent px-3 text-[13px] font-medium text-white hover:bg-app-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}
