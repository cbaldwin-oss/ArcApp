import type { ScheduleRow, ScheduleState, Team, TeamMember, Todo } from './types'
import type { CxAlloyLinkBase, DefaultAssignee, TaskInput } from '../../lib/api'

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

  /** Any signed-in, authorized ArcApp user (admin or editor) — governs Submittals, Asset
   * Attributes, Workflow item catalog, etc. Settings specifically requires `isAdmin` instead. */
  canEdit: boolean
  /** From arcapp_authorized_users.role === 'admin' — the only role that can change Settings
   * (including managing the authorized-users list itself). See src/lib/useCurrentUser.ts. */
  isAdmin: boolean
  canManageWorkflows: boolean

  checklistReadyStatuses: string[]
  issueReviewStatuses: string[]
  submittalExemptAssets: string[]
  checklistTodoEnabled: boolean
  issueTodoEnabled: boolean
  netaSubmissionsTodoEnabled: boolean
  netaReturnedTodoEnabled: boolean
  /** Default assignee per To-Do category — see AppSettings in api.ts for the summary-card
   * behavior this drives. Blank (all-null) when no default is set for that category. */
  checklistDefaultAssignee: DefaultAssignee
  issueDefaultAssignee: DefaultAssignee
  netaSubmissionsDefaultAssignee: DefaultAssignee
  netaReturnedDefaultAssignee: DefaultAssignee
  /** Effective CxAlloy domain+project id for building checklist/issue deep links — the Settings
   * override if one's set, else whatever was auto-detected from this project's Equipment Tracker
   * data. Null while still loading, or if neither is available yet (checklist/issue rows without
   * their own link just render as plain text in that case, not a broken link). */
  cxAlloyLinkBase: CxAlloyLinkBase | null
  /** What auto-detection actually found, regardless of whether an override is also set — shown in
   * Settings next to the override field so it's visible without opening dev tools. */
  cxAlloyLinkBaseDetected: CxAlloyLinkBase | null
  cxalloyLinkBaseOverride: string
  settingsLoading: boolean
  onSaveSetting: (key: string, value: string) => Promise<void>
  onSaveDefaultAssignee: (prefix: string, result: DefaultAssignee) => Promise<void>
}
