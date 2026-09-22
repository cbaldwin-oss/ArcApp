import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { ShellContext } from '../ShellContext'
import { ConnPill, syncNote } from '../components/SchedulePanel'
import ScheduleTable from '../components/ScheduleTable'
import { fmtDateLong, localIsoDate } from '../utils'
import { CURRENT_PROJECT } from '../../../lib/project'

const SOURCE_LABEL = `${CURRENT_PROJECT}BackEndData`

/** The full Schedule browser — day nav, free-text filter, and every row for the selected day.
 * Replaces the old "Expand" fullscreen overlay now that this is its own page. */
export default function SchedulePage() {
  const ctx = useOutletContext<ShellContext>()
  const [filter, setFilter] = useState('')

  const count = ctx.scheduleState === 'ready' ? `${ctx.rows.length} row${ctx.rows.length === 1 ? '' : 's'}` : '— rows'

  return (
    <section className="panel" id="schedule">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Scheduled Activities</h2>
          <span className="panel-count">{count}</span>
          <ConnPill state={ctx.scheduleState} />
        </div>
        <div className="panel-header-right">
          <button
            className={ctx.refreshing ? 'icon-btn spin' : 'icon-btn'}
            title="Refresh"
            onClick={ctx.onRefresh}
            aria-label="Refresh scheduled activities"
          >
            <RefreshCw />
          </button>
        </div>
      </div>

      <div className="day-nav">
        <button className="icon-btn" title="Previous day" onClick={ctx.onPrevDay} aria-label="Previous day">
          <ChevronLeft />
        </button>
        <div className="day-nav-center">
          <div className="day-nav-label">{fmtDateLong(ctx.selectedDate)}</div>
          <button
            className="day-today-btn"
            onClick={ctx.onToday}
            style={{ visibility: ctx.selectedDate === localIsoDate() ? 'hidden' : 'visible' }}
          >
            Today
          </button>
        </div>
        <button className="icon-btn" title="Next day" onClick={ctx.onNextDay} aria-label="Next day">
          <ChevronRight />
        </button>
        <input
          type="date"
          className="day-picker"
          value={ctx.selectedDate}
          onChange={(e) => e.target.value && ctx.onPickDate(e.target.value)}
        />
      </div>

      <div className="sync-note">{syncNote(ctx.scheduleState, SOURCE_LABEL, ctx.lastSync)}</div>

      <div className="fs-toolbar">
        <input
          type="text"
          placeholder="Filter by place, activity, asset, status..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="panel-body no-pad">
        <ScheduleTable
          state={ctx.scheduleState}
          rows={ctx.rows}
          errorMsg={ctx.scheduleError}
          filter={filter}
          selectedDate={ctx.selectedDate}
          selectedRowId={ctx.selectedRowId}
          answeredIds={ctx.answeredIds}
          onRowClick={ctx.onRowClick}
          onRetry={ctx.onScheduleRetry}
        />
      </div>
    </section>
  )
}
