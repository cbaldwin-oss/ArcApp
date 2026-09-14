import { ChevronLeft, ChevronRight, RefreshCw, Maximize2 } from 'lucide-react'
import type { ScheduleRow, ScheduleState } from '../types'
import { fmtDateLong, localIsoDate } from '../utils'
import ScheduleTable from './ScheduleTable'

type SchedulePanelProps = {
  state: ScheduleState
  rows: ScheduleRow[]
  errorMsg: string
  selectedDate: string
  sourceLabel: string
  lastSync: string | null
  refreshing: boolean
  selectedRowId: string | number | null
  answeredIds: Set<string | number>
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onPickDate: (iso: string) => void
  onRefresh: () => void
  onExpand: () => void
  onRowClick: (row: ScheduleRow) => void
  onRetry: () => void
}

export function ConnPill({ state }: { state: ScheduleState }) {
  if (state === 'loading') {
    return (
      <span className="conn-pill loading">
        <span className="led" /> Syncing
      </span>
    )
  }
  if (state === 'ready') {
    return (
      <span className="conn-pill ready">
        <span className="led" /> Live
      </span>
    )
  }
  return (
    <span className="conn-pill error">
      <span className="led red" /> Offline
    </span>
  )
}

export function syncNote(state: ScheduleState, sourceLabel: string, lastSync: string | null) {
  if (state === 'loading') return <>Source: <b style={{ color: 'var(--text-muted)' }}>{sourceLabel}</b> · syncing…</>
  if (state === 'ready')
    return (
      <>
        Source: <b style={{ color: 'var(--text-muted)' }}>{sourceLabel}</b> · last synced {lastSync}
      </>
    )
  return <>Source: <b style={{ color: 'var(--text-muted)' }}>{sourceLabel}</b> · connection failed</>
}

export default function SchedulePanel(props: SchedulePanelProps) {
  const {
    state, rows, selectedDate, sourceLabel, lastSync, refreshing,
    onPrevDay, onNextDay, onToday, onPickDate, onRefresh, onExpand,
  } = props

  const count = state === 'ready' ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : '— rows'

  return (
    <section className="panel" id="schedule">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Scheduled Activities</h2>
          <span className="panel-count">{count}</span>
          <ConnPill state={state} />
        </div>
        <div className="panel-header-right">
          <button
            className={refreshing ? 'icon-btn spin' : 'icon-btn'}
            title="Refresh"
            onClick={onRefresh}
            aria-label="Refresh scheduled activities"
          >
            <RefreshCw />
          </button>
          <button className="icon-btn" title="Expand" onClick={onExpand} aria-label="Expand scheduled activities">
            <Maximize2 />
          </button>
        </div>
      </div>

      <div className="day-nav">
        <button className="icon-btn" title="Previous day" onClick={onPrevDay} aria-label="Previous day">
          <ChevronLeft />
        </button>
        <div className="day-nav-center">
          <div className="day-nav-label">{fmtDateLong(selectedDate)}</div>
          <button
            className="day-today-btn"
            onClick={onToday}
            style={{ visibility: selectedDate === localIsoDate() ? 'hidden' : 'visible' }}
          >
            Today
          </button>
        </div>
        <button className="icon-btn" title="Next day" onClick={onNextDay} aria-label="Next day">
          <ChevronRight />
        </button>
        <input
          type="date"
          className="day-picker"
          value={selectedDate}
          onChange={(e) => e.target.value && onPickDate(e.target.value)}
        />
      </div>

      <div className="sync-note">{syncNote(state, sourceLabel, lastSync)}</div>

      <div className="panel-body no-pad">
        <ScheduleTable
          state={props.state}
          rows={props.rows}
          errorMsg={props.errorMsg}
          filter=""
          selectedDate={props.selectedDate}
          selectedRowId={props.selectedRowId}
          answeredIds={props.answeredIds}
          onRowClick={props.onRowClick}
          onRetry={props.onRetry}
        />
      </div>
    </section>
  )
}
