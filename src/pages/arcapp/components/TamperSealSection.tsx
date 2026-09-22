import { useState } from 'react'
import type { SealSummary } from '../types'
import { parseOmitted, parseSealNumberParts } from '../utils'
import { hasCapability } from '../../../lib/project'

type SealInstance = {
  id: number
  start: string
  end: string
  omit: string
  subArea: string
  notes: string
}

export type SealPayloadRow = {
  asset_name: string
  location: string
  sub_area: string
  seal_number: string
  inspection_date: string
  inspection_notes: string
  status: string
}

/**
 * One individually-editable row in the preview grid, generated from a seal range before it's
 * saved. Mirrors the "Add Seals" -> "Generate Preview" -> "Confirm & Save"/"Cancel & Discard"
 * flow in tamperseal.html: nothing hits the database until the preview is confirmed, and any row
 * can be edited or excluded (via `include`) first.
 */
type PreviewSeal = {
  id: number
  sealNumber: string
  subArea: string
  notes: string
  status: string
  include: boolean
}

const STATUS_OPTIONS = ['Intact', 'Broken', 'Removed']

type Props = {
  /** Free-typed on the standalone Tamper Seals page, or a scheduled activity's row.asset/row.place
   * when this runs inside the Activity Drawer — either way it's just what gets stamped onto each
   * seal row, this component doesn't care where it came from. */
  assetName: string
  location: string
  authUser: string | null
  selectedDate: string
  onSubmit: (rows: SealPayloadRow[]) => Promise<void>
}

let counter = 0
function newInstance(): SealInstance {
  counter += 1
  return { id: counter, start: '', end: '', omit: '', subArea: '', notes: '' }
}
let previewCounter = 0
function nextPreviewId(): number {
  previewCounter += 1
  return previewCounter
}

type RangeResult = { sealNumbers: string[] } | { error: string }

/**
 * Expands one range into its individual seal numbers — allows an optional non-digit
 * prefix/suffix around the numeric core (e.g. "A-1001" through "A-1010"), matching
 * tamperseal.html's parseSealNumberParts/generatePreview exactly, padding width included.
 */
function buildSealRange(inst: SealInstance): RangeResult {
  const startParts = parseSealNumberParts(inst.start)
  const endParts = parseSealNumberParts(inst.end)
  if (!startParts || !endParts) {
    return { error: 'Enter valid seal numbers — each needs a numeric part (letters/dashes around it are fine, e.g. "A-1001").' }
  }
  if (startParts.prefix !== endParts.prefix || startParts.suffix !== endParts.suffix) {
    return { error: 'The first and last seal numbers need matching letters/prefix and suffix — only the numeric part should differ, e.g. "A-1001" to "A-1010".' }
  }
  const start = parseInt(startParts.num, 10)
  const end = parseInt(endParts.num, 10)
  if (isNaN(start) || isNaN(end) || start > end) {
    return { error: 'First seal # must be less than or equal to the last.' }
  }
  const padWidth = startParts.num.length // preserves leading-zero width, e.g. "001" -> "010" not "10"
  // Omitted entries match against the FULL seal number (case-insensitive), not just the bare
  // number, since the range itself can include letters now too.
  const omittedSet = new Set(parseOmitted(inst.omit).map((o) => o.toLowerCase()))
  const sealNumbers: string[] = []
  for (let i = start; i <= end; i++) {
    const sealNumber = `${startParts.prefix}${String(i).padStart(padWidth, '0')}${startParts.suffix}`
    if (omittedSet.has(sealNumber.toLowerCase())) continue
    sealNumbers.push(sealNumber)
  }
  return { sealNumbers }
}

function previewFor(inst: SealInstance): { text: string; cls: string } {
  if (!inst.start.trim() || !inst.end.trim()) return { text: 'Enter a first and last seal number.', cls: 'seal-preview' }
  const result = buildSealRange(inst)
  if ('error' in result) return { text: result.error, cls: 'seal-preview err' }
  const { sealNumbers } = result
  if (sealNumbers.length === 0) return { text: 'All seals in this range are omitted.', cls: 'seal-preview err' }
  const omitted = parseOmitted(inst.omit)
  const omitText = omitted.length ? ` (excluding ${omitted.join(', ')})` : ''
  const rangeText = `${sealNumbers[0]}–${sealNumbers[sealNumbers.length - 1]}`
  return { text: `${sealNumbers.length} seal${sealNumbers.length === 1 ? '' : 's'}: ${rangeText}${omitText}`, cls: 'seal-preview ok' }
}

export default function TamperSealSection({ assetName, location, authUser, selectedDate, onSubmit }: Props) {
  const [instances, setInstances] = useState<SealInstance[]>([newInstance()])
  const [preview, setPreview] = useState<PreviewSeal[] | null>(null)
  const [log, setLog] = useState<SealSummary[]>([])
  const [msg, setMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [busy, setBusy] = useState(false)

  // No sign-in required to log tamper seals yet — attribute the entry if someone happens to be
  // signed in, otherwise it's logged without a signoff. Revisit once real auth is in place.
  const disabled = busy

  if (!hasCapability('siteLogging')) {
    return <div className="q-hint">Tamper Seal logging isn&apos;t available for this project yet.</div>
  }

  function update(id: number, patch: Partial<SealInstance>) {
    setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }
  function addInstance() {
    setInstances((prev) => [...prev, newInstance()])
  }
  function removeInstance(id: number) {
    setInstances((prev) => {
      const next = prev.filter((i) => i.id !== id)
      return next.length ? next : [newInstance()]
    })
  }

  /** Step 1 -> 2: expand every range into individual, independently-editable preview rows. Nothing is saved yet. */
  function generatePreview() {
    const rows: PreviewSeal[] = []
    for (const inst of instances) {
      const result = buildSealRange(inst)
      if ('error' in result) {
        setMsg({ text: result.error, cls: 'q-hint err' })
        return
      }
      for (const sealNumber of result.sealNumbers) {
        rows.push({
          id: nextPreviewId(),
          sealNumber,
          subArea: inst.subArea.trim(),
          notes: inst.notes.trim(),
          status: 'Intact',
          include: true,
        })
      }
    }

    if (rows.length === 0) {
      setMsg({ text: 'No seals to preview — check your ranges and omitted numbers.', cls: 'q-hint err' })
      return
    }

    setMsg({ text: '', cls: 'q-hint' })
    setPreview(rows)
  }

  function updatePreviewRow(id: number, patch: Partial<PreviewSeal>) {
    setPreview((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev))
  }
  function setAllIncluded(include: boolean) {
    setPreview((prev) => (prev ? prev.map((r) => ({ ...r, include })) : prev))
  }
  function discardPreview() {
    setPreview(null)
    setMsg({ text: '', cls: 'q-hint' })
  }

  /** Step 2 -> saved: only rows still checked "include" actually get written. */
  async function confirmPreview() {
    if (!preview) return
    const included = preview.filter((r) => r.include)
    if (included.length === 0) {
      setMsg({ text: 'Nothing selected — check at least one seal or discard.', cls: 'q-hint err' })
      return
    }
    const payloadRows: SealPayloadRow[] = included.map((r) => ({
      asset_name: assetName,
      location,
      sub_area: r.subArea,
      seal_number: r.sealNumber,
      inspection_date: selectedDate,
      inspection_notes: r.notes,
      status: r.status,
    }))

    setBusy(true)
    setMsg({ text: `Logging ${payloadRows.length} seal${payloadRows.length === 1 ? '' : 's'}…`, cls: 'q-hint' })
    try {
      await onSubmit(payloadRows)
      const now = new Date().toLocaleTimeString()
      const skipped = preview.length - included.length
      const skipText = skipped ? ` (${skipped} excluded)` : ''
      const first = included[0]?.sealNumber ?? ''
      const last = included[included.length - 1]?.sealNumber ?? ''
      setLog((prev) => [{ text: `${included.length} seal${included.length === 1 ? '' : 's'}: ${first}–${last}${skipText}`, time: now }, ...prev])
      setMsg({ text: `Logged ${included.length} seal${included.length === 1 ? '' : 's'}.`, cls: 'q-hint ok' })
      setPreview(null)
      setInstances([newInstance()])
    } catch (err) {
      setMsg({ text: 'Failed to log seals: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  const includedCount = preview ? preview.filter((r) => r.include).length : 0

  return (
    <div className="q-block">
      <label className="q-label">Tamper seal log</label>

      {!preview && (
        <>
          <div>
            {instances.map((inst) => {
              const p = previewFor(inst)
              return (
                <div className="seal-instance" key={inst.id}>
                  <div className="seal-instance-head">
                    <span className="seal-instance-title">Seal Range</span>
                    <button
                      className="seal-remove-btn"
                      type="button"
                      title="Remove this range"
                      disabled={disabled}
                      onClick={() => removeInstance(inst.id)}
                    >
                      &times;
                    </button>
                  </div>
                  <div className="seal-row3">
                    <div className="seal-field">
                      <label>First seal #</label>
                      <input
                        type="text"
                        placeholder="e.g. 48201 or A-48201"
                        value={inst.start}
                        disabled={disabled}
                        onChange={(e) => update(inst.id, { start: e.target.value })}
                      />
                    </div>
                    <div className="seal-field">
                      <label>Last seal #</label>
                      <input
                        type="text"
                        placeholder="e.g. 48215 or A-48215"
                        value={inst.end}
                        disabled={disabled}
                        onChange={(e) => update(inst.id, { end: e.target.value })}
                      />
                    </div>
                    <div className="seal-field">
                      <label>Omitted (comma-sep)</label>
                      <input
                        type="text"
                        placeholder="e.g. 48205, A-48210"
                        value={inst.omit}
                        disabled={disabled}
                        onChange={(e) => update(inst.id, { omit: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="seal-field">
                    <label>Sub area (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. North panel"
                      value={inst.subArea}
                      disabled={disabled}
                      onChange={(e) => update(inst.id, { subArea: e.target.value })}
                    />
                  </div>
                  <div className="seal-field">
                    <label>Inspection notes (optional)</label>
                    <textarea
                      placeholder="Anything worth noting"
                      value={inst.notes}
                      disabled={disabled}
                      onChange={(e) => update(inst.id, { notes: e.target.value })}
                    />
                  </div>
                  <div className={p.cls}>{p.text}</div>
                </div>
              )
            })}
          </div>

          <button className="seal-add-btn" type="button" disabled={disabled} onClick={addInstance}>
            + Add Another Range
          </button>
          <button className="seal-submit-btn" type="button" disabled={disabled} onClick={generatePreview}>
            Generate Preview
          </button>
          <div className={msg.cls}>
            {msg.text || (busy ? '' : authUser ? `Signed in as ${authUser}.` : 'Logged without a signoff — not signed in.')}
          </div>
        </>
      )}

      {preview && (
        <div className="seal-preview-panel">
          <div className="seal-preview-head">
            <div>
              <div className="seal-preview-title">
                Review {preview.length} seal{preview.length === 1 ? '' : 's'} — {assetName}
                {location ? ` · ${location}` : ''}
              </div>
              <div className="q-hint" style={{ margin: 0 }}>
                Nothing is saved yet. Uncheck any seal that shouldn&apos;t go through, edit fields as needed, then confirm.
              </div>
            </div>
            <div className="seal-preview-bulk">
              <button type="button" className="wf-link-btn" disabled={disabled} onClick={() => setAllIncluded(true)}>
                Select all
              </button>
              <span className="wf-bulk-sep">·</span>
              <button type="button" className="wf-link-btn" disabled={disabled} onClick={() => setAllIncluded(false)}>
                Deselect all
              </button>
            </div>
          </div>

          <div className="seal-preview-list">
            {preview.map((r) => (
              <div className={`seal-preview-row${r.include ? '' : ' excluded'}`} key={r.id}>
                <input
                  type="checkbox"
                  checked={r.include}
                  disabled={disabled}
                  title={r.include ? 'Included — uncheck to exclude' : 'Excluded — check to include'}
                  onChange={(e) => updatePreviewRow(r.id, { include: e.target.checked })}
                />
                <div className="seal-preview-cell num">
                  <label>Seal #</label>
                  <input
                    type="text"
                    value={r.sealNumber}
                    disabled={disabled || !r.include}
                    onChange={(e) => updatePreviewRow(r.id, { sealNumber: e.target.value })}
                  />
                </div>
                <div className="seal-preview-cell">
                  <label>Sub area</label>
                  <input
                    type="text"
                    value={r.subArea}
                    disabled={disabled || !r.include}
                    onChange={(e) => updatePreviewRow(r.id, { subArea: e.target.value })}
                  />
                </div>
                <div className="seal-preview-cell status">
                  <label>Status</label>
                  <select
                    value={r.status}
                    disabled={disabled || !r.include}
                    onChange={(e) => updatePreviewRow(r.id, { status: e.target.value })}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="seal-preview-cell notes">
                  <label>Notes</label>
                  <input
                    type="text"
                    value={r.notes}
                    disabled={disabled || !r.include}
                    onChange={(e) => updatePreviewRow(r.id, { notes: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <button className="seal-submit-btn" style={{ maxWidth: 220 }} type="button" disabled={disabled || includedCount === 0} onClick={confirmPreview}>
              {busy ? 'Saving…' : `Confirm & Save ${includedCount} Seal${includedCount === 1 ? '' : 's'}`}
            </button>
            <button className="wf-btn" style={{ padding: '0 16px' }} type="button" disabled={disabled} onClick={discardPreview}>
              Cancel &amp; Discard
            </button>
          </div>
          <div className={msg.cls}>{msg.text}</div>
        </div>
      )}

      {log.length > 0 && (
        <div className="seal-log-list">
          <div className="q-hint" style={{ marginBottom: 8 }}>
            Logged this session:
          </div>
          {log.map((s, i) => (
            <div className="seal-log-item" key={i}>
              <span className="num">{s.text}</span>
              <span className="time">{s.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
