import { useEffect, useMemo, useRef, useState } from 'react'
import { getToken } from '@/lib/auth'
import { fetchWishlistCatalogItems, type WishlistCatalogItem } from '@/lib/wishlistCatalog'

type WishlistStatus = 'priority' | 'watching' | 'interested' | 'ordered'

type WishlistList = {
  id: string
  name: string
  emoji: string
  color: string
  itemIds: string[]
}

const STATUS_META: Record<
  WishlistStatus,
  { label: string; bg: string; col: string; dot: string }
> = {
  priority: { label: 'Priority', bg: '#FAECE7', col: '#712B13', dot: '#D85A30' },
  watching: { label: 'Watching', bg: '#E6F1FB', col: '#0C447C', dot: '#378ADD' },
  interested: { label: 'Interested', bg: '#FAEEDA', col: '#633806', dot: '#EF9F27' },
  ordered: { label: 'Ordered', bg: '#EAF3DE', col: '#27500A', dot: '#1D9E75' },
}

const COLORS = ['#378ADD', '#1D9E75', '#D85A30', '#EF9F27', '#7C5CBF', '#E05C94', '#26A69A', '#FF7043']
const EMOJIS = ['📦', '👀', '⚡', '⭐', '🔧', '🏷️', '📋', '🎯', '🛒', '💡', '📌', '🔑']
const SORTS = ['Price ↑', 'Price ↓', 'Score ↓', 'Score ↑', 'Part A–Z', 'Company & brand A–Z', 'Vendor A–Z'] as const

const LISTS_STORAGE_KEY = 'ir-wishlist-board-lists'
const STATUS_STORAGE_KEY = 'ir-wishlist-board-statuses'

function priceTier(price: number | null) {
  if (price == null) return { label: '—', col: '#64748b', bg: '#f8fafc', dot: '#cbd5e1' }
  if (price < 25) return { label: 'Best', col: '#27500A', bg: '#EAF3DE', dot: '#1D9E75' }
  if (price < 45) return { label: 'Good', col: '#0C447C', bg: '#E6F1FB', dot: '#378ADD' }
  if (price < 65) return { label: 'Mid', col: '#633806', bg: '#FAEEDA', dot: '#EF9F27' }
  return { label: 'High', col: '#712B13', bg: '#FAECE7', dot: '#D85A30' }
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
        ? (list as WishlistList).itemIds.map((id) => String(id))
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
      out[String(key)] = value
    }
    return out
  } catch {
    return {}
  }
}

function ScoreBar({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="font-mono text-[11px] text-slate-400">—</span>
  }
  const barColor = score >= 70 ? '#1D9E75' : score >= 40 ? '#378ADD' : '#c8c6be'
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-11 overflow-hidden rounded bg-slate-100">
        <div className="h-full rounded" style={{ width: `${score}%`, backgroundColor: barColor }} />
      </div>
      <span className="font-mono text-[11px] text-slate-500">{score}</span>
    </div>
  )
}

function Tag({ label, bg, col }: { label: string; bg: string; col: string }) {
  return (
    <span className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: bg, color: col }}>
      {label}
    </span>
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
}) {
  const tier = priceTier(item.price)
  const statusMeta = STATUS_META[status]
  const inLists = lists.filter((list) => list.itemIds.includes(item.id) && list.id !== activeListId)

  return (
    <div
      onClick={() => onSelect(item.id)}
      className="cursor-pointer rounded-lg border px-3.5 py-3 transition-colors"
      style={{
        backgroundColor: selected ? '#EBF4FF' : '#ffffff',
        borderColor: selected ? '#378ADD' : '#e0ddd4',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(item.id)}
              onClick={(event) => event.stopPropagation()}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[#378ADD]"
            />
            <span className="font-mono text-xs font-medium text-[#0C447C]">{item.part}</span>
            <Tag label={statusMeta.label} bg={statusMeta.bg} col={statusMeta.col} />
            <Tag label={tier.label} bg={tier.bg} col={tier.col} />
            {item.shipsToday && <Tag label="⚡ Ships today" bg="#EAF3DE" col="#27500A" />}
          </div>
          <div className="mb-1 text-[13px] font-medium text-[#1a1a18]">{item.vendor}</div>
          <div className="mb-1.5 text-xs text-[#73726c]">
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
          <div className="font-mono text-lg font-medium" style={{ color: tier.col }}>
            {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
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
            className="rounded px-2 py-0.5 text-[10px] font-medium"
            style={{
              border: `0.5px solid ${status === key ? STATUS_META[key].dot : '#c8c6be'}`,
              backgroundColor: status === key ? STATUS_META[key].bg : '#f7f5f0',
              color: status === key ? STATUS_META[key].col : '#73726c',
            }}
          >
            {STATUS_META[key].label}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => onAddTo(item.id)}
            className="rounded border border-[#378ADD] bg-[#E6F1FB] px-2 py-0.5 text-[10px] font-medium text-[#0C447C]"
          >
            + Add to list
          </button>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="rounded border border-[#c8c6be] bg-[#f7f5f0] px-2 py-0.5 text-[10px] text-[#73726c]"
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
      className="mb-0.5 flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors"
      style={{
        backgroundColor: isActive ? `${list.color}18` : hovered ? '#ffffff' : 'transparent',
        border: `1px solid ${isActive ? `${list.color}55` : hovered ? '#e2e8f0' : 'transparent'}`,
      }}
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
          className="flex-1 border-b border-slate-300 bg-transparent px-0.5 text-[13px] text-slate-800 outline-none"
        />
      ) : (
        <span
          className="flex-1 truncate text-[13px]"
          style={{ color: isActive ? list.color : '#475569', fontWeight: isActive ? 600 : 400 }}
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
          <button type="button" onClick={onStartEdit} className="px-0.5 text-xs text-slate-400 hover:text-slate-700">
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
  const [catalogItems, setCatalogItems] = useState<WishlistCatalogItem[]>([])
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
  const [showBulkCreateList, setShowBulkCreateList] = useState(false)
  const [bulkListName, setBulkListName] = useState('')
  const [bulkListEmoji, setBulkListEmoji] = useState('📦')
  const [bulkListColor, setBulkListColor] = useState(COLORS[0])
  const [filterStatus, setFilterStatus] = useState<'all' | WishlistStatus>('all')
  const newRef = useRef<HTMLInputElement | null>(null)
  const bulkListRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setCatalogItems([])
      setCatalogError(null)
      setCatalogLoading(false)
      return
    }
    let cancelled = false
    setCatalogLoading(true)
    setCatalogError(null)
    void fetchWishlistCatalogItems(token)
      .then((items) => {
        if (cancelled) return
        setCatalogItems(items)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCatalogItems([])
        setCatalogError(error instanceof Error ? error.message : 'Failed to load wishlist items')
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (catalogItems.length === 0) return
    const valid = new Set(catalogItems.map((item) => item.id))
    setLists((prev) => {
      let changed = false
      const next = prev.map((list) => {
        const itemIds = list.itemIds.filter((id) => valid.has(id))
        if (itemIds.length !== list.itemIds.length) changed = true
        return itemIds.length === list.itemIds.length ? list : { ...list, itemIds }
      })
      return changed ? next : prev
    })
  }, [catalogItems])

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

  const pricedItems = visibleItems.filter((item) => item.price != null)
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
    <div className="grid min-h-[560px] grid-cols-1 text-slate-900 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-0.5 border-r border-slate-200 bg-slate-50/90 p-3">
        <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">My Wishlists</div>

        <button
          type="button"
          onClick={() => {
            setActiveId('all')
            setSelected(new Set())
          }}
          className={`mb-1.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
            activeId === 'all' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white'
          }`}
        >
          <span className="text-sm">🗂</span>
          <span className={`flex-1 text-[13px] ${activeId === 'all' ? 'font-semibold' : ''}`}>All items</span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{catalogItems.length}</span>
        </button>

        <div className="mb-2 h-px bg-slate-200" />

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

        <div className="mt-2 border-t border-slate-200 pt-2.5">
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
                className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none ring-violet-400/40 focus:ring-2"
              />
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewEmoji(emoji)}
                    className="rounded border px-0.5 text-sm"
                    style={{ borderColor: newEmoji === emoji ? '#9c9a92' : 'transparent' }}
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
                    style={{ backgroundColor: color, borderColor: newColor === color ? '#fff' : 'transparent' }}
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
                  className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full rounded-md border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-left text-xs text-slate-600 hover:border-slate-400 hover:text-slate-800"
            >
              + New wishlist
            </button>
          )}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col bg-slate-50/40">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e0ddd4] bg-white px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            {activeList && <span className="text-xl">{activeList.emoji}</span>}
            <div>
              <div className="text-base font-medium">{activeId === 'all' ? 'All items' : activeList?.name}</div>
              <div className="text-xs text-[#73726c]">
                {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'} · PartSource.ai
              </div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {activeId !== 'all' && (
              <button
                type="button"
                onClick={() => setShowPartPicker(true)}
                className="rounded border border-[#378ADD] bg-[#E6F1FB] px-2.5 py-1 text-xs font-medium text-[#0C447C]"
              >
                + Add parts
              </button>
            )}
            <button
              type="button"
              className="rounded border border-[#c8c6be] bg-[#f7f5f0] px-2.5 py-1 text-xs text-[#73726c]"
            >
              Export ↗
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px border-b border-[#e0ddd4] bg-[#e0ddd4] md:grid-cols-4">
          {[
            ['Items', String(visibleItems.length), '#1a1a18'],
            ['Best price', bestPrice != null ? `$${bestPrice.toFixed(2)}` : '—', '#1D9E75'],
            ['Est. total', `$${totalValue.toFixed(2)}`, '#1a1a18'],
            ['Ships today', String(visibleItems.filter((item) => item.shipsToday).length), '#1D9E75'],
          ].map(([label, value, color]) => (
            <div key={label} className="bg-white px-3.5 py-2">
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[#a3a19a]">{label}</div>
              <div className="font-mono text-lg font-medium" style={{ color }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#e0ddd4] bg-white px-4 py-2">
          <input
            placeholder="Search part or vendor…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-44 rounded border border-[#e0ddd4] bg-[#f7f5f0] px-2.5 py-1 text-xs"
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as (typeof SORTS)[number])}
            className="rounded border border-[#e0ddd4] bg-[#f7f5f0] px-2 py-1 text-xs"
          >
            {SORTS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1">
            {(['all', 'priority', 'watching', 'interested', 'ordered'] as const).map((key) => {
              const active = filterStatus === key
              const meta =
                key === 'all'
                  ? { label: 'All status', bg: '#f7f5f0', col: '#1a1a18', dot: '#c8c6be' }
                  : STATUS_META[key]
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilterStatus(key)}
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    border: `0.5px solid ${active ? meta.dot : '#c8c6be'}`,
                    backgroundColor: active ? meta.bg : '#f7f5f0',
                    color: active ? meta.col : '#73726c',
                  }}
                >
                  {key === 'all' ? 'All status' : meta.label}
                </button>
              )
            })}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[#378ADD] bg-[#E6F1FB] px-4 py-2">
            <span className="text-xs font-medium text-[#0C447C]">{selected.size} selected</span>
            <button
              type="button"
              onClick={() => setShowBulkCreateList(true)}
              className="rounded border border-[#378ADD] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#0C447C] shadow-sm"
            >
              + Create list
            </button>
            <span className="text-xs text-[#0C447C]">· Set status:</span>
            {(Object.keys(STATUS_META) as WishlistStatus[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => bulkStatus(key)}
                className="rounded px-2 py-0.5 text-[11px] font-medium"
                style={{
                  border: `0.5px solid ${STATUS_META[key].dot}`,
                  backgroundColor: STATUS_META[key].bg,
                  color: STATUS_META[key].col,
                }}
              >
                {STATUS_META[key].label}
              </button>
            ))}
            {activeId !== 'all' && (
              <button
                type="button"
                onClick={bulkRemove}
                className="rounded border border-[#c8c6be] bg-[#FAECE7] px-2 py-0.5 text-[11px] font-medium text-[#712B13]"
              >
                Remove from list
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto text-xs text-[#0C447C] underline"
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
              className="h-3.5 w-3.5 accent-[#378ADD]"
            />
            <span className="text-xs text-[#73726c]">
              Select all · {visibleItems.length} item{visibleItems.length === 1 ? '' : 's'}
            </span>
          </div>

          {catalogLoading ? (
            <div className="py-12 text-center text-slate-500">
              <div className="text-sm font-medium">Loading vendor offers from research…</div>
            </div>
          ) : catalogError ? (
            <div className="py-12 text-center text-rose-600">
              <div className="text-sm font-medium">{catalogError}</div>
            </div>
          ) : catalogItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <div className="mb-2 text-3xl">📭</div>
              <div className="text-sm font-medium">No vendor offers yet</div>
              <p className="mt-2 text-xs text-slate-400">Run research on datasheet rows to populate this wishlist.</p>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 text-center text-[#73726c]">
              <div className="mb-2 text-3xl">📭</div>
              <div className="text-sm font-medium">{activeId === 'all' ? 'No items match your filters' : 'This list is empty'}</div>
              {activeId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setShowPartPicker(true)}
                  className="mt-3 rounded-md bg-[#378ADD] px-4 py-1.5 text-sm font-medium text-white"
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
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 text-[15px] font-medium">Create wishlist from selection</div>
            <div className="mb-3 text-xs text-slate-500">
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
              className="mb-3 w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-violet-400/40 focus:ring-2"
            />
            <div className="mb-3 flex flex-wrap gap-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setBulkListEmoji(emoji)}
                  className="rounded border px-0.5 text-sm"
                  style={{ borderColor: bulkListEmoji === emoji ? '#94a3b8' : 'transparent' }}
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
                  style={{ backgroundColor: color, borderColor: bulkListColor === color ? '#0f172a' : 'transparent' }}
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
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
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
            className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 text-[15px] font-medium">Add to a wishlist</div>
            <div className="mb-3 font-mono text-xs text-[#73726c]">
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
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-left"
                    style={{
                      backgroundColor: already ? `${list.color}10` : '#f7f5f0',
                      border: `0.5px solid ${already ? list.color : '#e0ddd4'}`,
                    }}
                  >
                    <span className="text-base">{list.emoji}</span>
                    <span className="flex-1 text-[13px] font-medium">{list.name}</span>
                    <span className="text-[11px]" style={{ color: already ? list.color : '#73726c' }}>
                      {already ? '✓ Added' : `${list.itemIds.length} items`}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="mt-3 w-full rounded-md border border-[#c8c6be] bg-[#f7f5f0] px-3 py-2 text-sm text-[#73726c]"
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
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 text-[15px] font-medium">Add parts to "{activeList.name}"</div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {catalogItems.map((item) => {
                const inList = activeList.itemIds.includes(item.id)
                const tier = priceTier(item.price)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (!inList) addToList(activeId, item.id)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left"
                    style={{
                      backgroundColor: inList ? '#f7f5f0' : '#ffffff',
                      border: '0.5px solid #e0ddd4',
                      opacity: inList ? 0.6 : 1,
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs font-medium text-[#0C447C]">{item.part}</div>
                      <div className="text-xs text-[#73726c]">{item.vendor}</div>
                    </div>
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: tier.bg, color: tier.col }}>
                      {tier.label}
                    </span>
                    <span className="font-mono text-[13px] font-medium" style={{ color: tier.col }}>
                      {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
                    </span>
                    <span className="text-xs" style={{ color: inList ? '#1D9E75' : '#c8c6be' }}>
                      {inList ? '✓' : '+'}
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowPartPicker(false)}
              className="mt-3 w-full rounded-md bg-[#378ADD] px-3 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
