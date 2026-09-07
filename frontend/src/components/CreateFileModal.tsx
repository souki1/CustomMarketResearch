type CreateFileModalProps = {
  open: boolean
  name: string
  onNameChange: (value: string) => void
  onCreate: () => void
  onCancel: () => void
}

export function CreateFileModal({ open, name, onNameChange, onCreate, onCancel }: CreateFileModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-file-title"
    >
      <div className="w-full max-w-md rounded-xl border border-app-separator bg-app-surface p-6 shadow-sm">
        <h3 id="create-file-title" className="text-lg font-semibold text-app-label">
          New file
        </h3>
        <p className="mt-1 text-sm text-app-secondary">Give your file a name.</p>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          placeholder="File name"
          className="mt-4 w-full rounded-lg border border-app-separator px-4 py-2.5 text-sm text-app-label placeholder:text-app-tertiary focus:border-app-accent focus:outline-none focus:ring-2 focus:ring-app-accent/20"
          autoFocus
        />
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-app-separator bg-app-surface px-4 py-2 text-sm font-medium text-app-secondary hover:bg-app-fill focus:outline-none focus:ring-2 focus:ring-app-accent/20"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={!name.trim()}
            className="rounded-lg bg-app-accent px-4 py-2 text-sm font-medium text-white hover:bg-app-accent-hover focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-app-bg disabled:opacity-50 disabled:pointer-events-none"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
