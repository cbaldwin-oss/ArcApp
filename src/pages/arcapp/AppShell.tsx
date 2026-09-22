import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../../lib/useCurrentUser'
import { CURRENT_PROJECT } from '../../lib/project'
import {
  useGetSchedule, useGetResultOptions, useCheckEditor, useSaveResult, useLogTamperSeals, useSubmitRtft,
  useGetSettings, useSaveSetting, useGetWorkflows, useGetWorkflowItems,
  useGetTasks, useSaveTask, useSetTaskDone, useDeleteTask, useGetTeams, useSaveTeam, useDeleteTeam,
} from '../../lib/api'
import type { TaskInput } from '../../lib/api'
import type { WorkflowItem } from './workflowItems'
import type { ShellContext } from './ShellContext'
import type { ScheduleRow, ScheduleState, ActivityAnswer, Todo, Team, TeamMember } from './types'
import { localIsoDate, addDaysIso } from './utils'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import ContextStrip from './components/ContextStrip'
import ActivityDrawer from './components/ActivityDrawer'
import SignInModal from './components/SignInModal'
import type { SealPayloadRow } from './components/TamperSealSection'
import type { RtftPayload } from './components/RtftSection'

const SOURCE_LABEL = `${CURRENT_PROJECT}BackEndData`

/**
 * The persistent app shell: sidebar navigation + everything every routed page might need,
 * fetched/held once here and handed down via <Outlet context>. Replaces the old single-page
 * Dashboard — each nav item that used to scroll to a section on one long page now routes to its
 * own page (see App.tsx), with this shell providing the surrounding chrome (topbar, sidebar,
 * footer) and the Activity Drawer, which can be opened from more than one page.
 */
export default function AppShell() {
  const { user, authError, signInWithGoogle, signInWithEmail, signOut, clearAuthError } = useCurrentUser()
  const [signInOpen, setSignInOpen] = useState(false)
  const location = useLocation()
  // The tracker is a wide, data-dense grid — it gets the whole page (no 1200px content cap, no
  // card chrome, no footer) instead of living in the standard boxed-panel content column every
  // other page uses.
  const isFullBleed = location.pathname.startsWith('/equipmenttracker')

  const scheduleFn = useGetSchedule()
  const optionsFn = useGetResultOptions()
  const editorFn = useCheckEditor()
  const saveResultFn = useSaveResult()
  const logSealsFn = useLogTamperSeals()
  const submitRtftFn = useSubmitRtft()
  const settingsFn = useGetSettings()
  const saveSettingFn = useSaveSetting()
  const workflowsFn = useGetWorkflows()
  const workflowItemsFn = useGetWorkflowItems()
  const tasksFn = useGetTasks()
  const saveTaskFn = useSaveTask()
  const setTaskDoneFn = useSetTaskDone()
  const deleteTaskFn = useDeleteTask()
  const teamsFn = useGetTeams()
  const saveTeamFn = useSaveTeam()
  const deleteTeamFn = useDeleteTeam()

  const [selectedDate, setSelectedDate] = useState<string>(localIsoDate())
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [todos, setTodos] = useState<Todo[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null)
  const [answers, setAnswers] = useState<Record<string, ActivityAnswer>>({})

  // Load schedule whenever the selected day changes.
  useEffect(() => {
    setSelectedRowId(null)
    void scheduleFn.trigger({ date: selectedDate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // Sync local rows from the fetched data.
  useEffect(() => {
    if (scheduleFn.data) {
      setRows(scheduleFn.data as ScheduleRow[])
      setLastSync(new Date().toLocaleTimeString())
    }
  }, [scheduleFn.data])

  // Load result options + editor permission + settings once (editor email comes from the session).
  useEffect(() => {
    void optionsFn.trigger()
    void editorFn.trigger()
    void settingsFn.trigger()
    void workflowsFn.trigger()
    void workflowItemsFn.trigger()
    void tasksFn.trigger()
    void teamsFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (tasksFn.data) setTodos(tasksFn.data as Todo[])
  }, [tasksFn.data])
  useEffect(() => {
    if (teamsFn.data) setTeams(teamsFn.data as Team[])
  }, [teamsFn.data])

  const scheduleState: ScheduleState = scheduleFn.error
    ? 'error'
    : scheduleFn.loading || !scheduleFn.data
      ? 'loading'
      : 'ready'

  const resultOptions = (optionsFn.data as string[] | undefined) ?? []
  const editorPerm = editorFn.data as { isAuthorized?: boolean; email?: string | null } | undefined
  const editorUser = editorPerm?.isAuthorized && editorPerm.email ? editorPerm.email : null
  const canEdit = !!editorUser
  // TEMPORARY (per request, 2026-09-14): no sign-in required to manage Workflows at all — see
  // supabase/policies.sql for the matching RLS relaxation and how to revert. Everything else
  // gated by `canEdit` (settings, the item catalog, submittals) is unchanged.
  const canManageWorkflows = true

  const workflows = (workflowsFn.data as Array<{ id: string; activities: string[]; items: string[] }> | undefined) ?? []
  const workflowItems = (workflowItemsFn.data as WorkflowItem[] | undefined) ?? []

  const settingsData = settingsFn.data as
    | {
        jointPackPhotosFolder?: string
        checklistReadyStatuses?: string[]
        issueReviewStatuses?: string[]
        submittalExemptAssets?: string[]
        checklistTodoEnabled?: boolean
        issueTodoEnabled?: boolean
        checklistOpenStatuses?: string[]
        issueOpenStatuses?: string[]
      }
    | undefined
  const jointPackFolder = settingsData?.jointPackPhotosFolder ?? ''
  const checklistReadyStatuses = settingsData?.checklistReadyStatuses ?? []
  const issueReviewStatuses = settingsData?.issueReviewStatuses ?? []
  const submittalExemptAssets = settingsData?.submittalExemptAssets ?? []
  const checklistTodoEnabled = settingsData?.checklistTodoEnabled ?? false
  const issueTodoEnabled = settingsData?.issueTodoEnabled ?? false
  const checklistOpenStatuses = settingsData?.checklistOpenStatuses ?? []
  const issueOpenStatuses = settingsData?.issueOpenStatuses ?? []

  const userName = user?.name ?? null
  const initials = user
    ? (() => {
        const parts = user.name.trim().split(/\s+/).filter(Boolean)
        const fromName = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) ?? ''
        return (fromName || user.email.slice(0, 2)).toUpperCase()
      })()
    : '?'

  function goToDate(iso: string) {
    setSelectedDate(iso)
  }

  function handleAuthClick() {
    if (user) {
      void signOut()
      return
    }
    setSignInOpen(true)
  }

  function handleRefresh() {
    setRefreshing(true)
    Promise.resolve(scheduleFn.trigger({ date: selectedDate }).result)
      .catch(() => {})
      .finally(() => setTimeout(() => setRefreshing(false), 400))
  }

  async function toggleTodo(id: string) {
    const current = todos.find((t) => t.id === id)
    if (!current) return
    const done = !current.done
    await setTaskDoneFn.trigger({ id, done }).result
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done, completedAt: done ? new Date().toISOString() : null } : t)),
    )
  }

  const saveTaskRecord = useCallback(
    async (input: TaskInput) => {
      await saveTaskFn.trigger(input).result
      void tasksFn.trigger()
    },
    [saveTaskFn, tasksFn],
  )
  const deleteTaskRecord = useCallback(
    async (id: string) => {
      await deleteTaskFn.trigger({ id }).result
      setTodos((prev) => prev.filter((t) => t.id !== id))
    },
    [deleteTaskFn],
  )

  const saveTeamRecord = useCallback(
    async (input: { id?: string; name: string; members: TeamMember[] }) => {
      await saveTeamFn.trigger(input).result
      void teamsFn.trigger()
    },
    [saveTeamFn, teamsFn],
  )
  const deleteTeamRecord = useCallback(
    async (id: string) => {
      await deleteTeamFn.trigger({ id }).result
      setTeams((prev) => prev.filter((t) => t.id !== id))
      // A deleted team's tasks fall back to unassigned server-side (ON DELETE SET NULL) — refetch
      // so the task list reflects that instead of still showing the removed team.
      void tasksFn.trigger()
    },
    [deleteTeamFn, tasksFn],
  )

  const selectedRow = rows.find((r) => String(r.id) === String(selectedRowId)) ?? null

  function handleAnswerChange(rowId: string | number, answer: ActivityAnswer) {
    setAnswers((prev) => ({ ...prev, [String(rowId)]: answer }))
  }

  const saveResult = useCallback(
    async (id: string | number, value: string) => {
      await saveResultFn.trigger({ id, result: value }).result
      setRows((prev) => prev.map((r) => (String(r.id) === String(id) ? { ...r, result: value || '—' } : r)))
    },
    [saveResultFn],
  )

  // Tamper seals log to STY4Assets; RTFT stores to STY4RTFT (signoff stamped server-side).
  const saveSeals = useCallback(
    async (rows: SealPayloadRow[]) => {
      await logSealsFn.trigger({ rows }).result
    },
    [logSealsFn],
  )
  const submitRTFT = useCallback(
    async (payload: RtftPayload) => {
      await submitRtftFn.trigger(payload).result
    },
    [submitRtftFn],
  )

  const openPhotos = useCallback((row: ScheduleRow) => {
    // eslint-disable-next-line no-console
    console.info('Log photos requested for', row.activity, '·', row.asset, '·', row.date)
  }, [])

  const saveSetting = useCallback(
    async (key: string, value: string) => {
      await saveSettingFn.trigger({ key, value }).result
      void settingsFn.trigger()
    },
    [saveSettingFn, settingsFn],
  )

  const answeredIds = new Set<string | number>(
    Object.keys(answers).map((k) => {
      const match = rows.find((r) => String(r.id) === k)
      return match ? match.id : k
    }),
  )

  const currentAnswer: ActivityAnswer = selectedRow
    ? answers[String(selectedRow.id)] ?? { offsetHrs: 0, caCount: 1 }
    : { offsetHrs: 0, caCount: 1 }

  const outletContext: ShellContext = {
    todos,
    onToggleTodo: toggleTodo,
    tasksLoading: tasksFn.loading || !tasksFn.data,
    tasksError: tasksFn.error ?? '',
    onSaveTask: saveTaskRecord,
    onDeleteTask: deleteTaskRecord,

    teams,
    teamsLoading: teamsFn.loading || !teamsFn.data,
    teamsError: teamsFn.error ?? '',
    onSaveTeam: saveTeamRecord,
    onDeleteTeam: deleteTeamRecord,

    currentUserEmail: user?.email ?? null,

    scheduleState,
    rows,
    scheduleError: scheduleFn.error ?? '',
    selectedDate,
    lastSync,
    refreshing,
    selectedRowId,
    answeredIds,
    onPrevDay: () => goToDate(addDaysIso(selectedDate, -1)),
    onNextDay: () => goToDate(addDaysIso(selectedDate, 1)),
    onToday: () => goToDate(localIsoDate()),
    onPickDate: goToDate,
    onRefresh: handleRefresh,
    onRowClick: (r) => setSelectedRowId(r.id),
    onScheduleRetry: () => void scheduleFn.trigger({ date: selectedDate }),

    jointPackFolder,

    canEdit,
    canManageWorkflows,

    checklistReadyStatuses,
    issueReviewStatuses,
    submittalExemptAssets,
    checklistTodoEnabled,
    issueTodoEnabled,
    checklistOpenStatuses,
    issueOpenStatuses,
    settingsLoading: settingsFn.loading,
    onSaveSetting: saveSetting,
  }

  return (
    <div className="arcapp">
      <div className="starfield" />

      <Topbar userName={userName} userInitials={initials} onAuthClick={handleAuthClick} />
      {authError && (
        <div className="auth-error-banner">
          <span>{authError}</span>
          <button onClick={clearAuthError} aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}
      <ContextStrip />

      <div className="arcapp-layout">
        <Sidebar />

        <main className={isFullBleed ? 'main-full' : undefined}>
          <Outlet context={outletContext} />

          {!isFullBleed && (
            <footer>
              ArcApp Commissioning · Phoenix Data Center 3 · Milestones are sample data — To-Dos
              read live from arcapp_tasks and Scheduled Activities from {SOURCE_LABEL}
            </footer>
          )}
        </main>
      </div>

      {selectedRow && (
        <ActivityDrawer
          row={selectedRow}
          authUser={user?.email ?? null}
          resultOptions={resultOptions}
          selectedDate={selectedDate}
          answer={currentAnswer}
          workflows={workflows}
          workflowItems={workflowItems}
          onAnswerChange={handleAnswerChange}
          onClose={() => setSelectedRowId(null)}
          onSaveResult={saveResult}
          onSaveSeals={saveSeals}
          onSubmitRTFT={submitRTFT}
          onOpenPhotos={openPhotos}
        />
      )}

      {signInOpen && (
        <SignInModal
          onClose={() => setSignInOpen(false)}
          onGoogle={signInWithGoogle}
          onEmail={signInWithEmail}
        />
      )}
    </div>
  )
}
