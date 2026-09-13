import { useEffect, useState, useMemo } from 'react'
import { RefreshCw } from 'lucide-react'
import { useGetAssetOptions, useGetSubmittals, useSaveSubmittal } from '../../../lib/api'

const STATUSES = ['', 'Not Started', 'In Review', 'Approved', 'Rejected']

type SubmittalRow = { asset_name: string; notes: string; review_status: string; updated_by: string }
type Entry = { notes: string; review_status: string; dirty: boolean; saving: boolean; saved: boolean; error: string }

function statusClass(s: string): string {
  const t = (s || '').toLowerCase()
  if (t === 'approved') return 'go'
  if (t === 'rejected') return 'hold'
  if (t === 'in review') return 'caution'
  return 'muted'
}

export default function SubmittalReviewerPanel({ canEdit }: { canEdit: boolean }) {
  const assetsFn = useGetAssetOptions()
  const submittalsFn = useGetSubmittals()
  const saveFn = useSaveSubmittal()

  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [filter, setFilter] = useState('')

  function load() {
    void assetsFn.trigger()
    void submittalsFn.trigger()
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assets = (assetsFn.data as string[] | undefined) ?? []
  const submittals = (submittalsFn.data as SubmittalRow[] | undefined) ?? []

  // Seed entries from saved submittals once both loads resolve.
  useEffect(() => {
    if (!assetsFn.data || !submittalsFn.data) return
    const byAsset = new Map(submittals.map((s) => [s.asset_name, s]))
    const next: Record<string, Entry> = {}
    for (const a of assets) {
      const s = byAsset.get(a)
      next[a] = { notes: s?.notes ?? '', review_status: s?.review_status ?? '', dirty: false, saving: false, saved: false, error: '' }
    }
    setEntries(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsFn.data, submittalsFn.data])

  const state = assetsFn.error || submittalsFn.error ? 'error' : !assetsFn.data || !submittalsFn.data ? 'loading' : 'ready'
  const loading = assetsFn.loading || submittalsFn.loading

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return assets.filter((a) => !f || a.toLowerCase().includes(f))
  }, [assets, filter])

  function patch(asset: string, p: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [asset]: { ...(prev[asset] ?? { notes: '', review_status: '', dirty: false, saving: false, saved: false, error: '' }), ...p } }))
  }

  async function save(asset: string) {
    const e = entries[asset]
    if (!e || !canEdit) return
    patch(asset, { saving: true, saved: false, error: '' })
    try {
      await saveFn.trigger({ asset_name: asset, notes: e.notes, review_status: e.review_status }).result
      patch(asset, { saving: false, saved: true, dirty: false })
    } catch (err) {
      patch(asset, { saving: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  const reviewed = assets.filter((a) => entries[a]?.review_status).length

  return (
    <section className="panel" id="submittals">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Submittal Reviewer</h2>
          <span className="panel-count">{state === 'ready' ? `${reviewed}/${assets.length} reviewed` : '— assets'}</span>
        </div>
        <div className="panel-header-right">
          <button className={loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={load} aria-label="Refresh submittals">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        One submittal per asset · assets from <b style={{ color: 'var(--text-muted)' }}>STY4dropdownoptions.Assets</b>
        {!canEdit ? ' · sign-in as an authorized editor to edit' : ''}
      </div>
      {state === 'ready' && (
        <div style={{ padding: '0 20px 12px' }}>
          <input
            type="text"
            placeholder="Filter assets..."
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
        <div style={{ overflowX: 'auto', maxHeight: 560, overflowY: 'auto' }}>
          <table className="sched">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Asset</th>
                <th style={{ minWidth: 150 }}>Review Status</th>
                <th style={{ minWidth: 260 }}>Notes</th>
                <th>Save</th>
              </tr>
            </thead>
            <tbody>
              {state === 'loading' &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr className="skeleton-row" key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <td key={j}><div className="skeleton-bar" style={{ width: '80%' }} /></td>
                    ))}
                  </tr>
                ))}
              {state === 'error' && (
                <tr><td colSpan={4} className="table-error">Couldn&apos;t load submittals.<br /><button className="retry-btn" onClick={load}>Retry</button></td></tr>
              )}
              {state === 'ready' && filtered.length === 0 && (
                <tr><td colSpan={4} className="table-empty">No assets match.</td></tr>
              )}
              {state === 'ready' && filtered.map((asset) => {
                const e = entries[asset] ?? { notes: '', review_status: '', dirty: false, saving: false, saved: false, error: '' }
                return (
                  <tr key={asset}>
                    <td>{asset}</td>
                    <td>
                      {canEdit ? (
                        <select
                          className="result-input"
                          style={{ padding: '6px 8px', fontSize: 12.5 }}
                          value={e.review_status}
                          onChange={(ev) => patch(asset, { review_status: ev.target.value, dirty: true, saved: false })}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s || '—'}</option>)}
                        </select>
                      ) : (
                        <span className={`status-chip ${statusClass(e.review_status)}`}>{e.review_status || '—'}</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        value={e.notes}
                        disabled={!canEdit}
                        placeholder="Notes for review"
                        onChange={(ev) => patch(asset, { notes: ev.target.value, dirty: true, saved: false })}
                        style={{
                          width: '100%', background: 'var(--bg-elev-2)', border: '1px solid var(--border-strong)',
                          borderRadius: 'var(--radius-sm)', color: 'var(--text)', fontFamily: 'var(--font-body)', fontSize: 13, padding: '7px 9px',
                        }}
                      />
                    </td>
                    <td>
                      <button
                        className="retry-btn"
                        style={{ marginTop: 0, opacity: canEdit && e.dirty ? 1 : 0.5 }}
                        disabled={!canEdit || !e.dirty || e.saving}
                        onClick={() => save(asset)}
                      >
                        {e.saving ? 'Saving…' : e.saved ? 'Saved' : 'Save'}
                      </button>
                      {e.error ? <div className="q-hint err" style={{ marginTop: 4 }}>{e.error}</div> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
