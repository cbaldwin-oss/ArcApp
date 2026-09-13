import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGetTamperSeals } from '../../../lib/api'
import { fmtDate } from '../utils'

type SealRow = {
  id: number
  asset_name: string
  location: string
  sub_area: string
  seal_number: string
  inspection_date: string
  inspection_notes: string
  signoff: string
  status: string
}

function sealStatusClass(status: string): string {
  const t = (status || '').toLowerCase()
  if (t.includes('broke') || t.includes('missing') || t.includes('tamper')) return 'hold'
  if (t.includes('intact')) return 'go'
  return 'muted'
}

export default function TamperSealLogPanel() {
  const fn = useGetTamperSeals()

  useEffect(() => {
    void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = (fn.data as SealRow[] | undefined) ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  return (
    <section className="panel" id="tamperseals">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Tamper Seal Log</h2>
          <span className="panel-count">{state === 'ready' ? `${rows.length} seals` : '— seals'}</span>
          <span className={state === 'ready' ? 'conn-pill ready' : state === 'error' ? 'conn-pill error' : 'conn-pill loading'}>
            <span className={state === 'error' ? 'led red' : 'led'} /> {state === 'ready' ? 'Live' : state === 'error' ? 'Offline' : 'Syncing'}
          </span>
        </div>
        <div className="panel-header-right">
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh tamper seals">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="panel-body no-pad">
        <div style={{ overflowX: 'auto' }}>
          <table className="sched">
            <thead>
              <tr>
                <th>Seal #</th>
                <th>Asset</th>
                <th>Location</th>
                <th>Sub Area</th>
                <th>Status</th>
                <th>Inspection Date</th>
                <th>Signoff</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {state === 'loading' &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr className="skeleton-row" key={i}>
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
                    Couldn&apos;t load tamper seals ({fn.error}).
                    <br />
                    <button className="retry-btn" onClick={() => void fn.trigger()}>
                      Retry
                    </button>
                  </td>
                </tr>
              )}
              {state === 'ready' && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty">
                    No tamper seals logged yet.
                  </td>
                </tr>
              )}
              {state === 'ready' &&
                rows.map((r) => (
                  <tr key={r.id}>
                    <td className="tag-cell">{r.seal_number}</td>
                    <td>{r.asset_name}</td>
                    <td className="discipline-cell">{r.location || '—'}</td>
                    <td className="discipline-cell">{r.sub_area || '—'}</td>
                    <td>
                      <span className={`status-chip ${sealStatusClass(r.status)}`}>{r.status || '—'}</span>
                    </td>
                    <td className="discipline-cell">{fmtDate(r.inspection_date)}</td>
                    <td className="discipline-cell">{r.signoff || '—'}</td>
                    <td className="discipline-cell">{r.inspection_notes || '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
