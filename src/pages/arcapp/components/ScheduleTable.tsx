import type { ScheduleRow, ScheduleState } from '../types'
import { scheduleStatusClass, fmtDate } from '../utils'

type ScheduleTableProps = {
  state: ScheduleState
  rows: ScheduleRow[]
  errorMsg: string
  filter: string
  selectedDate: string
  selectedRowId: string | number | null
  answeredIds: Set<string | number>
  onRowClick: (row: ScheduleRow) => void
  onRetry: () => void
}

export default function ScheduleTable({
  state,
  rows,
  errorMsg,
  filter,
  selectedDate,
  selectedRowId,
  answeredIds,
  onRowClick,
  onRetry,
}: ScheduleTableProps) {
  const f = filter.trim().toLowerCase()
  const filtered = rows.filter(
    (r) =>
      !f ||
      (r.time + r.place + r.activity + r.asset + r.trade + r.status + r.result).toLowerCase().includes(f),
  )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="sched">
        <thead>
          <tr>
            <th>Time</th>
            <th>Place</th>
            <th>Activity</th>
            <th>Asset</th>
            <th>Trade Partners</th>
            <th>Status</th>
            <th>LOTO</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {state === 'loading' &&
            Array.from({ length: 5 }).map((_, i) => (
              <tr className="skeleton-row" key={`sk-${i}`}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton-bar" style={{ width: '80%' }} />
                  </td>
                ))}
              </tr>
            ))}

          {state === 'error' && (
            <tr>
              <td colSpan={8} className="table-error">
                Couldn&apos;t reach the data source ({errorMsg}).
                <br />
                <button className="retry-btn" onClick={onRetry}>
                  Retry connection
                </button>
              </td>
            </tr>
          )}

          {state === 'ready' && filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="table-empty">
                No scheduled activities on {fmtDate(selectedDate)}.
              </td>
            </tr>
          )}

          {state === 'ready' &&
            filtered.map((r) => (
              <tr
                key={r.id}
                data-id={r.id}
                className={String(r.id) === String(selectedRowId) ? 'row-selected' : ''}
                onClick={() => onRowClick(r)}
              >
                <td>{r.time}</td>
                <td className="tag-cell">{r.place}</td>
                <td>
                  {answeredIds.has(r.id) && <span className="answered-dot" title="Notes recorded" />}
                  {r.activity}
                </td>
                <td className="discipline-cell">{r.asset}</td>
                <td className="discipline-cell">{r.trade}</td>
                <td>
                  <span className={`status-chip ${scheduleStatusClass(r.status)}`}>{r.status}</span>
                </td>
                <td>
                  {r.loto ? <span className="loto-yes">YES</span> : <span className="loto-no">NO</span>}
                </td>
                <td className="discipline-cell">{r.result}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
