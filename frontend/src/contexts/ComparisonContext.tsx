import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import type { BucketItem } from '@/contexts/BucketContext'

type ComparisonContextValue = {
  items: BucketItem[]
  isOpen: boolean
  openWithItems: (items: BucketItem[]) => void
  closeAndClear: () => void
}

const ComparisonContext = createContext<ComparisonContextValue | null>(null)

export function ComparisonProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BucketItem[]>([])
  const [isOpen, setIsOpen] = useState(false)

  const openWithItems = useCallback((newItems: BucketItem[]) => {
    setItems(newItems)
    setIsOpen(true)
  }, [])

  const closeAndClear = useCallback(() => {
    setItems([])
    setIsOpen(false)
  }, [])

  const value: ComparisonContextValue = {
    items,
    isOpen,
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
