import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

const BUCKET_STORAGE_KEY = 'cmr_bucket_items'

export type BucketItem = {
  id: string
  title: string
  manufacturer: string
  price: string
  rowIndex: number
  tabId?: string
}

type BucketContextValue = {
  items: BucketItem[]
  addItem: (item: BucketItem) => { added: boolean }
  /** Appends items whose ids are not already present. Single state update (safe for multi-select). */
  addItemsIfMissing: (incoming: BucketItem[]) => void
  removeItem: (id: string) => void
  toast: string | null
  showToast: (message: string) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
}

const BucketContext = createContext<BucketContextValue | null>(null)

function loadStoredItems(): BucketItem[] {
  try {
    const raw = sessionStorage.getItem(BUCKET_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveItems(items: BucketItem[]) {
  try {
    sessionStorage.setItem(BUCKET_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function BucketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BucketItem[]>(loadStoredItems)
  const [toast, setToast] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    saveItems(items)
  }, [items])

  const addItem = useCallback((item: BucketItem) => {
    let added = false
    setItems((prev) => {
      if (prev.some((i) => i.id === item.id)) {
        return prev
      }
      added = true
      return [...prev, item]
    })
    return { added }
  }, [])

  const addItemsIfMissing = useCallback((incoming: BucketItem[]) => {
    if (incoming.length === 0) return
    setItems((prev) => {
      const seen = new Set(prev.map((i) => i.id))
      const toAdd: BucketItem[] = []
      for (const item of incoming) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        toAdd.push(item)
      }
      if (toAdd.length === 0) return prev
      return [...prev, ...toAdd]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [])

  const value: BucketContextValue = {
    items,
    addItem,
    addItemsIfMissing,
    removeItem,
    toast,
    showToast,
    drawerOpen,
    setDrawerOpen,
  }

  return (
    <BucketContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[100] rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-lg text-sm font-medium text-gray-900"
          role="status"
        >
          {toast}
        </div>
      )}
    </BucketContext.Provider>
  )
}

export function useBucket() {
  const ctx = useContext(BucketContext)
  if (!ctx) throw new Error('useBucket must be used within BucketProvider')
  return ctx
}
