import { useState, useEffect, useCallback } from 'react'
import { Outlet } from 'react-router-dom'
import { useCurrentUser } from '../../lib/useCurrentUser'
import { useGetSchedule, useGetResultOptions, useCheckEditor, useSaveResult, useLogTamperSeals, useSubmitRtft, useGetSettings, useSaveSetting, useGetWorkflows, useGetWorkflowItems } from '../../lib/api'
import type { WorkflowItem } from './workflowItems'
import type { ShellContext } from './ShellContext'
import type { ScheduleRow, ScheduleState, ActivityAnswer, Todo } from './types'
import { TODOS } from './sampleData'
import { localIsoDate, addDaysIso } from './utils'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import ContextStrip from './components/ContextStrip'
import ActivityDrawer from './components/ActivityDrawer'
import type { SealPayloadRow } from './components/TamperSealSection'
import type { RtftPayload } from './components/RtftSection'

const SOURCE_LABEL = 'STY4BackEndData'

/**
 * The persistent app shell: sidebar navigation + everything every routed page might need,
 * fetched/held once here and handed down via <Outlet context>. Replaces the old single-page
 * Dashboard — each nav item that used to scroll to a section on one long page now routes to its
 * own page (see App.tsx), with this shell providing the surrounding chrome (topbar, sidebar,
 * footer) and the Activity Drawer, which can be opened from more than one page.
 */
export default function AppShell() {
  const { user, signInWithEmail, signOut } = useCurrentUser()

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

  const [selectedDate, setSelectedDate] = useState<string>(localIsoDate())
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [todos, setTodos] = useState<Todo[]>(TODOS)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    | { jointPackPhotosFolder?: string; checklistReadyStatuses?: string[]; issueReviewStatuses?: string[] }
    | undefined
  const jointPackFolder = settingsData?.jointPackPhotosFolder ?? ''
  const checklistReadyStatuses = settingsData?.checklistReadyStatuses ?? []
  const issueReviewStatuses = settingsData?.issueReviewStatuses ?? []
  const driveReady = false // turns on once the "ArcApp Connections" Google Drive resource is connected

  const userName = user?.email ?? null
  const initials = user
    ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() ||
      (user.email?.slice(0, 2).toUpperCase() ?? '?')
    : '?'

  function goToDate(iso: string) {
    setSelectedDate(iso)
  }

  // Minimal magic-link auth control. Retool used to handle sign-in automatically; replace this
  // with a proper login form/modal when you're ready for something nicer.
  async function handleAuthClick() {
    if (user) {
      await signOut()
      return
    }
    const email = window.prompt('Enter your work email to sign in:')
    if (!email) return
    const { error } = await signInWithEmail(email.trim())
    window.alert(error ? `Sign-in failed: ${error}` : `Check ${email} for a sign-in link.`)
  }

  function handleRefresh() {
    setRefreshing(true)
    Promise.resolve(scheduleFn.trigger({ date: selectedDate }).result)
      .catch(() => {})
      .finally(() => setTimeout(() => setRefreshing(false), 400))
  }

  function toggleTodo(id: number) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))
  }

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
    // Google Drive upload wires up once the "ArcApp Connections" resource is available.
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

  const logJointPackPhotos = useCallback(() => {
    // eslint-disable-next-line no-console
    console.info('Log Joint Pack photos to Drive folder:', jointPackFolder)
  }, [jointPackFolder])

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
    driveReady,
    onLogJointPackPhotos: logJointPackPhotos,

    canEdit,
    canManageWorkflows,

    checklistReadyStatuses,
    issueReviewStatuses,
    settingsLoading: settingsFn.loading,
    onSaveSetting: saveSetting,
  }

  return (
    <div className="arcapp">
      <div className="starfield" />

      <Topbar userName={userName} userInitials={initials} onAuthClick={handleAuthClick} />
      <ContextStrip />

      <div className="arcapp-layout">
        <Sidebar />

        <main>
          <Outlet context={outletContext} />

          <footer>
            ArcApp Commissioning · Phoenix Data Center 3 · To-dos &amp; milestones are sample data — Scheduled
            Activities reads live from {SOURCE_LABEL}
          </footer>
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
    </div>
  )
}
