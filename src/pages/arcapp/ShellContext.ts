import type { ScheduleRow, ScheduleState, Team, TeamMember, Todo } from './types'
import type { TaskInput } from '../../lib/api'

/**
 * Passed down via react-router's <Outlet context={...}> from AppShell to whichever page is
 * currently routed. Only the pages that actually need shared/live state pull from this
 * (useOutletContext<ShellContext>()) — the fully self-contained panels (Checklists, Issues,
 * Tamper Seals log, RTFT tracker) fetch their own data and don't need it at all.
 */
export type ShellContext = {
  todos: Todo[]
  onToggleTodo: (id: string) => void
  tasksLoading: boolean
  tasksError: string
  onSaveTask: (input: TaskInput) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>

  teams: Team[]
  teamsLoading: boolean
  teamsError: string
  onSaveTeam: (input: { id?: string; name: string; members: TeamMember[] }) => Promise<void>
  onDeleteTeam: (id: string) => Promise<void>

  /** For "assigned to me" — null when nobody's signed in (task/team browsing still works). */
  currentUserEmail: string | null

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

  /** Google Drive folder ID photos upload into — see JointPackPhotosPanel, which fetches/logs
   * Joint Pack data itself (this is the only piece of it that lives on shared shell state). */
  jointPackFolder: string

  canEdit: boolean
  canManageWorkflows: boolean

  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  submittalExemptAssets: string[]
  settingsLoading: boolean
  onSaveSetting: (key: string, value: string) => Promise<void>
}
