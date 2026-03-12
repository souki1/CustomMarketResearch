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
  addItems: (items: ComparisonItem[]) => void
  removeItem: (id: string) => void
  closeAndClear: () => void
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null)

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ComparisonItem[]>([])

  const openWithItems = useCallback((newItems: ComparisonItem[]) => {
    setItems(newItems)
  }, [])

  const addItems = useCallback((newItems: ComparisonItem[]) => {
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.id))
      const toAdd = newItems.filter((i) => !seen.has(i.id))
      return toAdd.length ? [...prev, ...toAdd] : prev
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const closeAndClear = useCallback(() => {
    setItems([])
  }, [])

  const value: ComparisonContextValue = {
    items,
    openWithItems,
    addItems,
    removeItem,
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
