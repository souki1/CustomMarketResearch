import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

export type ComparisonSpec = {
  label: string
  value: string
}

export type ComparisonItem = {
  id: string
  title: string
  imageUrl?: string | null
  specs: ComparisonSpec[]
}

type ComparisonContextValue = {
  items: ComparisonItem[]
  openWithItems: (items: ComparisonItem[]) => void
  closeAndClear: () => void
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null)

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ComparisonItem[]>([])

  const openWithItems = useCallback((newItems: ComparisonItem[]) => {
    setItems(newItems)
  }, [])

  const closeAndClear = useCallback(() => {
    setItems([])
  }, [])

  const value: ComparisonContextValue = {
    items,
    openWithItems,
    closeAndClear,
  }

  return (
    <ComparisonContext.Provider value={value}>
      {children}
    </ComparisonContext.Provider>
  )
}

export function useComparison() {
  const ctx = useContext(ComparisonContext)
  if (!ctx) throw new Error('useComparison must be used within ComparisonProvider')
  return ctx
}
