import type { WorkspaceItem } from '@/lib/api'
import { listWorkspaceItems } from '@/lib/api'

/** Spreadsheet/data files usable in Research, Compare, and Wishlist. */
export function isSpreadsheetWorkspaceFile(item: WorkspaceItem): boolean {
  return !item.is_folder && item.access !== 'Report'
}

export function isReportOnlyWorkspaceFile(item: WorkspaceItem): boolean {
  return !item.is_folder && item.access === 'Report'
}

const REPORTS_FOLDER_NAME = 'Reports'

/** Word documents uploaded for report edit (stored under the Reports workspace folder). */
export async function listReportWorkspaceDocx(token: string): Promise<WorkspaceItem[]> {
  const root = await listWorkspaceItems(null, token)
  const reportsFolder = root.find((item) => item.is_folder && item.name === REPORTS_FOLDER_NAME)
  if (!reportsFolder) return []
  const inFolder = await listWorkspaceItems(reportsFolder.id, token)
  return inFolder.filter(isReportOnlyWorkspaceFile)
}
