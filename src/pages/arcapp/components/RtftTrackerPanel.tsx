import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, RefreshCw, AlertTriangle } from 'lucide-react'
import { useGetAssetOptions, useGetRtft, useSubmitRtft } from '../../../lib/api'
import type { RtftInput } from '../../../lib/api'
import { fmtDate, localIsoDate } from '../utils'
import RtftSection from './RtftSection'
import AssetPicker from './AssetPicker'
import type { ShellContext } from '../ShellContext'

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
  const { currentUserEmail } = useOutletContext<ShellContext>()
  const fn = useGetRtft()
  const assetsFn = useGetAssetOptions()
  const submitFn = useSubmitRtft()

  function load() {
    void fn.trigger()
    void assetsFn.trigger()
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = (fn.data as RtftRow[] | undefined) ?? []
  const assets = (assetsFn.data as string[] | undefined) ?? []
  const state = fn.error || assetsFn.error ? 'error' : !fn.data || !assetsFn.data ? 'loading' : 'ready'
  const loading = fn.loading || assetsFn.loading

  // Every asset should have at least one RTFT entry logged against it — this is everything from
  // STY4dropdownoptions.Assets that doesn't show up as an `equipment` value on any row yet.
  const missingAssets = useMemo(() => {
    const covered = new Set(rows.map((r) => r.equipment).filter(Boolean))
    return assets.filter((a) => !covered.has(a))
  }, [assets, rows])

  const [logOpen, setLogOpen] = useState(false)
  const [asset, setAsset] = useState('')
  const [date, setDate] = useState(localIsoDate())

  async function submitEntry(payload: RtftInput) {
    await submitFn.trigger(payload).result
    load()
  }

  return (
    <section className="panel" id="rtft">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">RTFT Tracker</h2>
          <span className="panel-count">{state === 'ready' ? `${rows.length} entries` : '— entries'}</span>
          {state === 'ready' && (
            <span
              className={missingAssets.length > 0 ? 'status-chip caution' : 'status-chip go'}
              title={
                missingAssets.length > 0
                  ? `Assets with no RTFT entry yet: ${missingAssets.join(', ')}`
                  : 'Every tracked asset has at least one RTFT entry.'
              }
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <AlertTriangle style={{ width: 12, height: 12 }} />
              {missingAssets.length} asset{missingAssets.length === 1 ? '' : 's'} missing an RTFT entry
            </span>
          )}
          <span className={state === 'ready' ? 'conn-pill ready' : state === 'error' ? 'conn-pill error' : 'conn-pill loading'}>
            <span className={state === 'error' ? 'led red' : 'led'} /> {state === 'ready' ? 'Live' : state === 'error' ? 'Offline' : 'Syncing'}
          </span>
        </div>
        <div className="panel-header-right" style={{ gap: 10 }}>
          <button type="button" className="panel-action-btn" onClick={() => setLogOpen((v) => !v)}>
            <Plus style={{ width: 15, height: 15 }} />
            {logOpen ? 'Close' : 'Log RTFT'}
          </button>
          <button className={loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={load} aria-label="Refresh RTFT">
            <RefreshCw />
          </button>
        </div>
      </div>

      {logOpen && (
        <div className="panel-body" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="seal-row3" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Asset</label>
              <AssetPicker
                options={assets}
                value={asset}
                onChange={setAsset}
                loading={assetsFn.loading && !assetsFn.data}
              />
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Inspection date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {asset ? (
            <RtftSection equipment={asset} authUser={currentUserEmail} selectedDate={date} onSubmit={submitEntry} />
          ) : (
            <div className="q-hint">Select an asset above to log an RTFT entry.</div>
          )}
        </div>
      )}

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
                    Couldn&apos;t load RTFT entries.
                    <br />
                    <button className="retry-btn" onClick={load}>
                      Retry
                    </button>
                  </td>
                </tr>
              )}
              {state === 'ready' && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="table-empty">
                    No RTFT entries yet. Use &quot;Log RTFT&quot; above, or submit one from an
                    activity&apos;s detail drawer.
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
