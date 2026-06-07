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
  qty?: number
}

type BucketContextValue = {
  items: BucketItem[]
  addItem: (item: BucketItem) => { added: boolean }
  removeItem: (id: string) => void
  updateQty: (id: string, qty: number) => void
  removeItems: (ids: string[]) => void
  toast: string | null
  showToast: (message: string) => void
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
}

function normalizeItem(item: BucketItem): BucketItem {
  const qty = item.qty ?? 1
  return { ...item, qty: qty < 1 ? 1 : qty }
}

const BucketContext = createContext<BucketContextValue | null>(null)

function loadStoredItems(): BucketItem[] {
  try {
    const raw = sessionStorage.getItem(BUCKET_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normalizeItem(item as BucketItem))
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
    const normalized = normalizeItem(item)
    const alreadyExists = items.some((i) => i.id === normalized.id)
    if (!alreadyExists) {
      setItems((prev) => [...prev, normalized])
    }
    return { added: !alreadyExists }
  }, [items])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const removeItems = useCallback((ids: string[]) => {
    const drop = new Set(ids)
    setItems((prev) => prev.filter((i) => !drop.has(i.id)))
  }, [])

  const updateQty = useCallback((id: string, qty: number) => {
    const next = Math.max(1, Math.floor(qty))
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, qty: next } : i)))
  }, [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [])

  const value: BucketContextValue = {
    items,
    addItem,
    removeItem,
    updateQty,
    removeItems,
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
