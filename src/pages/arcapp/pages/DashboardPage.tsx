import { useNavigate, useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import { MILESTONES } from '../sampleData'
import { isTodoMine } from '../utils'
import KpiRow from '../components/KpiRow'
import TodoPanel from '../components/TodoPanel'
import MilestonesPanel from '../components/MilestonesPanel'
import SchedulePanel from '../components/SchedulePanel'

const SOURCE_LABEL = 'STY4BackEndData'

/** The landing page — an at-a-glance overview. Each widget's "expand" now navigates to that
 * section's own full page (via the sidebar) instead of opening an in-page overlay. */
export default function DashboardPage() {
  const ctx = useOutletContext<ShellContext>()
  const navigate = useNavigate()

  // "Your To-Dos" personalizes once someone's signed in (mine + my teams'); falls back to every
  // open task when signed out, same as before this widget could know who "you" are.
  const myTodos = ctx.currentUserEmail
    ? ctx.todos.filter((t) => isTodoMine(t, ctx.currentUserEmail, ctx.teams))
    : ctx.todos

  return (
    <>
      <div className="page-heading">
        <h1>Mission Dashboard</h1>
        <p>Your checklist, milestones, and live activity feed for Phoenix Data Center 3.</p>
      </div>

      <KpiRow />

      <div className="dash-grid">
        <TodoPanel todos={myTodos} onToggle={ctx.onToggleTodo} onExpand={() => navigate('/todo')} />
        <MilestonesPanel milestones={MILESTONES} onExpand={() => navigate('/milestones')} />
      </div>

      <SchedulePanel
        state={ctx.scheduleState}
        rows={ctx.rows}
        errorMsg={ctx.scheduleError}
        selectedDate={ctx.selectedDate}
        sourceLabel={SOURCE_LABEL}
        lastSync={ctx.lastSync}
        refreshing={ctx.refreshing}
        selectedRowId={ctx.selectedRowId}
        answeredIds={ctx.answeredIds}
        onPrevDay={ctx.onPrevDay}
        onNextDay={ctx.onNextDay}
        onToday={ctx.onToday}
        onPickDate={ctx.onPickDate}
        onRefresh={ctx.onRefresh}
        onExpand={() => navigate('/schedule')}
        onRowClick={ctx.onRowClick}
        onRetry={ctx.onScheduleRetry}
      />
    </>
  )
}
