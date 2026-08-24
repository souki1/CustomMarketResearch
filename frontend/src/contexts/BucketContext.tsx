import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { WORKSPACE_RESET_EVENT, workspaceStorageKey } from '@/lib/auth'

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

function storageKey(): string {
  return workspaceStorageKey(BUCKET_STORAGE_KEY)
}

function loadStoredItems(): BucketItem[] {
  try {
    // Never read the legacy unscoped key — it leaked across accounts.
    const raw = sessionStorage.getItem(storageKey())
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
    sessionStorage.setItem(storageKey(), JSON.stringify(items))
  } catch {
    // ignore
  }
}

export function BucketProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<BucketItem[]>(loadStoredItems)
  const [toast, setToast] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const itemsRef = useRef(items)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    saveItems(items)
  }, [items])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // Reload / clear bucket when the signed-in account changes.
  useEffect(() => {
    const sync = () => {
      const next = loadStoredItems()
      itemsRef.current = next
      setItems(next)
      setDrawerOpen(false)
    }
    window.addEventListener(WORKSPACE_RESET_EVENT, sync)
    return () => window.removeEventListener(WORKSPACE_RESET_EVENT, sync)
  }, [])

  const addItem = useCallback((item: BucketItem) => {
    const normalized = normalizeItem(item)
    if (itemsRef.current.some((i) => i.id === normalized.id)) {
      return { added: false }
    }
    const next = [...itemsRef.current, normalized]
    itemsRef.current = next
    setItems(next)
    return { added: true }
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== id)
      itemsRef.current = next
      return next
    })
  }, [])

  const removeItems = useCallback((ids: string[]) => {
    const drop = new Set(ids)
    setItems((prev) => {
      const next = prev.filter((i) => !drop.has(i.id))
      itemsRef.current = next
      return next
    })
  }, [])

  const updateQty = useCallback((id: string, qty: number) => {
    const nextQty = Math.max(1, Math.floor(qty))
    setItems((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, qty: nextQty } : i))
      itemsRef.current = next
      return next
    })
  }, [])

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3000)
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
