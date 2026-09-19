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
