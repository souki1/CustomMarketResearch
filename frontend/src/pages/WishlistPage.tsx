import { Heart } from 'lucide-react'

export function WishlistPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
          <Heart className="h-6 w-6" strokeWidth={2} aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Wishlist</h1>
          <p className="text-sm text-gray-500">Items you want to revisit or compare later.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-12 text-center">
        <p className="text-sm text-gray-600">Your wishlist is empty. Save items from research or portfolio to see them here.</p>
      </div>
    </div>
  )
}
