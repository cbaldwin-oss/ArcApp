import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Check, Plus, RefreshCw, X } from 'lucide-react'
import { useGetAssetPlaceOptions, useGetBreakRequests, useGetTamperSeals, useLogTamperSeals, useDecideBreakRequest } from '../../../lib/api'
import type { BreakRequestRow, SealInput } from '../../../lib/api'
import { fmtDate, localIsoDate } from '../utils'
import { hasCapability } from '../../../lib/project'
import TamperSealSection from './TamperSealSection'
import AssetPicker from './AssetPicker'
import CapabilityNotice from './CapabilityNotice'
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

const ALL = 'All'

/** Toggles a value in/out of a multi-select filter set, same semantics as LaunchPad's Tamper Seal
 * log filter bar: clicking "All" clears back to just {All}; clicking a specific value drops "All"
 * and toggles that value; emptying the set falls back to {All} rather than matching nothing. */
function toggleFilterValue(current: Set<string>, value: string): Set<string> {
  const next = new Set(current)
  if (value === ALL) return new Set([ALL])
  next.delete(ALL)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  if (next.size === 0) next.add(ALL)
  return next
}

function FilterButtonGroup({ label, options, selected, onToggle }: { label: string; options: string[]; selected: Set<string>; onToggle: (value: string) => void }) {
  return (
    <div className="ts-filter-group">
      <span className="ts-filter-label">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`ts-filter-btn${selected.has(opt) ? ' active' : ''}`}
          onClick={() => onToggle(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

/** The CCM approval step LaunchPad's field form starts but never finishes: it flips a seal to
 * "Break Requested (Pending Approval)" and logs a request, but there's no approve/deny UI
 * anywhere in LaunchPad itself. This lists those pending seals and lets a CCM decide them. */
function BreakRequestsSection({ canDecide, onDecided }: { canDecide: boolean; onDecided: () => void }) {
  const breakFn = useGetBreakRequests()
  const decideFn = useDecideBreakRequest()
  const [pending, setPending] = useState<{ row: BreakRequestRow; approve: boolean } | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    void breakFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = (breakFn.data as BreakRequestRow[] | undefined) ?? []

  async function confirmDecision() {
    if (!pending) return
    await decideFn.trigger({ assetId: pending.row.assetId, requestId: pending.row.requestId, approve: pending.approve, notes }).result
    setPending(null)
    setNotes('')
    void breakFn.trigger()
    onDecided()
  }

  if (breakFn.loading && !breakFn.data) return null
  if (rows.length === 0) return null

  return (
    <div className="panel-body" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="q-hint" style={{ marginBottom: 10, fontWeight: 600, color: 'var(--text)' }}>
        Pending Break Requests ({rows.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => {
          const isPendingThis = pending?.row.assetId === r.assetId
          return (
            <div
              key={r.assetId}
              style={{
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                background: 'var(--bg-elev-2)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ color: 'var(--text)' }}>{r.asset_name}</strong>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>— Seal #{r.seal_number}</span>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 2 }}>
                    {r.location || '—'}
                    {r.sub_area ? ` / ${r.sub_area}` : ''}
                  </div>
                </div>
                {canDecide && !isPendingThis && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="wf-btn"
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => {
                        setPending({ row: r, approve: true })
                        setNotes('')
                      }}
                    >
                      <Check style={{ width: 13, height: 13 }} /> Approve
                    </button>
                    <button
                      type="button"
                      className="wf-btn danger"
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => {
                        setPending({ row: r, approve: false })
                        setNotes('')
                      }}
                    >
                      <X style={{ width: 13, height: 13 }} /> Deny
                    </button>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                {r.requestor_name || r.requestor_email || r.requestor_company || r.reason || r.requested_at ? (
                  <>
                    {(r.requestor_name || r.requestor_email) && (
                      <div>
                        Requested by {r.requestor_name || '—'}
                        {r.requestor_company ? ` (${r.requestor_company})` : ''}
                        {r.requestor_email ? ` — ${r.requestor_email}` : ''}
                        {r.requested_at ? ` on ${fmtDate(r.requested_at.slice(0, 10))}` : ''}
                      </div>
                    )}
                    {r.reason && <div style={{ marginTop: 2 }}>Reason: {r.reason}</div>}
                  </>
                ) : (
                  <div style={{ color: 'var(--text-faint)' }}>No request details on file for this seal.</div>
                )}
              </div>

              {isPendingThis && (
                <div className="wf-confirm" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                  {pending.approve ? 'Approve this break request?' : 'Deny this break request?'}
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={{ flex: '1 1 160px', minWidth: 140 }}
                  />
                  <button className={pending.approve ? 'wf-btn' : 'wf-btn danger'} disabled={decideFn.loading} onClick={confirmDecision}>
                    {decideFn.loading ? '…' : pending.approve ? 'Yes, approve' : 'Yes, deny'}
                  </button>
                  <button className="wf-btn" disabled={decideFn.loading} onClick={() => setPending(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {decideFn.error && <div className="q-hint err" style={{ marginTop: 8 }}>{decideFn.error}</div>}
    </div>
  )
}

export default function TamperSealLogPanel() {
  const { currentUserEmail, canEdit } = useOutletContext<ShellContext>()
  const available = hasCapability('siteLogging')
  const fn = useGetTamperSeals()
  const assetPlaceFn = useGetAssetPlaceOptions()
  const logFn = useLogTamperSeals()

  useEffect(() => {
    if (!available) return
    void fn.trigger()
    void assetPlaceFn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!available) {
    return (
      <CapabilityNotice
        feature="Tamper Seals"
        id="tamperseals"
        reason="This project has no <prefix>Assets table yet — that's what Tamper Seal entries write to."
      />
    )
  }

  const rows = (fn.data as SealRow[] | undefined) ?? []
  const assetPlaceOptions = assetPlaceFn.data ?? []
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'

  // Filtering ported from LaunchPad's Tamper Seal log: multi-select Location/Status toggle
  // buttons (both default to "All") plus a free-text search, rather than the single-select
  // dropdowns Checklists/Issues/Submittals use elsewhere in this app — LaunchPad's own UX for
  // this specific page, kept as-is since that's what was asked for.
  const [locationFilter, setLocationFilter] = useState<Set<string>>(new Set([ALL]))
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set([ALL]))
  const [search, setSearch] = useState('')

  const locations = useMemo(() => [ALL, ...Array.from(new Set(rows.map((r) => r.location.trim() || 'Unassigned'))).sort()], [rows])
  const statuses = useMemo(() => [ALL, ...Array.from(new Set(rows.map((r) => r.status).filter(Boolean))).sort()], [rows])

  const q = search.trim().toLowerCase()
  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        const loc = r.location.trim() || 'Unassigned'
        if (!locationFilter.has(ALL) && !locationFilter.has(loc)) return false
        if (!statusFilter.has(ALL)) {
          const s = (r.status || '').toLowerCase()
          if (!Array.from(statusFilter).some((f) => s.includes(f.toLowerCase()))) return false
        }
        if (q) {
          const searchStr = `${r.asset_name} ${r.location} ${r.seal_number} ${r.sub_area} ${r.inspection_notes} ${r.signoff}`.toLowerCase()
          if (!searchStr.includes(q)) return false
        }
        return true
      }),
    [rows, locationFilter, statusFilter, q],
  )

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
          <span className="panel-count">
            {state === 'ready' ? (filteredRows.length === rows.length ? `${rows.length} seals` : `${filteredRows.length} of ${rows.length} seals`) : '— seals'}
          </span>
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
              <AssetPicker
                options={assetPlaceOptions.map((o) => o.asset)}
                value={asset}
                onChange={setAsset}
                loading={assetPlaceFn.loading && !assetPlaceFn.data}
              />
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

      <BreakRequestsSection canDecide={canEdit} onDecided={() => void fn.trigger()} />

      {state === 'ready' && (
        <div className="ts-filters">
          <FilterButtonGroup label="Locations" options={locations} selected={locationFilter} onToggle={(v) => setLocationFilter((cur) => toggleFilterValue(cur, v))} />
          <FilterButtonGroup label="Statuses" options={statuses} selected={statusFilter} onToggle={(v) => setStatusFilter((cur) => toggleFilterValue(cur, v))} />
          <input
            type="text"
            className="ts-search"
            placeholder="Search seal #, asset, location, notes, signoff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
              {state === 'ready' && rows.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty">
                    No seals match the current filters.
                  </td>
                </tr>
              )}
              {state === 'ready' &&
                filteredRows.map((r) => (
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
