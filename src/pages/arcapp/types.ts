export type ScheduleRow = {
  id: string | number
  date: string
  time: string
  place: string
  activity: string
  asset: string
  trade: string
  status: string
  loto: boolean
  result: string
}

export type TeamMember = {
  name: string
  email: string
}

export type Team = {
  id: string
  name: string
  members: TeamMember[]
}

export type TaskTag = 'crit' | 'high' | 'norm'

/** The Kanban board's three columns (added 2026-10-30) — `done` stays in sync with this
 * (`done === (status === 'done')`) so every pre-existing done/not-done consumer (the list
 * checkbox, KpiRow, TodoPanel's open count, todoDueDisplay) keeps working unchanged; `status` is
 * the richer field the board reads/writes. See setTaskStatus/setTaskDone in src/lib/api.ts. */
export type TaskStatus = 'todo' | 'in_progress' | 'done'

/**
 * A real, persisted task (arcapp_tasks) — replaces the old hardcoded sample To-Do list.
 * `tagLabel`/`due`/`today` used to be stored directly; they're now derived for display via
 * `todoTagLabel()`/`todoDueDisplay()` in utils.ts instead, computed from `tag`/`dueDate`/`done`.
 */
export type Todo = {
  id: string
  text: string
  tag: TaskTag
  sys: string
  dueDate: string | null // ISO yyyy-mm-dd
  status: TaskStatus
  done: boolean
  completedAt: string | null
  /** A task is assigned to at most one of: a team, or a specific person (assignedEmail/Name). */
  assignedTeamId: string | null
  assignedEmail: string | null
  assignedName: string | null
}

export type Milestone = {
  name: string
  pct: number
  due: string
  status: 'go' | 'caution' | 'hold' | 'complete'
  label: string
  /** Hex color for this milestone's current status — configurable per status bucket (Milestones
   * page's own Settings drawer), not fixed by `status` alone. */
  color: string
}

export type ActivityAnswer = {
  offsetHrs: number
  caCount: number
  cmmsEquipmentId?: string
  cmmsWorkOrder?: string
  cmmsNotes?: string
}

export type ScheduleState = 'loading' | 'ready' | 'error'

export type SealSummary = {
  text: string
  time: string
}
