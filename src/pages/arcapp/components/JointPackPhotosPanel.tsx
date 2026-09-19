import { useEffect, useMemo, useState } from 'react'
import { Camera, FolderOpen, Plus, RefreshCw } from 'lucide-react'
import { useGetJointPackData, useLogJointPackPhotos } from '../../../lib/api'
import type { JointPackRow, JointPackSide } from '../../../lib/api'
import { compressImageFile } from '../utils'

type Props = {
  /** Google Drive folder ID from Settings — see the label there for how to find one. */
  folder: string
  onGoToSettings: () => void
}

const SIDES: JointPackSide[] = ['Top', 'Side', 'Bottom']
// Every row in the sheet today is this building — kept as a fallback only, never hardcoded into
// a request; a new Joint Pack # takes whatever building an asset's existing rows already use.
const DEFAULT_BUILDING = 'STY4A'

function sideUrls(row: Pick<JointPackRow, 'topUrl' | 'sideUrl' | 'bottomUrl'>): Record<JointPackSide, string> {
  return { Top: row.topUrl, Side: row.sideUrl, Bottom: row.bottomUrl }
}
function outstandingCount(row: Pick<JointPackRow, 'topUrl' | 'sideUrl' | 'bottomUrl'>): number {
  return [row.topUrl, row.sideUrl, row.bottomUrl].filter((v) => !v).length
}

export default function JointPackPhotosPanel({ folder, onGoToSettings }: Props) {
  const fn = useGetJointPackData()
  useEffect(() => {
    void fn.trigger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const data = fn.data
  const rows = useMemo(() => data?.rows ?? [], [data])
  const state = fn.error ? 'error' : fn.loading || !fn.data ? 'loading' : 'ready'
  const hasFolder = folder.trim().length > 0

  const assets = useMemo(() => {
    const set = new Set<string>()
    for (const a of data?.knownAssets ?? []) set.add(a)
    for (const r of rows) if (r.asset) set.add(r.asset)
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [data, rows])

  const rowsByAsset = useMemo(() => {
    const map = new Map<string, JointPackRow[]>()
    for (const r of rows) {
      if (!map.has(r.asset)) map.set(r.asset, [])
      map.get(r.asset)!.push(r)
    }
    return map
  }, [rows])

  const totals = useMemo(() => {
    const sidesOutstanding = rows.reduce((sum, r) => sum + outstandingCount(r), 0)
    const assetsWithRows = rowsByAsset.size
    const assetsNotStarted = assets.filter((a) => !rowsByAsset.has(a)).length
    return { packs: rows.length, sidesOutstanding, assetsWithRows, assetsNotStarted }
  }, [rows, rowsByAsset, assets])

  const [search, setSearch] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null)

  const filteredAssets = useMemo(() => {
    const f = search.trim().toLowerCase()
    return f ? assets.filter((a) => a.toLowerCase().includes(f)) : assets
  }, [assets, search])

  const assetRows = selectedAsset ? rowsByAsset.get(selectedAsset) ?? [] : []
  const building = assetRows[0]?.building || rows[0]?.building || DEFAULT_BUILDING

  return (
    <section className="panel" id="jointpacks">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Joint Pack Photos</h2>
          <span className="panel-count">{state === 'ready' ? `${totals.sidesOutstanding} sides outstanding` : '—'}</span>
        </div>
        <div className="panel-header-right">
          <button className={fn.loading ? 'icon-btn spin' : 'icon-btn'} title="Refresh" onClick={() => void fn.trigger()} aria-label="Refresh Joint Pack data">
            <RefreshCw />
          </button>
        </div>
      </div>
      <div className="sync-note">
        Diagnosed from <b style={{ color: 'var(--text-muted)' }}>Joint Pack Photo - STY4A · Joint Packs</b>
        {state === 'ready'
          ? ` — ${totals.packs} joint pack${totals.packs === 1 ? '' : 's'} tracked across ${totals.assetsWithRows} asset${totals.assetsWithRows === 1 ? '' : 's'}${
              totals.assetsNotStarted > 0 ? `, ${totals.assetsNotStarted} more not started` : ''
            }.`
          : '.'}
      </div>

      <div className="panel-body">
        <div className="form-field" style={{ maxWidth: 560 }}>
          <label>Logging destination (Google Drive folder)</label>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: hasFolder ? 'var(--text)' : 'var(--text-faint)',
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
            }}
          >
            <FolderOpen style={{ width: 15, height: 15, flex: '0 0 auto', color: 'var(--green)' }} />
            {hasFolder ? folder : 'No destination set yet.'}
          </div>
        </div>

        {!hasFolder && (
          <div className="q-hint">
            Set a Google Drive folder ID in{' '}
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
            <a style={{ color: 'var(--green-soft)', cursor: 'pointer' }} onClick={onGoToSettings}>
              Settings
            </a>{' '}
            before logging Joint Pack photos.
          </div>
        )}

        {state === 'loading' && <div className="q-hint" style={{ marginTop: 14 }}>Loading…</div>}
        {state === 'error' && (
          <div className="table-error" style={{ marginTop: 14, padding: '12px 0' }}>
            Couldn&apos;t load Joint Pack data ({fn.error}).
            <br />
            <button className="retry-btn" onClick={() => void fn.trigger()}>
              Retry
            </button>
          </div>
        )}

        {state === 'ready' && (
          <>
            <div className="form-field" style={{ maxWidth: 420, marginTop: 18 }}>
              <label>Find an asset ({assets.length} tracked)</label>
              <input
                type="text"
                placeholder="e.g. MDA-ROW-1, PNM-ROW-12..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="wf-order-list" style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 20 }}>
              {filteredAssets.length === 0 && <div className="wf-order-empty">No assets match.</div>}
              {filteredAssets.map((a) => {
                const assetRowsForA = rowsByAsset.get(a) ?? []
                const started = assetRowsForA.length > 0
                const outstanding = assetRowsForA.reduce((sum, r) => sum + outstandingCount(r), 0)
                return (
                  <button
                    key={a}
                    type="button"
                    className="wf-order-item"
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      border: 'none',
                      background: selectedAsset === a ? 'var(--green-tint)' : 'transparent',
                    }}
                    onClick={() => setSelectedAsset(a)}
                  >
                    <span className="wf-order-label">{a}</span>
                    {!started ? (
                      <span className="wf-tag-disabled">not started</span>
                    ) : outstanding > 0 ? (
                      <span className="status-chip caution">
                        {outstanding} side{outstanding === 1 ? '' : 's'} needed
                      </span>
                    ) : (
                      <span className="status-chip complete">complete</span>
                    )}
                  </button>
                )
              })}
            </div>

            {selectedAsset && (
              <JointPackAssetDetail
                asset={selectedAsset}
                building={building}
                rows={assetRows}
                folderId={folder}
                onLogged={() => void fn.trigger()}
              />
            )}
          </>
        )}
      </div>
    </section>
  )
}

function JointPackAssetDetail({
  asset,
  building,
  rows,
  folderId,
  onLogged,
}: {
  asset: string
  building: string
  rows: JointPackRow[]
  folderId: string
  onLogged: () => void
}) {
  const [newNumber, setNewNumber] = useState('')
  const [openNumber, setOpenNumber] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.jointPackNumber.localeCompare(b.jointPackNumber, undefined, { numeric: true })),
    [rows],
  )
  const newIsExisting = sorted.some((r) => r.jointPackNumber === openNumber)

  return (
    <div className="wf-form" style={{ marginTop: 4 }}>
      <p className="wf-subtitle" style={{ marginTop: 0 }}>
        {asset} <span className="q-hint" style={{ margin: '0 0 0 8px' }}>{building}</span>
      </p>

      {sorted.length === 0 && (
        <div className="q-hint">No Joint Pack # rows logged yet for this asset — start the first one below.</div>
      )}

      <div className="wf-order-list">
        {sorted.map((r) => (
          <JointPackRowItem
            key={r.jointPackNumber}
            row={r}
            building={building}
            asset={asset}
            folderId={folderId}
            open={openNumber === r.jointPackNumber}
            onToggle={() => setOpenNumber(openNumber === r.jointPackNumber ? null : r.jointPackNumber)}
            onLogged={() => {
              onLogged()
              setOpenNumber(null)
            }}
          />
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="seal-row3" style={{ gridTemplateColumns: '1fr auto', maxWidth: 420 }}>
          <input
            type="text"
            placeholder="New Joint Pack # e.g. JPU-R03-PNM-01"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
          />
          <button
            className="seal-add-btn"
            style={{ width: 'auto', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}
            disabled={!newNumber.trim()}
            onClick={() => setOpenNumber(newNumber.trim())}
          >
            <Plus style={{ width: 14, height: 14 }} /> Start
          </button>
        </div>
        {openNumber && !newIsExisting && (
          <div style={{ marginTop: 10 }}>
            <JointPackRowItem
              row={{ row: 0, building, asset, jointPackNumber: openNumber, topUrl: '', sideUrl: '', bottomUrl: '' }}
              building={building}
              asset={asset}
              folderId={folderId}
              open
              onToggle={() => setOpenNumber(null)}
              onLogged={() => {
                onLogged()
                setOpenNumber(null)
                setNewNumber('')
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function JointPackRowItem({
  row,
  building,
  asset,
  folderId,
  open,
  onToggle,
  onLogged,
}: {
  row: JointPackRow
  building: string
  asset: string
  folderId: string
  open: boolean
  onToggle: () => void
  onLogged: () => void
}) {
  const logFn = useLogJointPackPhotos()
  const [files, setFiles] = useState<Partial<Record<JointPackSide, File>>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const urls = sideUrls(row)

  function pickFile(side: JointPackSide, file: File | null) {
    setFiles((f) => {
      const next = { ...f }
      if (file) next[side] = file
      else delete next[side]
      return next
    })
  }

  async function save() {
    const entries = Object.entries(files) as Array<[JointPackSide, File]>
    if (!entries.length) {
      setError('Attach at least one photo.')
      return
    }
    if (!folderId.trim()) {
      setError('Set a Google Drive destination folder in Settings first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const photos = await Promise.all(
        entries.map(async ([side, file]) => ({ side, dataUrl: await compressImageFile(file) })),
      )
      await logFn.trigger({ building, asset, jointPackNumber: row.jointPackNumber, photos }).result
      setFiles({})
      onLogged()
    } catch (err) {
      setError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="wf-item-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="wf-order-label" style={{ fontFamily: 'var(--font-mono)' }}>
          {row.jointPackNumber}
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {SIDES.map((side) =>
            urls[side] ? (
              <a
                key={side}
                href={urls[side]}
                target="_blank"
                rel="noopener noreferrer"
                className="status-chip complete"
                style={{ textDecoration: 'none' }}
              >
                {side} ✓
              </a>
            ) : (
              <span key={side} className="status-chip caution">
                {side} needed
              </span>
            ),
          )}
        </div>
        <button className="wf-btn" onClick={onToggle}>
          {open ? 'Close' : 'Log Photos'}
        </button>
      </div>

      {open && (
        <>
          <div className="seal-row3" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {SIDES.map((side) => (
              <div className="form-field" key={side} style={{ marginBottom: 0 }}>
                <label>
                  {side}
                  {urls[side] ? ' (replace)' : ''}
                </label>
                <input type="file" accept="image/*" onChange={(e) => pickFile(side, e.target.files?.[0] ?? null)} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="seal-submit-btn"
              style={{ maxWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              disabled={saving}
              onClick={save}
            >
              <Camera style={{ width: 15, height: 15 }} />
              {saving ? 'Saving…' : 'Save Photos'}
            </button>
            {error && <span className="q-hint err">{error}</span>}
          </div>
        </>
      )}
    </div>
  )
}
