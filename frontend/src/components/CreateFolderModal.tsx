type CreateFolderModalProps = {
  open: boolean
  name: string
  onNameChange: (value: string) => void
  onCreate: () => void
  onCancel: () => void
}

export function CreateFolderModal({ open, name, onNameChange, onCreate, onCancel }: CreateFolderModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-folder-title"
    >
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 id="create-folder-title" className="text-lg font-semibold text-gray-900">
          New folder
        </h3>
        <p className="mt-1 text-sm text-gray-500">Give your folder a name.</p>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCreate()}
          placeholder="Folder name"
          className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          autoFocus
        />
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={!name.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
