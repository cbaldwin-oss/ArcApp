import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGetIssues } from '../../../lib/api'

type Row = {
  issue_id: string
  name: string
  description: string
  asset_name: string
  priority: string
  status: string
  created_by: string
  assigned_name: string
  source_type: string
  due_date: string
  date_created: string
}

function priorityClass(p: string): string {
  const t = (p || '').toLowerCase()
  if (t.includes('high') || t.includes('critical')) return 'hold'
  if (t.includes('mod')) return 'caution'
  return 'muted'
}

export default function IssuesReviewPanel() {
  const fn = useGetIssues()
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const data = fn.data as { rows: Row[]; reviewStatuses: string[] } | undefined
  const rows = data?.rows ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'
  const f = filter.trim().toLowerCase()
  const filtered = rows.filter(
    (r) => !f || (r.name + r.description + r.asset_name + r.created_by + r.assigned_name).toLowerCase().includes(f),
  )

  return (
    <section className="panel" id="issues">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Issues for Review</h2>
          <span className="panel-count">{state === 'ready' ? `${rows.length} ready` : '— ready'}</span>
          {data?.reviewStatuses?.length ? (
            <span className="conn-pill ready">
              <span className="led" /> {data.reviewStatuses.join(', ')}
            </span>
          ) : null}
        </div>
        <div className="panel-header-right">
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh issues">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        Ready for review · grouped by originator (created by) · source: <b style={{ color: 'var(--text-muted)' }}>STY4A API Database · Issues</b>
      </div>
      {state === 'ready' && (
        <div style={{ padding: '0 20px 12px' }}>
          <input
            type="text"
            placeholder="Filter by issue, asset, originator, company..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%', maxWidth: 380, background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12.5, padding: '9px 13px',
            }}
          />
        </div>
      )}
      <div className="panel-body no-pad">
        <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table className="sched">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Description</th>
                <th>Asset</th>
                <th>Made By</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Source</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {state === 'loading' &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr className="skeleton-row" key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}><div className="skeleton-bar" style={{ width: '80%' }} /></td>
                    ))}
                  </tr>
                ))}
              {state === 'error' && (
                <tr><td colSpan={8} className="table-error">Couldn&apos;t load issues ({fn.error}).<br /><button className="retry-btn" onClick={() => void fn.trigger()}>Retry</button></td></tr>
              )}
              {state === 'ready' && filtered.length === 0 && (
                <tr><td colSpan={8} className="table-empty">No issues match.</td></tr>
              )}
              {state === 'ready' && filtered.map((r, i) => (
                <tr key={`${r.issue_id}-${i}`}>
                  <td className="tag-cell">{r.name}</td>
                  <td>{r.description}</td>
                  <td className="discipline-cell">{r.asset_name}</td>
                  <td>{r.created_by || '—'}</td>
                  <td><span className={`status-chip ${priorityClass(r.priority)}`}>{r.priority || '—'}</span></td>
                  <td><span className="status-chip caution">{r.status}</span></td>
                  <td className="discipline-cell">{r.source_type || '—'}</td>
                  <td className="discipline-cell">{r.due_date || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
