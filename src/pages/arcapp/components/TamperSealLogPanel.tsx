import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Plus, RefreshCw } from 'lucide-react'
import { useGetAssetPlaceOptions, useGetTamperSeals, useLogTamperSeals } from '../../../lib/api'
import type { SealInput } from '../../../lib/api'
import { fmtDate, localIsoDate } from '../utils'
import TamperSealSection from './TamperSealSection'
import type { ShellContext } from '../ShellContext'

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
  const { currentUserEmail } = useOutletContext<ShellContext>()
  const fn = useGetTamperSeals()
  const assetPlaceFn = useGetAssetPlaceOptions()
  const logFn = useLogTamperSeals()

  useEffect(() => {
    void fn.trigger()
    void assetPlaceFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = (fn.data as SealRow[] | undefined) ?? []
  const assetPlaceOptions = assetPlaceFn.data ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  const [addOpen, setAddOpen] = useState(false)
  const [asset, setAsset] = useState('')
  const [date, setDate] = useState(localIsoDate())

  // The place isn't picked separately — it's whatever this asset is paired with in
  // STY4dropdownoptions, same source the Activities/Results dropdowns already read from.
  const place = useMemo(() => assetPlaceOptions.find((o) => o.asset === asset)?.place ?? '', [assetPlaceOptions, asset])

  async function submitSeals(sealRows: SealInput[]) {
    await logFn.trigger({ rows: sealRows }).result
    void fn.trigger()
  }

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
        <div className="panel-header-right" style={{ gap: 10 }}>
          <button type="button" className="panel-action-btn" onClick={() => setAddOpen((v) => !v)}>
            <Plus style={{ width: 15, height: 15 }} />
            {addOpen ? 'Close' : 'Log Seals'}
          </button>
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh tamper seals">
            <RefreshCw />
          </button>
        </div>
      </div>

      {addOpen && (
        <div className="panel-body" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="seal-row3" style={{ gridTemplateColumns: '1.4fr 1.4fr 1fr' }}>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Asset</label>
              <select value={asset} disabled={assetPlaceFn.loading && !assetPlaceFn.data} onChange={(e) => setAsset(e.target.value)}>
                <option value="">
                  {assetPlaceFn.loading && !assetPlaceFn.data ? 'Loading assets…' : 'Select an asset...'}
                </option>
                {assetPlaceOptions.map((o) => (
                  <option key={o.asset} value={o.asset}>
                    {o.asset}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Place</label>
              <div
                style={{
                  background: 'var(--bg-elev-2)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-sm)',
                  color: place ? 'var(--text)' : 'var(--text-faint)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13.5,
                  padding: '9px 11px',
                }}
              >
                {place || (asset ? 'No place on file for this asset' : 'Auto-filled from the selected asset')}
              </div>
            </div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Inspection date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {asset ? (
            <TamperSealSection
              assetName={asset}
              location={place}
              authUser={currentUserEmail}
              selectedDate={date}
              onSubmit={submitSeals}
            />
          ) : (
            <div className="q-hint">Select an asset above to start a seal range.</div>
          )}
        </div>
      )}

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
