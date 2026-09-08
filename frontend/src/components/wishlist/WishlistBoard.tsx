import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { getToken } from '@/lib/auth'
import {
  fetchWishlistCatalogItems,
  migrateWishlistItemId,
  type WishlistCatalogItem,
} from '@/lib/wishlistCatalog'

type WishlistStatus = 'priority' | 'watching' | 'interested' | 'ordered'

type WishlistList = {
  id: string
  name: string
  emoji: string
  color: string
  itemIds: string[]
}

const STATUS_META: Record<WishlistStatus, { label: string; chip: string }> = {
  priority: { label: 'Priority', chip: 'border-app-destructive/35 bg-app-danger-soft text-app-destructive' },
  watching: { label: 'Watching', chip: 'border-app-accent/35 bg-app-accent-soft text-app-accent' },
  interested: { label: 'Interested', chip: 'border-app-warn/35 bg-app-warn-soft text-app-warn' },
  ordered: { label: 'Ordered', chip: 'border-app-ok/35 bg-app-ok-soft text-app-ok' },
}

const COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#EF9F27', '#7C5CBF', '#E05C94', '#26A69A', '#FF7043']
const EMOJIS = ['📦', '👀', '⚡', '⭐', '🔧', '🏷️', '📋', '🎯', '🛒', '💡', '📌', '🔑']
const SORTS = ['Price ↑', 'Price ↓', 'Score ↓', 'Score ↑', 'Part A–Z', 'Company & brand A–Z', 'Vendor A–Z'] as const

const LISTS_STORAGE_KEY = 'ir-wishlist-board-lists'
const STATUS_STORAGE_KEY = 'ir-wishlist-board-statuses'
const CATALOG_CACHE_KEY = 'ir-wishlist-catalog-cache-v1'
/** How often the catalog re-syncs with research/portfolio data in the background. */
const CATALOG_REFRESH_MS = 120_000
/** Ignore focus-triggered refresh if we fetched this recently. */
const FOCUS_REFRESH_COOLDOWN_MS = 30_000

function loadCachedCatalog(): WishlistCatalogItem[] {
  try {
    const raw = sessionStorage.getItem(CATALOG_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as WishlistCatalogItem[]) : []
  } catch {
    return []
  }
}

function saveCachedCatalog(items: WishlistCatalogItem[]) {
  try {
    sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(items))
  } catch {
    // ignore quota errors — cache is an optimization only
  }
}

function priceTier(price: number | null) {
  if (price == null || price <= 0) {
    return { label: '—', chip: 'border-app-separator bg-app-fill text-app-secondary', value: 'text-app-tertiary' }
  }
  if (price < 25) {
    return { label: 'Best', chip: 'border-app-ok/35 bg-app-ok-soft text-app-ok', value: 'text-app-ok' }
  }
  if (price < 45) {
    return { label: 'Good', chip: 'border-app-accent/35 bg-app-accent-soft text-app-accent', value: 'text-app-accent' }
  }
  if (price < 65) {
    return { label: 'Mid', chip: 'border-app-warn/35 bg-app-warn-soft text-app-warn', value: 'text-app-warn' }
  }
  return { label: 'High', chip: 'border-app-destructive/35 bg-app-danger-soft text-app-destructive', value: 'text-app-destructive' }
}

function uid() {
  return `wl${Date.now()}${Math.random().toString(36).slice(2, 6)}`
}

function loadLists(): WishlistList[] {
  try {
    const raw = localStorage.getItem(LISTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((list) => ({
      ...(list as WishlistList),
      itemIds: Array.isArray((list as WishlistList).itemIds)
        ? [...new Set((list as WishlistList).itemIds.map((id) => migrateWishlistItemId(String(id))))]
        : [],
    }))
  } catch {
    return []
  }
}

function loadStatuses(): Record<string, WishlistStatus> {
  try {
    const raw = localStorage.getItem(STATUS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, WishlistStatus>
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, WishlistStatus> = {}
    for (const [key, value] of Object.entries(parsed)) {
      out[migrateWishlistItemId(String(key))] = value
    }
    return out
  } catch {
    return {}
  }
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="font-mono text-[11px] text-app-tertiary">—</span>
  }
  const barColor = score >= 70 ? 'bg-app-ok' : score >= 40 ? 'bg-app-accent' : 'bg-app-fill-strong'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-11 overflow-hidden rounded bg-app-fill">
        <div className={`h-full rounded ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono text-[11px] text-app-secondary">{score}</span>
    </div>
  )
}

function Tag({ label, className }: { label: string; className: string }) {
  return (
    <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {label}
    </span>
  )
}

function ItemThumb({
  src,
  alt,
  onPreview,
}: {
  src: string
  alt: string
  onPreview: () => void
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onPreview()
      }}
      className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-app-separator bg-app-surface transition-transform hover:scale-105"
      title="Click to enlarge"
      aria-label={`View image of ${alt}`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </button>
  )
}

function ItemCard({
  item,
  status,
  onStatus,
  onRemove,
  onAddTo,
  lists,
  activeListId,
  selected,
  onSelect,
  onPreviewImage,
}: {
  item: WishlistCatalogItem
  status: WishlistStatus
  onStatus: (itemId: string, status: WishlistStatus) => void
  onRemove: (itemId: string) => void
  onAddTo: (itemId: string) => void
  lists: WishlistList[]
  activeListId: string
  selected: boolean
  onSelect: (itemId: string) => void
  onPreviewImage: (item: WishlistCatalogItem) => void
}) {
  const tier = priceTier(item.price)
  const statusMeta = STATUS_META[status]
  const inLists = lists.filter((list) => list.itemIds.includes(item.id) && list.id !== activeListId)

  return (
    <div
      onClick={() => onSelect(item.id)}
      className={`cursor-pointer rounded-lg border px-3.5 py-3 transition-colors ${
        selected
          ? 'border-app-accent bg-app-accent-soft'
          : 'border-app-separator bg-app-surface hover:bg-app-elevated'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(item.id)}
              onClick={(event) => event.stopPropagation()}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-app-accent"
            />
            {item.imageUrl && (
              <ItemThumb src={item.imageUrl} alt={item.part} onPreview={() => onPreviewImage(item)} />
            )}
            <span className="font-mono text-xs font-medium text-app-accent">{item.part}</span>
            <Tag label={statusMeta.label} className={statusMeta.chip} />
            {tier.label !== '—' && <Tag label={tier.label} className={tier.chip} />}
            {item.shipsToday && (
              <Tag label="Ships today" className="border-app-ok/35 bg-app-ok-soft text-app-ok" />
            )}
          </div>
          <div className="mb-1 text-[13px] font-medium text-app-label">{item.vendor}</div>
          <div className="mb-1.5 text-xs text-app-secondary">
            {item.delivery}
            {item.contact !== '—' && <span className="ml-2.5 font-mono">{item.contact}</span>}
          </div>
          {inLists.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {inLists.map((list) => (
                <span
                  key={list.id}
                  className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: `${list.color}18`, color: list.color, borderColor: `${list.color}44` }}
                >
                  {list.emoji} {list.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-mono text-lg font-medium ${tier.value}`}>
            {item.price != null && item.price > 0 ? `$${item.price.toFixed(2)}` : '—'}
          </div>
          <ScoreBar score={item.score} />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5" onClick={(event) => event.stopPropagation()}>
        {(Object.keys(STATUS_META) as WishlistStatus[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onStatus(item.id, key)}
            className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
              status === key ? STATUS_META[key].chip : 'border-app-separator bg-app-fill text-app-secondary'
            }`}
          >
            {STATUS_META[key].label}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => onAddTo(item.id)}
            className="rounded border border-app-accent/40 bg-app-accent-soft px-2 py-0.5 text-[10px] font-medium text-app-accent"
          >
            + Add to list
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="rounded border border-app-separator bg-app-fill px-2 py-0.5 text-[10px] text-app-secondary hover:text-app-label"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}

function SidebarItem({
  list,
  isActive,
  editingId,
  editName,
  onEditNameChange,
  onSelect,
  onStartEdit,
  onRename,
  onCancelEdit,
  onDelete,
}: {
  list: WishlistList
  isActive: boolean
  editingId: string | null
  editName: string
  onEditNameChange: (value: string) => void
  onSelect: () => void
  onStartEdit: () => void
  onRename: () => void
  onCancelEdit: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const editRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingId === list.id) editRef.current?.focus()
  }, [editingId, list.id])

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      className={`mb-0.5 flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
        isActive
          ? 'bg-app-surface'
          : hovered
            ? 'border-app-separator bg-app-surface'
            : 'border-transparent'
      }`}
      style={
        isActive
          ? { backgroundColor: `${list.color}22`, borderColor: `${list.color}66` }
          : undefined
      }
    >
      <span className="text-sm">{list.emoji}</span>
      {editingId === list.id ? (
        <input
          ref={editRef}
          value={editName}
          onChange={(event) => onEditNameChange(event.target.value)}
          onBlur={onRename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onRename()
            if (event.key === 'Escape') onCancelEdit()
          }}
          onClick={(event) => event.stopPropagation()}
          className="flex-1 border-b border-app-separator bg-transparent px-0.5 text-[13px] text-app-label outline-none"
        />
      ) : (
        <span
          className={`flex-1 truncate text-[13px] ${isActive ? 'font-semibold text-app-label' : 'text-app-secondary'}`}
          style={isActive ? { color: list.color } : undefined}
        >
          {list.name}
        </span>
      )}
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
        style={{ backgroundColor: `${list.color}14`, color: list.color }}
      >
        {list.itemIds.length}
      </span>
      {hovered && editingId !== list.id && (
        <div className="flex gap-0.5" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={onStartEdit} className="px-0.5 text-xs text-app-tertiary hover:text-app-secondary">
            ✏️
          </button>
          <button type="button" onClick={onDelete} className="px-0.5 text-xs text-rose-600 hover:text-rose-700">
            🗑
          </button>
        </div>
      )}
    </div>
  )
}

export function WishlistBoard() {
  const [lists, setLists] = useState<WishlistList[]>(loadLists)
  const [statuses, setStatuses] = useState<Record<string, WishlistStatus>>(loadStatuses)
  const [catalogItems, setCatalogItems] = useState<WishlistCatalogItem[]>(loadCachedCatalog)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Price ↑')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('📦')
  const [newColor, setNewColor] = useState(COLORS[0])
  const [addToItem, setAddToItem] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showPartPicker, setShowPartPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerTier, setPickerTier] = useState<'all' | 'best' | 'good' | 'mid' | 'high'>('all')
  const [pickerHideAdded, setPickerHideAdded] = useState(false)
  const [pickerShipsToday, setPickerShipsToday] = useState(false)
  const pickerSearchRef = useRef<HTMLInputElement | null>(null)
  const [showBulkCreateList, setShowBulkCreateList] = useState(false)
  const [bulkListName, setBulkListName] = useState('')
  const [bulkListEmoji, setBulkListEmoji] = useState('📦')
  const [bulkListColor, setBulkListColor] = useState(COLORS[0])
  const [filterStatus, setFilterStatus] = useState<'all' | WishlistStatus>('all')
  const [imagePreview, setImagePreview] = useState<WishlistCatalogItem | null>(null)
  const newRef = useRef<HTMLInputElement | null>(null)
  const bulkListRef = useRef<HTMLInputElement | null>(null)

  const catalogFetchSeq = useRef(0)
  const lastCatalogFetchAt = useRef(0)

  const refreshCatalog = useCallback((opts?: { silent?: boolean; force?: boolean }) => {
    const token = getToken()
    if (!token) {
      setCatalogItems([])
      setCatalogError(null)
      setCatalogLoading(false)
      return
    }
    if (
      !opts?.force &&
      opts?.silent &&
      Date.now() - lastCatalogFetchAt.current < FOCUS_REFRESH_COOLDOWN_MS
    ) {
      return
    }
    const seq = ++catalogFetchSeq.current
    lastCatalogFetchAt.current = Date.now()
    if (!opts?.silent) setCatalogLoading(true)
    setCatalogError(null)
    void fetchWishlistCatalogItems(token)
      .then((items) => {
        if (seq !== catalogFetchSeq.current) return
        setCatalogItems(items)
        saveCachedCatalog(items)
      })
      .catch((error: unknown) => {
        if (seq !== catalogFetchSeq.current) return
        // Keep previously loaded items on a failed background refresh.
        if (!opts?.silent) {
          setCatalogError(error instanceof Error ? error.message : 'Failed to load wishlist items')
        }
      })
      .finally(() => {
        if (seq === catalogFetchSeq.current) setCatalogLoading(false)
      })
  }, [])

  // Initial load + auto-update: re-sync when the tab regains focus and on an interval,
  // so newly researched parts and price changes show up without a reload.
  // When a cached catalog exists, render it immediately and refresh silently
  // (stale-while-revalidate) instead of blocking on a loading screen.
  useEffect(() => {
    refreshCatalog({ silent: loadCachedCatalog().length > 0, force: true })
    const onFocus = () => refreshCatalog({ silent: true })
    window.addEventListener('focus', onFocus)
    const interval = window.setInterval(() => refreshCatalog({ silent: true }), CATALOG_REFRESH_MS)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [refreshCatalog])

  useEffect(() => {
    localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists))
  }, [lists])

  useEffect(() => {
    localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statuses))
  }, [statuses])

  useEffect(() => {
    if (creating) newRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (showBulkCreateList) bulkListRef.current?.focus()
  }, [showBulkCreateList])

  useEffect(() => {
    if (!imagePreview) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setImagePreview(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [imagePreview])

  useEffect(() => {
    if (!showPartPicker) return
    setPickerSearch('')
    setPickerTier('all')
    setPickerHideAdded(false)
    setPickerShipsToday(false)
    pickerSearchRef.current?.focus()
  }, [showPartPicker])

  const activeList = lists.find((list) => list.id === activeId)
  const activeItemIds =
    activeId === 'all' ? catalogItems.map((item) => item.id) : activeList?.itemIds ?? []

  const visibleItems = useMemo(() => {
    return catalogItems
      .filter((item) => activeItemIds.includes(item.id))
      .filter((item) => {
        const query = search.trim().toLowerCase()
        if (query && !item.part.toLowerCase().includes(query) && !item.vendor.toLowerCase().includes(query) && !item.companyBrand.toLowerCase().includes(query)) {
          return false
        }
        if (filterStatus !== 'all' && statuses[item.id] !== filterStatus) return false
        return true
      })
      .sort((a, b) => {
        const priceA = a.price ?? Number.POSITIVE_INFINITY
        const priceB = b.price ?? Number.POSITIVE_INFINITY
        const scoreA = a.score ?? -1
        const scoreB = b.score ?? -1
        if (sort === 'Price ↑') return priceA - priceB
        if (sort === 'Price ↓') return priceB - priceA
        if (sort === 'Score ↓') return scoreB - scoreA
        if (sort === 'Score ↑') return scoreA - scoreB
        if (sort === 'Part A–Z') return a.part.localeCompare(b.part)
        if (sort === 'Company & brand A–Z') return a.companyBrand.localeCompare(b.companyBrand)
        return a.vendor.localeCompare(b.vendor)
      })
  }, [activeItemIds, catalogItems, search, sort, filterStatus, statuses])

  const pickerItems = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase()
    return catalogItems.filter((item) => {
      if (
        query &&
        !item.part.toLowerCase().includes(query) &&
        !item.vendor.toLowerCase().includes(query) &&
        !item.companyBrand.toLowerCase().includes(query)
      ) {
        return false
      }
      if (pickerTier !== 'all' && priceTier(item.price).label.toLowerCase() !== pickerTier) return false
      if (pickerShipsToday && !item.shipsToday) return false
      if (pickerHideAdded && activeList?.itemIds.includes(item.id)) return false
      return true
    })
  }, [catalogItems, pickerSearch, pickerTier, pickerShipsToday, pickerHideAdded, activeList])

  const pricedItems = visibleItems.filter((item) => item.price != null && item.price > 0)
  const bestPrice = pricedItems.length ? Math.min(...pricedItems.map((item) => item.price!)) : null
  const totalValue = pricedItems.reduce((sum, item) => sum + (item.price ?? 0), 0)

  function createList() {
    if (!newName.trim()) return
    const list: WishlistList = {
      id: uid(),
      name: newName.trim(),
      emoji: newEmoji,
      color: newColor,
      itemIds: [],
    }
    setLists((prev) => [...prev, list])
    setActiveId(list.id)
    setCreating(false)
    setNewName('')
    setNewEmoji('📦')
    setNewColor(COLORS[0])
  }

  function createListFromSelected() {
    if (!bulkListName.trim() || selected.size === 0) return
    const list: WishlistList = {
      id: uid(),
      name: bulkListName.trim(),
      emoji: bulkListEmoji,
      color: bulkListColor,
      itemIds: [...selected],
    }
    setLists((prev) => [...prev, list])
    setActiveId(list.id)
    setSelected(new Set())
    setShowBulkCreateList(false)
    setBulkListName('')
    setBulkListEmoji('📦')
    setBulkListColor(COLORS[0])
  }

  function renameList(id: string) {
    if (!editName.trim()) {
      setEditingId(null)
      return
    }
    setLists((prev) => prev.map((list) => (list.id === id ? { ...list, name: editName.trim() } : list)))
    setEditingId(null)
  }

  function deleteList(id: string) {
    setLists((prev) => prev.filter((list) => list.id !== id))
    if (activeId === id) setActiveId('all')
  }

  function removeFromList(itemId: string) {
    if (activeId === 'all') return
    setLists((prev) =>
      prev.map((list) =>
        list.id === activeId ? { ...list, itemIds: list.itemIds.filter((id) => id !== itemId) } : list
      )
    )
  }

  function addToList(listId: string, itemId: string) {
    setLists((prev) =>
      prev.map((list) =>
        list.id === listId && !list.itemIds.includes(itemId)
          ? { ...list, itemIds: [...list.itemIds, itemId] }
          : list
      )
    )
  }

  function setStatus(itemId: string, status: WishlistStatus) {
    setStatuses((prev) => ({ ...prev, [itemId]: status }))
  }

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === visibleItems.length ? new Set() : new Set(visibleItems.map((item) => item.id))
    )
  }

  function bulkStatus(status: WishlistStatus) {
    selected.forEach((id) => setStatus(id, status))
  }

  function bulkRemove() {
    if (activeId === 'all') return
    setLists((prev) =>
      prev.map((list) =>
        list.id === activeId ? { ...list, itemIds: list.itemIds.filter((id) => !selected.has(id)) } : list
      )
    )
    setSelected(new Set())
  }

  const addToPart = addToItem != null ? catalogItems.find((item) => item.id === addToItem) : null

  return (
    <div className="grid h-full min-h-0 grid-cols-1 text-app-label lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col gap-0.5 overflow-hidden border-r border-app-separator bg-app-fill/90 p-3">
        <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-app-secondary">My Wishlists</div>

        <button
          type="button"
          onClick={() => {
            setActiveId('all')
            setSelected(new Set())
          }}
          className={`mb-1.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
            activeId === 'all' ? 'bg-app-surface text-app-label shadow-sm ring-1 ring-app-separator' : 'text-app-secondary hover:bg-app-surface'
          }`}
        >
          <span className="text-sm">🗂</span>
          <span className={`flex-1 text-[13px] ${activeId === 'all' ? 'font-semibold' : ''}`}>All items</span>
          <span className="rounded-full bg-app-fill px-1.5 py-0.5 text-[11px] text-app-secondary">{catalogItems.length}</span>
        </button>

        <div className="mb-2 h-px bg-app-fill-strong" />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {lists.map((list) => (
            <SidebarItem
              key={list.id}
              list={list}
              isActive={activeId === list.id}
              editingId={editingId}
              editName={editName}
              onEditNameChange={setEditName}
              onSelect={() => {
                setActiveId(list.id)
                setSelected(new Set())
              }}
              onStartEdit={() => {
                setEditingId(list.id)
                setEditName(list.name)
              }}
              onRename={() => renameList(list.id)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => deleteList(list.id)}
            />
          ))}
        </div>

        <div className="mt-2 border-t border-app-separator pt-2.5">
          {creating ? (
            <div className="flex flex-col gap-1.5">
              <input
                ref={newRef}
                placeholder="List name…"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createList()
                  if (event.key === 'Escape') setCreating(false)
                }}
                className="rounded border border-app-separator bg-app-surface px-2 py-1.5 text-xs text-app-label outline-none ring-violet-400/40 focus:ring-2"
              />
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewEmoji(emoji)}
                    className="rounded border px-0.5 text-sm"
                    style={{ borderColor: newEmoji === emoji ? 'var(--app-separator)' : 'transparent' }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className="h-4 w-4 rounded-full border-2"
                    style={{ backgroundColor: color, borderColor: newColor === color ? 'var(--app-label)' : 'transparent' }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={createList}
                  className="flex-1 rounded px-0 py-1.5 text-xs font-medium text-white"
                  style={{ backgroundColor: newColor }}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded border border-app-separator bg-app-surface px-2.5 py-1.5 text-xs text-app-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full rounded-md border border-dashed border-app-separator bg-app-surface px-2.5 py-1.5 text-left text-xs text-app-secondary hover:border-app-tertiary hover:text-app-label"
            >
              + New wishlist
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col bg-app-fill/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-separator bg-app-surface px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {activeList && <span className="text-xl">{activeList.emoji}</span>}
            <div>
              <div className="text-base font-medium">{activeId === 'all' ? 'All items' : activeList?.name}</div>
              <div className="text-xs text-app-secondary">
                {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'} · PartSource.ai
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {activeId !== 'all' && (
              <button
                type="button"
                onClick={() => setShowPartPicker(true)}
                className="rounded border border-app-accent bg-app-accent-soft px-2.5 py-1 text-xs font-medium text-app-accent"
              >
                + Add parts
              </button>
            )}
            <button
              type="button"
              className="rounded border border-app-separator bg-app-fill px-2.5 py-1 text-xs text-app-secondary"
            >
              Export ↗
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-b border-app-separator bg-app-separator md:grid-cols-4">
          {[
            { label: 'Items', value: String(visibleItems.length), className: 'text-app-label' },
            {
              label: 'Best price',
              value: bestPrice != null ? `$${bestPrice.toFixed(2)}` : '—',
              className: 'text-app-ok',
            },
            { label: 'Est. total', value: `$${totalValue.toFixed(2)}`, className: 'text-app-label' },
            {
              label: 'Ships today',
              value: String(visibleItems.filter((item) => item.shipsToday).length),
              className: 'text-app-ok',
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-app-surface px-3.5 py-2">
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-app-tertiary">{stat.label}</div>
              <div className={`font-mono text-lg font-medium ${stat.className}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-app-separator bg-app-surface px-4 py-2">
          <input
            placeholder="Search part or vendor…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-44 rounded border border-app-separator bg-app-fill px-2.5 py-1 text-xs text-app-label placeholder:text-app-tertiary"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as (typeof SORTS)[number])}
            className="rounded border border-app-separator bg-app-fill px-2 py-1 text-xs text-app-label"
          >
            {SORTS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {(['all', 'priority', 'watching', 'interested', 'ordered'] as const).map((key) => {
              const active = filterStatus === key
              const chip =
                key === 'all'
                  ? 'border-app-separator bg-app-fill text-app-label'
                  : STATUS_META[key].chip
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterStatus(key)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                    active ? chip : 'border-app-separator bg-app-fill text-app-secondary'
                  }`}
                >
                  {key === 'all' ? 'All status' : STATUS_META[key].label}
                </button>
              )
            })}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-app-accent bg-app-accent-soft px-4 py-2">
            <span className="text-xs font-medium text-app-accent">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setShowBulkCreateList(true)}
              className="rounded border border-app-accent bg-app-surface px-2.5 py-0.5 text-[11px] font-medium text-app-accent shadow-sm"
            >
              + Create list
            </button>
            <span className="text-xs text-app-accent">· Set status:</span>
            {(Object.keys(STATUS_META) as WishlistStatus[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => bulkStatus(key)}
                className={`rounded border px-2 py-0.5 text-[11px] font-medium ${STATUS_META[key].chip}`}
              >
                {STATUS_META[key].label}
              </button>
            ))}
            {activeId !== 'all' && (
              <button
                type="button"
                onClick={bulkRemove}
                className="rounded border border-app-destructive/35 bg-app-danger-soft px-2 py-0.5 text-[11px] font-medium text-app-destructive"
              >
                Remove from list
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-app-accent underline"
            >
              Clear
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.size === visibleItems.length && visibleItems.length > 0}
              onChange={toggleAll}
              className="h-3.5 w-3.5 accent-app-accent"
            />
            <span className="text-xs text-app-secondary">
              Select all · {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}
            </span>
          </div>

          {catalogLoading ? (
            <div className="py-12 text-center text-app-secondary">
              <div className="text-sm font-medium">Loading vendor offers from research…</div>
            </div>
          ) : catalogError ? (
            <div className="py-12 text-center text-rose-600">
              <div className="text-sm font-medium">{catalogError}</div>
            </div>
          ) : catalogItems.length === 0 ? (
            <div className="py-12 text-center text-app-secondary">
              <div className="mb-2 text-3xl">📭</div>
              <div className="text-sm font-medium">No vendor offers yet</div>
              <p className="mt-2 text-xs text-app-tertiary">Run research on datasheet rows to populate this wishlist.</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 text-center text-app-secondary">
              <div className="mb-2 text-3xl">📭</div>
              <div className="text-sm font-medium">{activeId === 'all' ? 'No items match your filters' : 'This list is empty'}</div>
              {activeId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setShowPartPicker(true)}
                  className="mt-3 rounded-md bg-app-accent px-4 py-1.5 text-sm font-medium text-white"
                >
                  + Add parts to this list
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  status={statuses[item.id] ?? 'watching'}
                  onStatus={setStatus}
                  onRemove={removeFromList}
                  onAddTo={(itemId) => {
                    setAddToItem(itemId)
                    setShowAddModal(true)
                  }}
                  lists={lists}
                  activeListId={activeId}
                  selected={selected.has(item.id)}
                  onSelect={toggleSelection}
                  onPreviewImage={setImagePreview}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showBulkCreateList && selected.size > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowBulkCreateList(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-app-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 text-[15px] font-medium">Create wishlist from selection</div>
            <div className="mb-3 text-xs text-app-secondary">
              {selected.size} item{selected.size === 1 ? '' : 's'} will be added to the new list.
            </div>
            <input
              ref={bulkListRef}
              placeholder="List name…"
              value={bulkListName}
              onChange={(event) => setBulkListName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') createListFromSelected()
                if (event.key === 'Escape') setShowBulkCreateList(false)
              }}
              className="mb-3 w-full rounded border border-app-separator bg-app-surface px-3 py-2 text-sm text-app-label outline-none ring-violet-400/40 focus:ring-2"
            />
            <div className="mb-3 flex flex-wrap gap-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setBulkListEmoji(emoji)}
                  className="rounded border px-0.5 text-sm"
                  style={{ borderColor: bulkListEmoji === emoji ? 'var(--app-separator)' : 'transparent' }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-1">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBulkListColor(color)}
                  className="h-4 w-4 rounded-full border-2"
                  style={{ backgroundColor: color, borderColor: bulkListColor === color ? 'var(--app-label)' : 'transparent' }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={createListFromSelected}
                disabled={!bulkListName.trim()}
                className="flex-1 rounded-md px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: bulkListColor }}
              >
                Create list
              </button>
              <button
                type="button"
                onClick={() => setShowBulkCreateList(false)}
                className="rounded-md border border-app-separator bg-app-surface px-3 py-2 text-sm text-app-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && addToPart && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-app-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 text-[15px] font-medium">Add to a wishlist</div>
            <div className="mb-3 font-mono text-xs text-app-secondary">
              {addToPart.part} · {addToPart.vendor}
            </div>
            <div className="flex flex-col gap-1.5">
              {lists.map((list) => {
                const already = list.itemIds.includes(addToPart.id)
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => {
                      if (!already) addToList(list.id, addToPart.id)
                    }}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left ${
                      already ? 'bg-app-fill' : 'bg-app-fill/60 hover:bg-app-fill'
                    }`}
                    style={{
                      borderColor: already ? list.color : undefined,
                    }}
                  >
                    <span className="text-base">{list.emoji}</span>
                    <span className="flex-1 text-[13px] font-medium">{list.name}</span>
                    <span className={`text-[11px] ${already ? 'font-medium' : 'text-app-secondary'}`} style={already ? { color: list.color } : undefined}>
                      {already ? '✓ Added' : `${list.itemIds.length} items`}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="mt-3 w-full rounded-md border border-app-separator bg-app-fill px-3 py-2 text-sm text-app-secondary"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {showPartPicker && activeId !== 'all' && activeList && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowPartPicker(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-app-surface p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 text-[15px] font-medium">Add parts to "{activeList.name}"</div>

            <div className="mb-2 flex items-center gap-1.5 rounded-md border border-app-separator bg-app-fill px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-app-tertiary" strokeWidth={2} />
              <input
                ref={pickerSearchRef}
                placeholder="Search part, vendor, or brand…"
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setShowPartPicker(false)
                }}
                className="min-w-0 flex-1 bg-transparent text-xs text-app-label outline-none placeholder:text-app-tertiary"
              />
              {pickerSearch && (
                <button
                  type="button"
                  onClick={() => setPickerSearch('')}
                  className="shrink-0 text-xs text-app-tertiary hover:text-app-secondary"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="mb-2.5 flex flex-wrap items-center gap-1">
              {(['all', 'best', 'good', 'mid', 'high'] as const).map((tier) => {
                const active = pickerTier === tier
                const chip =
                  tier === 'all'
                    ? 'border-app-separator bg-app-fill text-app-label'
                    : tier === 'best'
                      ? 'border-app-ok/35 bg-app-ok-soft text-app-ok'
                      : tier === 'good'
                        ? 'border-app-accent/35 bg-app-accent-soft text-app-accent'
                        : tier === 'mid'
                          ? 'border-app-warn/35 bg-app-warn-soft text-app-warn'
                          : 'border-app-destructive/35 bg-app-danger-soft text-app-destructive'
                const label =
                  tier === 'all' ? 'All prices' : tier === 'best' ? 'Best' : tier === 'good' ? 'Good' : tier === 'mid' ? 'Mid' : 'High'
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setPickerTier(tier)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      active ? chip : 'border-app-separator bg-app-fill text-app-secondary'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                onClick={() => setPickerShipsToday((prev) => !prev)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  pickerShipsToday
                    ? 'border-app-ok/35 bg-app-ok-soft text-app-ok'
                    : 'border-app-separator bg-app-fill text-app-secondary'
                }`}
              >
                Ships today
              </button>
              <button
                type="button"
                onClick={() => setPickerHideAdded((prev) => !prev)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  pickerHideAdded
                    ? 'border-app-accent/35 bg-app-accent-soft text-app-accent'
                    : 'border-app-separator bg-app-fill text-app-secondary'
                }`}
              >
                Hide added
              </button>
              <span className="ml-auto text-[10px] text-app-tertiary">
                {pickerItems.length} of {catalogItems.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {pickerItems.length === 0 && (
                <div className="py-8 text-center text-xs text-app-secondary">
                  No parts match your search or filters.
                </div>
              )}
              {pickerItems.map((item) => {
                const inList = activeList.itemIds.includes(item.id)
                const tier = priceTier(item.price)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!inList) addToList(activeId, item.id)
                    }}
                    className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left ${
                      inList
                        ? 'border-app-separator bg-app-fill opacity-60'
                        : 'border-app-separator bg-app-surface hover:bg-app-fill'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-medium text-app-accent">{item.part}</div>
                      <div className="text-xs text-app-secondary">{item.vendor}</div>
                    </div>
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${tier.chip}`}>
                      {tier.label}
                    </span>
                    <span className={`font-mono text-[13px] font-medium ${tier.value}`}>
                      {item.price != null && item.price > 0 ? `$${item.price.toFixed(2)}` : '—'}
                    </span>
                    <span className={`text-xs ${inList ? 'text-app-ok' : 'text-app-tertiary'}`}>
                      {inList ? '✓' : '+'}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowPartPicker(false)}
              className="mt-3 w-full rounded-md bg-app-accent px-3 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {imagePreview?.imageUrl && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setImagePreview(null)}
          role="dialog"
          aria-label={`Image of ${imagePreview.part}`}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-app-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-app-separator px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-medium text-app-accent">{imagePreview.part}</div>
                <div className="truncate text-xs text-app-secondary">{imagePreview.vendor}</div>
              </div>
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="ml-3 shrink-0 rounded-md border border-app-separator bg-app-fill px-2.5 py-1 text-sm text-app-secondary hover:text-app-label"
                aria-label="Close image preview"
              >
                ×
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-app-fill p-4">
              <img
                src={imagePreview.imageUrl}
                alt={imagePreview.part}
                referrerPolicy="no-referrer"
                className="max-h-[65vh] max-w-full rounded-md object-contain"
              />
            </div>
            {imagePreview.url && (
              <div className="border-t border-app-separator px-4 py-2 text-right">
                <a
                  href={imagePreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-app-accent underline"
                >
                  View vendor page ↗
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
