import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, FolderOpen, Plus, RefreshCw } from 'lucide-react'
import { useGetJointPackData, useLogJointPackPhotos } from '../../../lib/api'
import type { JointPackRow, JointPackSide } from '../../../lib/api'
import { compressImageFile } from '../utils'
import FullscreenOverlay from './FullscreenOverlay'

const MAX_CAPTURE_DIM = 1600
const CAPTURE_QUALITY = 0.82

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
  const [cameraOpen, setCameraOpen] = useState(false)

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
        <div className="panel-header-right" style={{ gap: 10 }}>
          <button
            type="button"
            className="panel-action-btn"
            disabled={state !== 'ready'}
            onClick={() => setCameraOpen(true)}
          >
            <Camera style={{ width: 15, height: 15 }} />
            Open Camera
          </button>
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

      {cameraOpen && (
        <JointPackCameraWorkspace
          rows={rows}
          knownAssets={data?.knownAssets ?? []}
          folderId={folder}
          onClose={() => setCameraOpen(false)}
          onLogged={() => void fn.trigger()}
        />
      )}
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
  const [pending, setPending] = useState<Partial<Record<JointPackSide, string>>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const urls = sideUrls(row)

  function setPendingSide(side: JointPackSide, dataUrl: string | null) {
    setPending((p) => {
      const next = { ...p }
      if (dataUrl) next[side] = dataUrl
      else delete next[side]
      return next
    })
  }

  async function pickFile(side: JointPackSide, file: File | null) {
    if (!file) {
      setPendingSide(side, null)
      return
    }
    try {
      setPendingSide(side, await compressImageFile(file))
    } catch (err) {
      setError('Could not read that photo: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  async function save() {
    const entries = Object.entries(pending) as Array<[JointPackSide, string]>
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
      const photos = entries.map(([side, dataUrl]) => ({ side, dataUrl }))
      await logFn.trigger({ building, asset, jointPackNumber: row.jointPackNumber, photos }).result
      setPending({})
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
            ) : pending[side] ? (
              <span key={side} className="status-chip go" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <img src={pending[side]} className="camera-queued-thumb" alt="" />
                {side} queued
              </span>
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
                <input type="file" accept="image/*" onChange={(e) => void pickFile(side, e.target.files?.[0] ?? null)} />
              </div>
            ))}
          </div>
          <div className="q-hint">
            Prefer shooting from a live camera view instead? Use <b style={{ color: 'var(--text)' }}>Open Camera</b> at
            the top of this page — it lets you switch assets, Joint Pack #s, and angles without closing the camera.
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

/**
 * The camera lives here, at the page level, instead of inside a single Joint Pack #'s expanded
 * row — a crew walking a row of assets needs to switch which asset and which Joint Pack # they're
 * shooting constantly, and re-requesting the camera (and re-granting the permission prompt) every
 * time would be exactly the "click in and out" friction this is meant to avoid. The camera stream
 * is requested once when this opens and stays alive for as long as it's open, no matter how many
 * times the asset/Joint Pack #/angle selection changes underneath it.
 */
function JointPackCameraWorkspace({
  rows,
  knownAssets,
  folderId,
  onClose,
  onLogged,
}: {
  rows: JointPackRow[]
  knownAssets: string[]
  folderId: string
  onClose: () => void
  onLogged: () => void
}) {
  const logFn = useLogJointPackPhotos()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [ready, setReady] = useState(false)

  const assets = useMemo(() => {
    const set = new Set<string>()
    for (const a of knownAssets) set.add(a)
    for (const r of rows) if (r.asset) set.add(r.asset)
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [knownAssets, rows])

  const rowsByAsset = useMemo(() => {
    const map = new Map<string, JointPackRow[]>()
    for (const r of rows) {
      if (!map.has(r.asset)) map.set(r.asset, [])
      map.get(r.asset)!.push(r)
    }
    return map
  }, [rows])

  const [selectedAsset, setSelectedAsset] = useState<string>(assets[0] ?? '')
  const assetRows = useMemo(
    () =>
      [...(rowsByAsset.get(selectedAsset) ?? [])].sort((a, b) =>
        a.jointPackNumber.localeCompare(b.jointPackNumber, undefined, { numeric: true }),
      ),
    [rowsByAsset, selectedAsset],
  )
  const [selectedJP, setSelectedJP] = useState<string>('')
  const [newJP, setNewJP] = useState('')

  // Jumping to a new asset always resets which Joint Pack # is selected — the previous one
  // belongs to the asset we just left.
  useEffect(() => {
    setSelectedJP(assetRows[0]?.jointPackNumber ?? '')
    setNewJP('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset])

  const building = assetRows[0]?.building || rows[0]?.building || DEFAULT_BUILDING
  const activeRow = assetRows.find((r) => r.jointPackNumber === selectedJP)
  const existing = activeRow ? sideUrls(activeRow) : { Top: '', Side: '', Bottom: '' }

  // Keyed by asset+Joint Pack # so switching around doesn't lose photos already queued elsewhere.
  const [pendingByPack, setPendingByPack] = useState<Record<string, Partial<Record<JointPackSide, string>>>>({})
  const packKey = (asset: string, jp: string) => `${asset}::${jp}`
  const activeKey = packKey(selectedAsset, selectedJP)
  const pending = pendingByPack[activeKey] ?? {}

  const [activeSide, setActiveSide] = useState<JointPackSide>('Top')
  useEffect(() => {
    setActiveSide(SIDES.find((s) => !existing[s] && !pending[s]) ?? 'Top')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey])

  // Requested once for the life of this workspace — asset/Joint Pack #/angle switches below only
  // change which tab is highlighted and where the next shutter press gets filed, never the stream.
  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser doesn't support in-page camera capture — use a Joint Pack #'s file picker instead.")
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setReady(true)
        }
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Could not open the camera.')
      }
    }
    void start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !selectedJP.trim()) return
    const scale = Math.min(1, MAX_CAPTURE_DIM / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', CAPTURE_QUALITY)

    setPendingByPack((p) => ({ ...p, [activeKey]: { ...p[activeKey], [activeSide]: dataUrl } }))
    const stillNeeded = SIDES.filter((s) => s !== activeSide && !existing[s] && !pending[s])
    if (stillNeeded.length) setActiveSide(stillNeeded[0])
  }

  function clearPendingSide(side: JointPackSide) {
    setPendingByPack((p) => {
      const next = { ...(p[activeKey] ?? {}) }
      delete next[side]
      return { ...p, [activeKey]: next }
    })
  }

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function saveActive() {
    const entries = Object.entries(pending) as Array<[JointPackSide, string]>
    if (!entries.length) {
      setError('Capture at least one photo first.')
      return
    }
    if (!folderId.trim()) {
      setError('Set a Google Drive destination folder in Settings first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const photos = entries.map(([side, dataUrl]) => ({ side, dataUrl }))
      await logFn.trigger({ building, asset: selectedAsset, jointPackNumber: selectedJP, photos }).result
      setPendingByPack((p) => ({ ...p, [activeKey]: {} }))
      onLogged()
    } catch (err) {
      setError('Failed to save: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  function startNewJointPack() {
    const trimmed = newJP.trim()
    if (!trimmed) return
    setSelectedJP(trimmed)
    setNewJP('')
  }

  return (
    <FullscreenOverlay title="Joint Pack Camera" onClose={onClose}>
      <div className="jp-camera-layout">
        <div className="jp-camera-col">
          <div className="jp-camera-col-title">Asset</div>
          <div className="wf-order-list">
            {assets.map((a) => {
              const rowsForA = rowsByAsset.get(a) ?? []
              const outstanding = rowsForA.reduce((sum, r) => sum + outstandingCount(r), 0)
              return (
                <button
                  key={a}
                  type="button"
                  className={`wf-order-item jp-camera-pick${selectedAsset === a ? ' active' : ''}`}
                  onClick={() => setSelectedAsset(a)}
                >
                  <span className="wf-order-label">{a}</span>
                  {rowsForA.length === 0 ? (
                    <span className="wf-tag-disabled">new</span>
                  ) : outstanding > 0 ? (
                    <span className="status-chip caution">{outstanding}</span>
                  ) : (
                    <span className="status-chip complete">✓</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="jp-camera-col">
          <div className="jp-camera-col-title">Joint Pack #</div>
          <div className="wf-order-list">
            {assetRows.length === 0 && <div className="wf-order-empty">None yet — start one below.</div>}
            {assetRows.map((r) => {
              const outstanding = outstandingCount(r)
              const hasPending = Object.keys(pendingByPack[packKey(selectedAsset, r.jointPackNumber)] ?? {}).length > 0
              return (
                <button
                  key={r.jointPackNumber}
                  type="button"
                  className={`wf-order-item jp-camera-pick${selectedJP === r.jointPackNumber ? ' active' : ''}`}
                  onClick={() => setSelectedJP(r.jointPackNumber)}
                >
                  <span className="wf-order-label" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {r.jointPackNumber}
                  </span>
                  {outstanding === 0 ? (
                    <span className="status-chip complete">✓</span>
                  ) : hasPending ? (
                    <span className="status-chip go">●</span>
                  ) : (
                    <span className="status-chip caution">{outstanding}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="jp-camera-new-row">
            <input
              type="text"
              placeholder="New Joint Pack #..."
              value={newJP}
              onChange={(e) => setNewJP(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startNewJointPack()}
            />
            <button className="wf-btn" disabled={!newJP.trim()} onClick={startNewJointPack}>
              <Plus style={{ width: 13, height: 13 }} />
            </button>
          </div>
        </div>

        <div className="jp-camera-main">
          {!selectedAsset ? (
            <div className="q-hint">Pick an asset to begin.</div>
          ) : !selectedJP.trim() ? (
            <div className="q-hint">Pick or start a Joint Pack # to begin shooting.</div>
          ) : (
            <>
              <div className="jp-camera-context">
                {selectedAsset}
                <span className="q-hint" style={{ margin: '0 0 0 8px' }}>
                  {building}
                </span>
                <span className="wf-order-label" style={{ marginLeft: 10, fontFamily: 'var(--font-mono)' }}>
                  {selectedJP}
                </span>
              </div>

              <div className="camera-side-tabs">
                {SIDES.map((side) => {
                  const isDone = !!pending[side] || !!existing[side]
                  return (
                    <button
                      key={side}
                      type="button"
                      className={`camera-side-tab${activeSide === side ? ' active' : ''}${isDone ? ' done' : ''}`}
                      onClick={() => setActiveSide(side)}
                    >
                      {pending[side] && <img src={pending[side]} className="camera-thumb" alt="" />}
                      {side}
                      {isDone && !pending[side] ? ' ✓' : ''}
                    </button>
                  )
                })}
              </div>

              {cameraError ? (
                <div className="table-error" style={{ textAlign: 'center' }}>
                  {cameraError}
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video ref={videoRef} className="camera-video" playsInline muted />
                  <div className="camera-shutter-row">
                    <button
                      type="button"
                      className="camera-shutter-btn"
                      disabled={!ready}
                      onClick={capture}
                      aria-label={`Capture ${activeSide}`}
                    />
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                <button
                  className="seal-submit-btn"
                  style={{ maxWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  disabled={saving || Object.keys(pending).length === 0}
                  onClick={saveActive}
                >
                  <Camera style={{ width: 15, height: 15 }} />
                  {saving ? 'Saving…' : 'Save Photos'}
                </button>
                {pending[activeSide] && (
                  <button className="wf-btn" onClick={() => clearPendingSide(activeSide)}>
                    Clear {activeSide}
                  </button>
                )}
                {error && <span className="q-hint err">{error}</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </FullscreenOverlay>
  )
}
