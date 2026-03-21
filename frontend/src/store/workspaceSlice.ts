import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { listWorkspaceItems, getWorkspaceFileContent } from '@/lib/api'
import type { WorkspaceItem } from '@/lib/api'

type WorkspaceState = {
  currentParentId: number | null
  selectedItemId: number | null
  items: WorkspaceItem[]
  fileContent: string | null
  loadingItems: boolean
  loadingFile: boolean
  error: string | null
}

const initialState: WorkspaceState = {
  currentParentId: null,
  selectedItemId: null,
  items: [],
  fileContent: null,
  loadingItems: false,
  loadingFile: false,
  error: null,
}

export const fetchWorkspaceItems = createAsyncThunk<
  WorkspaceItem[],
  { parentId: number | null; token: string }
>('workspace/fetchItems', async ({ parentId, token }) => {
  return await listWorkspaceItems(parentId, token)
})

export const fetchFileContent = createAsyncThunk<string, { itemId: number; token: string }>(
  'workspace/fetchFileContent',
  async ({ itemId, token }) => {
    return await getWorkspaceFileContent(itemId, token)
  },
)

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    setCurrentParentId(state, action: PayloadAction<number | null>) {
      state.currentParentId = action.payload
      state.selectedItemId = null
      state.fileContent = null
    },
    setSelectedItemId(state, action: PayloadAction<number | null>) {
      state.selectedItemId = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaceItems.pending, (state) => {
        state.loadingItems = true
        state.error = null
      })
      .addCase(fetchWorkspaceItems.fulfilled, (state, action) => {
        state.loadingItems = false
        state.items = action.payload
      })
      .addCase(fetchWorkspaceItems.rejected, (state, action) => {
        state.loadingItems = false
        state.error = action.error.message ?? 'Failed to load workspace'
      })
      .addCase(fetchFileContent.pending, (state) => {
        state.loadingFile = true
        state.error = null
      })
      .addCase(fetchFileContent.fulfilled, (state, action) => {
        state.loadingFile = false
        state.fileContent = action.payload
      })
      .addCase(fetchFileContent.rejected, (state, action) => {
        state.loadingFile = false
        state.error = action.error.message ?? 'Failed to load file content'
      })
  },
})

export const { setCurrentParentId, setSelectedItemId } = workspaceSlice.actions
export default workspaceSlice.reducer

