import { ChevronDown, Filter } from 'lucide-react'

export function AllFilesFilters() {
  const chip =
    'inline-flex h-7 items-center gap-1 rounded-[8px] bg-app-fill px-2.5 text-[13px] text-app-secondary hover:bg-app-fill-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={chip}>
        Owner
        <ChevronDown className="h-3.5 w-3.5 text-app-tertiary" strokeWidth={1.75} />
      </button>
      <button type="button" className={chip}>
        Kind
        <ChevronDown className="h-3.5 w-3.5 text-app-tertiary" strokeWidth={1.75} />
      </button>
      <button type="button" className={chip}>
        <Filter className="h-3.5 w-3.5" strokeWidth={1.75} />
        Filters
      </button>
    </div>
  )
}
