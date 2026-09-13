import { useState } from 'react'
import type { ScheduleRow, SealSummary } from '../types'
import { parseOmitted } from '../utils'

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

type Props = {
  row: ScheduleRow
  authUser: string | null
  selectedDate: string
  onSubmit: (rows: SealPayloadRow[]) => Promise<void>
}

let counter = 0
function newInstance(): SealInstance {
  counter += 1
  return { id: counter, start: '', end: '', omit: '', subArea: '', notes: '' }
}

function previewFor(inst: SealInstance): { text: string; cls: string } {
  const start = parseInt(inst.start, 10)
  const end = parseInt(inst.end, 10)
  const omitted = parseOmitted(inst.omit)
  if (isNaN(start) || isNaN(end)) return { text: 'Enter a first and last seal number.', cls: 'seal-preview' }
  if (start > end) return { text: 'First seal # must be less than or equal to the last.', cls: 'seal-preview err' }
  const omittedSet = new Set(omitted)
  let count = 0
  for (let i = start; i <= end; i++) if (!omittedSet.has(i)) count++
  const omitText = omitted.length ? ` (excluding ${omitted.join(', ')})` : ''
  return { text: `${count} seal${count === 1 ? '' : 's'}: ${start}–${end}${omitText}`, cls: 'seal-preview ok' }
}

export default function TamperSealSection({ row, authUser, selectedDate, onSubmit }: Props) {
  const [instances, setInstances] = useState<SealInstance[]>([newInstance()])
  const [log, setLog] = useState<SealSummary[]>([])
  const [msg, setMsg] = useState<{ text: string; cls: string }>({
    text: 'Sign in to log tamper seals.',
    cls: 'q-hint',
  })
  const [busy, setBusy] = useState(false)

  const disabled = !authUser || busy

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

  async function submit() {
    if (!authUser) return
    const payloadRows: SealPayloadRow[] = []
    const summaries: Array<{ start: number; end: number; omitted: number[]; count: number }> = []
    for (const inst of instances) {
      const start = parseInt(inst.start, 10)
      const end = parseInt(inst.end, 10)
      const omitted = parseOmitted(inst.omit)
      if (isNaN(start) || isNaN(end) || start > end) {
        setMsg({ text: 'Every range needs a valid first and last seal number (first ≤ last).', cls: 'q-hint err' })
        return
      }
      const omittedSet = new Set(omitted)
      let rangeCount = 0
      for (let i = start; i <= end; i++) {
        if (omittedSet.has(i)) continue
        payloadRows.push({
          asset_name: row.asset,
          location: row.place,
          sub_area: inst.subArea.trim(),
          seal_number: i.toString(),
          inspection_date: selectedDate,
          inspection_notes: inst.notes.trim(),
          status: 'Intact',
        })
        rangeCount++
      }
      summaries.push({ start, end, omitted, count: rangeCount })
    }

    if (payloadRows.length === 0) {
      setMsg({ text: 'No seals to log — check your ranges and omitted numbers.', cls: 'q-hint err' })
      return
    }

    setBusy(true)
    setMsg({ text: `Logging ${payloadRows.length} seal${payloadRows.length === 1 ? '' : 's'}…`, cls: 'q-hint' })
    try {
      await onSubmit(payloadRows)
      const now = new Date().toLocaleTimeString()
      const newEntries: SealSummary[] = summaries.map((s) => {
        const omitText = s.omitted.length ? `, excl. ${s.omitted.join(', ')}` : ''
        return { text: `${s.count} seal${s.count === 1 ? '' : 's'}: ${s.start}–${s.end}${omitText}`, time: now }
      })
      setLog((prev) => [...newEntries, ...prev])
      setMsg({ text: `Logged ${payloadRows.length} seal${payloadRows.length === 1 ? '' : 's'}.`, cls: 'q-hint ok' })
      setInstances([newInstance()])
    } catch (err) {
      setMsg({ text: 'Failed to log seals: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="q-block">
      <label className="q-label">Tamper seal log</label>

      <div>
        {instances.map((inst) => {
          const preview = previewFor(inst)
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
                    inputMode="numeric"
                    placeholder="e.g. 48201"
                    value={inst.start}
                    disabled={disabled}
                    onChange={(e) => update(inst.id, { start: e.target.value })}
                  />
                </div>
                <div className="seal-field">
                  <label>Last seal #</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 48215"
                    value={inst.end}
                    disabled={disabled}
                    onChange={(e) => update(inst.id, { end: e.target.value })}
                  />
                </div>
                <div className="seal-field">
                  <label>Omitted (comma-sep)</label>
                  <input
                    type="text"
                    placeholder="e.g. 48205, 48210"
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
              <div className={preview.cls}>{preview.text}</div>
            </div>
          )
        })}
      </div>

      <button className="seal-add-btn" type="button" disabled={disabled} onClick={addInstance}>
        + Add Another Range
      </button>
      <button className="seal-submit-btn" type="button" disabled={disabled} onClick={submit}>
        Log All Seals
      </button>
      <div className={msg.cls}>{authUser && msg.cls === 'q-hint' && !busy ? `Signed in as ${authUser}.` : msg.text}</div>

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
