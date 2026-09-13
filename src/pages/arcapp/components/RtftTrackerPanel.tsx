import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGetRtft } from '../../../lib/api'
import { fmtDate } from '../utils'

type RtftRow = {
  id: number
  inspection_date: string
  equipment: string
  equipment_type: string
  inspector: string
  issues_found: string
  corrected_immediately: string
  entered_bim: string
  bim_issue_number: string
  l2_pass: string
  signoff: string
}

function ynClass(v: string): string {
  const t = (v || '').toLowerCase()
  if (t === 'yes') return 'go'
  if (t === 'no') return 'hold'
  return 'muted'
}

export default function RtftTrackerPanel() {
  const fn = useGetRtft()

  useEffect(() => {
    void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = (fn.data as RtftRow[] | undefined) ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  return (
    <section className="panel" id="rtft">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">RTFT Tracker</h2>
          <span className="panel-count">{state === 'ready' ? `${rows.length} entries` : '— entries'}</span>
          <span className={state === 'ready' ? 'conn-pill ready' : state === 'error' ? 'conn-pill error' : 'conn-pill loading'}>
            <span className={state === 'error' ? 'led red' : 'led'} /> {state === 'ready' ? 'Live' : state === 'error' ? 'Offline' : 'Syncing'}
          </span>
        </div>
        <div className="panel-header-right">
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh RTFT">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="panel-body no-pad">
        <div style={{ overflowX: 'auto' }}>
          <table className="sched">
            <thead>
              <tr>
                <th>Date</th>
                <th>Equipment</th>
                <th>Type</th>
                <th>Inspector</th>
                <th>Issues Found</th>
                <th>Corrected</th>
                <th>BIM #</th>
                <th>L2 Pass</th>
                <th>Signoff</th>
              </tr>
            </thead>
            <tbody>
              {state === 'loading' &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr className="skeleton-row" key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j}>
                        <div className="skeleton-bar" style={{ width: '80%' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              {state === 'error' && (
                <tr>
                  <td colSpan={9} className="table-error">
                    Couldn&apos;t load RTFT entries ({fn.error}).
                    <br />
                    <button className="retry-btn" onClick={() => void fn.trigger()}>
                      Retry
                    </button>
                  </td>
                </tr>
              )}
              {state === 'ready' && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="table-empty">
                    No RTFT entries yet. Submit one from an activity&apos;s detail drawer.
                  </td>
                </tr>
              )}
              {state === 'ready' &&
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="discipline-cell">{fmtDate(r.inspection_date)}</td>
                    <td className="tag-cell">{r.equipment || '—'}</td>
                    <td className="discipline-cell">{r.equipment_type || '—'}</td>
                    <td className="discipline-cell">{r.inspector || '—'}</td>
                    <td>
                      <span className={`status-chip ${ynClass(r.issues_found)}`}>{r.issues_found || '—'}</span>
                    </td>
                    <td className="discipline-cell">{r.corrected_immediately || '—'}</td>
                    <td className="discipline-cell">{r.bim_issue_number || '—'}</td>
                    <td>
                      <span className={`status-chip ${ynClass(r.l2_pass)}`}>{r.l2_pass || '—'}</span>
                    </td>
                    <td className="discipline-cell">{r.signoff || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
