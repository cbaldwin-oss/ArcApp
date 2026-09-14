import type { ScheduleRow, ScheduleState, Todo } from './types'

/**
 * Passed down via react-router's <Outlet context={...}> from AppShell to whichever page is
 * currently routed. Only the pages that actually need shared/live state pull from this
 * (useOutletContext<ShellContext>()) — the fully self-contained panels (Checklists, Issues,
 * Tamper Seals log, RTFT tracker) fetch their own data and don't need it at all.
 */
export type ShellContext = {
  todos: Todo[]
  onToggleTodo: (id: number) => void

  scheduleState: ScheduleState
  rows: ScheduleRow[]
  scheduleError: string
  selectedDate: string
  lastSync: string | null
  refreshing: boolean
  selectedRowId: string | number | null
  answeredIds: Set<string | number>
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onPickDate: (iso: string) => void
  onRefresh: () => void
  onRowClick: (row: ScheduleRow) => void
  onScheduleRetry: () => void

  jointPackFolder: string
  driveReady: boolean
  onLogJointPackPhotos: () => void

  canEdit: boolean
  canManageWorkflows: boolean

  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  settingsLoading: boolean
  onSaveSetting: (key: string, value: string) => Promise<void>
}
