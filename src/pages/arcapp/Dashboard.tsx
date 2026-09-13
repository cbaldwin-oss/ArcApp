import { useState, useEffect, useCallback } from 'react'
import { useCurrentUser } from '../../lib/useCurrentUser'
import { useGetSchedule, useGetResultOptions, useCheckEditor, useSaveResult, useLogTamperSeals, useSubmitRtft, useGetSettings, useSaveSetting, useGetWorkflows } from '../../lib/api'
import type { ScheduleRow, ScheduleState, ActivityAnswer, Todo } from './types'
import { TODOS, MILESTONES } from './sampleData'
import { localIsoDate, addDaysIso } from './utils'
import Topbar from './components/Topbar'
import ContextStrip from './components/ContextStrip'
import KpiRow from './components/KpiRow'
import TodoPanel, { TodoList } from './components/TodoPanel'
import MilestonesPanel, { MilestoneList } from './components/MilestonesPanel'
import SchedulePanel from './components/SchedulePanel'
import ScheduleTable from './components/ScheduleTable'
import JointPackPhotosPanel from './components/JointPackPhotosPanel'
import SettingsPanel from './components/SettingsPanel'
import TamperSealLogPanel from './components/TamperSealLogPanel'
import RtftTrackerPanel from './components/RtftTrackerPanel'
import ChecklistReadyPanel from './components/ChecklistReadyPanel'
import IssuesReviewPanel from './components/IssuesReviewPanel'
import SubmittalReviewerPanel from './components/SubmittalReviewerPanel'
import ActivityDrawer from './components/ActivityDrawer'
import FullscreenOverlay from './components/FullscreenOverlay'
import type { SealPayloadRow } from './components/TamperSealSection'
import type { RtftPayload } from './components/RtftSection'

type NavKey =
  | 'dashboard'
  | 'todo'
  | 'milestones'
  | 'schedule'
  | 'checklists'
  | 'issues'
  | 'submittals'
  | 'jointpacks'
  | 'tamperseals'
  | 'rtft'
  | 'settings'
type FsPanel = null | 'todo' | 'milestones' | 'schedule'

const SOURCE_LABEL = 'STY4BackEndData'

export default function ArcAppDashboard() {
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

  const [activeNav, setActiveNav] = useState<NavKey>('dashboard')
  const [selectedDate, setSelectedDate] = useState<string>(localIsoDate())
  const [rows, setRows] = useState<ScheduleRow[]>([])
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [todos, setTodos] = useState<Todo[]>(TODOS)
  const [selectedRowId, setSelectedRowId] = useState<string | number | null>(null)
  const [answers, setAnswers] = useState<Record<string, ActivityAnswer>>({})

  const [fsPanel, setFsPanel] = useState<FsPanel>(null)
  const [fsFilter, setFsFilter] = useState('')

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

  const workflows = (workflowsFn.data as Array<{ id: string; activities: string[]; items: string[] }> | undefined) ?? []

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

  function handleNavigate(key: NavKey) {
    setActiveNav(key)
    const id = key === 'dashboard' ? 'dashboard' : key
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

  // Tamper seals log to SLC1Assets; RTFT stores to SLC1RTFT (signoff stamped server-side).
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

  const fsTitle =
    fsPanel === 'todo' ? 'Your To-Dos' : fsPanel === 'milestones' ? 'Milestones' : 'Scheduled Activities'

  return (
    <div className="arcapp">
      <div className="starfield" />

      <Topbar
        active={activeNav}
        onNavigate={handleNavigate}
        userName={userName}
        userInitials={initials}
        onAuthClick={handleAuthClick}
      />
      <ContextStrip />

      <main>
        <div className="page-heading" id="dashboard">
          <h1>Mission Dashboard</h1>
          <p>Your checklist, milestones, and live activity feed for Phoenix Data Center 3.</p>
        </div>

        <KpiRow />

        <div className="dash-grid">
          <TodoPanel todos={todos} onToggle={toggleTodo} onExpand={() => setFsPanel('todo')} />
          <MilestonesPanel milestones={MILESTONES} onExpand={() => setFsPanel('milestones')} />
        </div>

        <SchedulePanel
          state={scheduleState}
          rows={rows}
          errorMsg={scheduleFn.error ?? ''}
          selectedDate={selectedDate}
          sourceLabel={SOURCE_LABEL}
          lastSync={lastSync}
          refreshing={refreshing}
          selectedRowId={selectedRowId}
          answeredIds={answeredIds}
          onPrevDay={() => goToDate(addDaysIso(selectedDate, -1))}
          onNextDay={() => goToDate(addDaysIso(selectedDate, 1))}
          onToday={() => goToDate(localIsoDate())}
          onPickDate={goToDate}
          onRefresh={handleRefresh}
          onExpand={() => {
            setFsFilter('')
            setFsPanel('schedule')
          }}
          onRowClick={(r) => setSelectedRowId(r.id)}
          onRetry={() => void scheduleFn.trigger({ date: selectedDate })}
        />

        <ChecklistReadyPanel />

        <IssuesReviewPanel />

        <SubmittalReviewerPanel canEdit={canEdit} />

        <JointPackPhotosPanel
          folder={jointPackFolder}
          driveReady={driveReady}
          canEdit={canEdit}
          onLogPhotos={logJointPackPhotos}
          onGoToSettings={() => handleNavigate('settings')}
        />

        <TamperSealLogPanel />

        <RtftTrackerPanel />

        <SettingsPanel
          jointPackFolder={jointPackFolder}
          checklistReadyStatuses={checklistReadyStatuses}
          issueReviewStatuses={issueReviewStatuses}
          canEdit={canEdit}
          loading={settingsFn.loading}
          onSaveSetting={saveSetting}
        />

        <footer>
          ArcApp Commissioning · Phoenix Data Center 3 · To-dos &amp; milestones are sample data — Scheduled
          Activities reads live from {SOURCE_LABEL}
        </footer>
      </main>

      {selectedRow && (
        <ActivityDrawer
          row={selectedRow}
          authUser={editorUser}
          resultOptions={resultOptions}
          selectedDate={selectedDate}
          answer={currentAnswer}
          workflows={workflows}
          onAnswerChange={handleAnswerChange}
          onClose={() => setSelectedRowId(null)}
          onSaveResult={saveResult}
          onSaveSeals={saveSeals}
          onSubmitRTFT={submitRTFT}
          onOpenPhotos={openPhotos}
        />
      )}

      {fsPanel && (
        <FullscreenOverlay title={fsTitle} onClose={() => setFsPanel(null)}>
          {fsPanel === 'todo' && <TodoList todos={todos} onToggle={toggleTodo} />}
          {fsPanel === 'milestones' && <MilestoneList milestones={MILESTONES} />}
          {fsPanel === 'schedule' && (
            <>
              <div className="fs-toolbar">
                <input
                  type="text"
                  placeholder="Filter by place, activity, asset, status..."
                  value={fsFilter}
                  onChange={(e) => setFsFilter(e.target.value)}
                />
              </div>
              <ScheduleTable
                state={scheduleState}
                rows={rows}
                errorMsg={scheduleFn.error ?? ''}
                filter={fsFilter}
                selectedDate={selectedDate}
                selectedRowId={selectedRowId}
                answeredIds={answeredIds}
                onRowClick={(r) => setSelectedRowId(r.id)}
                onRetry={() => void scheduleFn.trigger({ date: selectedDate })}
              />
            </>
          )}
        </FullscreenOverlay>
      )}
    </div>
  )
}
