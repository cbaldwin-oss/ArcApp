import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Camera } from 'lucide-react'
import type { ScheduleRow, ActivityAnswer } from '../types'
import { fmtDate, fmtOffset } from '../utils'
import { getChecklist } from '../checklists'
import TamperSealSection, { type SealPayloadRow } from './TamperSealSection'
import RtftSection, { type RtftPayload } from './RtftSection'
import { FALLBACK_WORKFLOW_ITEMS, type WorkflowItem } from '../workflowItems'

type Workflow = { id: string; activities: string[]; items: string[] }

type Props = {
  row: ScheduleRow | null
  authUser: string | null
  resultOptions: string[]
  selectedDate: string
  answer: ActivityAnswer
  workflows: Workflow[]
  /** Item catalog from arcapp_workflow_items — decides which keys are valid and their labels. */
  workflowItems?: WorkflowItem[]
  onAnswerChange: (rowId: string | number, answer: ActivityAnswer) => void
  onClose: () => void
  onSaveResult: (rowId: string | number, value: string) => Promise<void>
  onSaveSeals: (rows: SealPayloadRow[]) => Promise<void>
  onSubmitRTFT: (payload: RtftPayload) => Promise<void>
  onOpenPhotos: (row: ScheduleRow) => void
}

export default function ActivityDrawer(props: Props) {
  const { row, authUser, resultOptions, selectedDate, answer, workflows, onAnswerChange, onClose } = props
  const open = row !== null

  const [offset, setOffset] = useState(answer.offsetHrs)
  const [caCount, setCaCount] = useState(answer.caCount)
  const [resultVal, setResultVal] = useState('')
  const [resultMsg, setResultMsg] = useState<{ text: string; cls: string }>({ text: '', cls: 'q-hint' })
  const [cmmsEquip, setCmmsEquip] = useState('')
  const [cmmsWo, setCmmsWo] = useState('')
  const [cmmsNotes, setCmmsNotes] = useState('')
  const [cmmsSaved, setCmmsSaved] = useState(false)

  useEffect(() => {
    if (!row) return
    setOffset(answer.offsetHrs)
    setCaCount(answer.caCount)
    setResultVal(row.result && row.result !== '—' ? row.result : '')
    setResultMsg({ text: '', cls: 'q-hint' })
    setCmmsEquip(answer.cmmsEquipmentId ?? '')
    setCmmsWo(answer.cmmsWorkOrder ?? '')
    setCmmsNotes(answer.cmmsNotes ?? '')
    setCmmsSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!row) return <div className="drawer-backdrop" />
  const activeRow: ScheduleRow = row

  const checklist = getChecklist(row)
  const rowId = row.id

  // Persist any subset of the answer, merging with current local state.
  function commit(next: Partial<ActivityAnswer>) {
    onAnswerChange(rowId, {
      offsetHrs: offset,
      caCount,
      cmmsEquipmentId: cmmsEquip,
      cmmsWorkOrder: cmmsWo,
      cmmsNotes: cmmsNotes,
      ...next,
    })
  }

  function stepOffset(delta: number) {
    const v = Math.round((offset + delta) * 100) / 100
    setOffset(v)
    commit({ offsetHrs: v })
  }
  function stepCa(delta: number) {
    const v = Math.max(1, caCount + delta)
    setCaCount(v)
    commit({ caCount: v })
  }

  async function saveResult(value: string) {
    setResultVal(value)
    setResultMsg({ text: 'Saving…', cls: 'q-hint' })
    try {
      await props.onSaveResult(rowId, value)
      setResultMsg({ text: 'Saved.', cls: 'q-hint ok' })
    } catch (err) {
      setResultMsg({ text: 'Failed to save: ' + (err instanceof Error ? err.message : String(err)), cls: 'q-hint err' })
    }
  }

  // No sign-in required to log activities yet — attribute the change if someone happens to be
  // signed in, otherwise just confirm the save. Revisit once real auth is in place.
  const resultStatusText = resultMsg.text || (authUser ? `Signed in as ${authUser} — changes save immediately.` : 'Changes save immediately.')
  const options = Array.from(new Set([...resultOptions, ...(resultVal ? [resultVal] : [])])).sort()

  // Decide which gated sections to render and in what order.
  const catalog = props.workflowItems?.length ? props.workflowItems : FALLBACK_WORKFLOW_ITEMS
  const validItems = new Set(catalog.map((i) => i.key))
  const itemLabel = (key: string) => catalog.find((i) => i.key === key)?.label ?? key
  const itemDescription = (key: string) => catalog.find((i) => i.key === key)?.description ?? ''

  const wf = workflows.find((w) =>
    w.activities.some((a) => a.trim().toLowerCase() === (activeRow.activity || '').trim().toLowerCase()),
  )
  // No configured workflow ⇒ show every enabled item, in catalog order.
  const orderedItems =
    wf && wf.items.length
      ? wf.items.filter((k) => validItems.has(k))
      : catalog.filter((i) => i.enabled).map((i) => i.key)

  function renderItem(key: string): ReactNode {
    switch (key) {
      case 'late_time_personnel':
        return (
          <div key={key}>
            <div className="q-block">
              <label className="q-label">Time between scheduled and actual start (hrs)</label>
              <div className="stepper">
                <button className="step-btn" type="button" onClick={() => stepOffset(-0.25)}>
                  &minus;
                </button>
                <input
                  type="number"
                  step="0.25"
                  className="step-input"
                  value={fmtOffset(offset)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0
                    setOffset(v)
                    commit({ offsetHrs: v })
                  }}
                />
                <button className="step-btn" type="button" onClick={() => stepOffset(0.25)}>
                  +
                </button>
              </div>
              <div className="q-hint">Negative = started early · Positive = started late</div>
            </div>
            {offset > 0 && (
              <div className="q-block">
                <label className="q-label">How many CA team members at inspection?</label>
                <div className="stepper">
                  <button className="step-btn" type="button" onClick={() => stepCa(-1)}>
                    &minus;
                  </button>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    className="step-input"
                    value={caCount}
                    onChange={(e) => {
                      const v = Math.max(1, parseInt(e.target.value, 10) || 1)
                      setCaCount(v)
                      commit({ caCount: v })
                    }}
                  />
                  <button className="step-btn" type="button" onClick={() => stepCa(1)}>
                    +
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      case 'joint_pack_photos':
        return (
          <div className="q-block" key={key}>
            <label className="q-label">{itemLabel(key)}</label>
            <button className="photo-log-btn" type="button" onClick={() => props.onOpenPhotos(activeRow)}>
              <Camera />
              Log Photos to Drive
            </button>
            <div className="q-hint">Files photos to the Activity → Asset → Date folder chain in Google Drive.</div>
          </div>
        )
      case 'tamper_seal':
        return (
          <TamperSealSection
            key={key}
            row={activeRow}
            authUser={authUser}
            selectedDate={selectedDate}
            onSubmit={props.onSaveSeals}
          />
        )
      case 'rtft':
        return (
          <RtftSection key={key} row={activeRow} authUser={authUser} selectedDate={selectedDate} onSubmit={props.onSubmitRTFT} />
        )
      case 'cmms_data_collection':
        return (
          <div className="q-block" key={key}>
            <label className="q-label">CMMS Data Collection</label>
            <div className="seal-row3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-field">
                <label>Equipment ID</label>
                <input
                  type="text"
                  value={cmmsEquip}
                  placeholder="e.g. AHU-04"
                  onChange={(e) => {
                    setCmmsEquip(e.target.value)
                    setCmmsSaved(false)
                  }}
                />
              </div>
              <div className="form-field">
                <label>Work order #</label>
                <input
                  type="text"
                  value={cmmsWo}
                  placeholder="e.g. WO-10293"
                  onChange={(e) => {
                    setCmmsWo(e.target.value)
                    setCmmsSaved(false)
                  }}
                />
              </div>
            </div>
            <div className="form-field">
              <label>Notes</label>
              <textarea
                value={cmmsNotes}
                placeholder="CMMS data collection notes"
                onChange={(e) => {
                  setCmmsNotes(e.target.value)
                  setCmmsSaved(false)
                }}
              />
            </div>
            <button
              className="seal-submit-btn"
              type="button"
              style={{ maxWidth: 160 }}
              onClick={() => {
                commit({ cmmsEquipmentId: cmmsEquip, cmmsWorkOrder: cmmsWo, cmmsNotes: cmmsNotes })
                setCmmsSaved(true)
              }}
            >
              Save CMMS Data
            </button>
            <div className={cmmsSaved ? 'q-hint ok' : 'q-hint'}>{cmmsSaved ? 'Saved.' : 'Records equipment ID, work order, and notes.'}</div>
          </div>
        )
      default: {
        // A catalog item whose behavior hasn't been defined yet (arcapp_workflow_items.config).
        // Shown rather than silently dropped so admins can see their workflow took effect.
        if (!validItems.has(key)) return null
        return (
          <div className="q-block" key={key}>
            <label className="q-label">{itemLabel(key)}</label>
            <div className="q-hint">{itemDescription(key) || 'This item is part of the workflow.'}</div>
            <div className="q-hint">Not configured yet — no form has been defined for this item.</div>
          </div>
        )
      }
    }
  }

  return (
    <div className="drawer-backdrop open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="activity-drawer open">
        <div className="drawer-header">
          <div>
            <div className="drawer-eyebrow">Scheduled Activity</div>
            <h3 className="drawer-title">{row.activity}</h3>
            <div className="drawer-sub">
              {row.place} · {fmtDate(row.date)}
              {row.time && row.time !== '—' ? ` · ${row.time}` : ''}
            </div>
          </div>
          <button className="fs-close" onClick={onClose} aria-label="Close activity">
            &times;
          </button>
        </div>

        <div className="drawer-columns">
          {/* LEFT: reference */}
          <div className="drawer-reference">
            <span className="ref-sample-tag">Sample reference — for design review</span>
            <h4 className="ref-heading">What You&apos;re Inspecting</h4>
            <p className="ref-overview">{checklist.overview(row)}</p>
            <h4 className="ref-heading second">Common Things to Look For</h4>
            <ul className="ref-list">
              {checklist.items.map((i, idx) => (
                <li key={idx}>{i}</li>
              ))}
            </ul>
          </div>

          {/* RIGHT: workflow-driven questions */}
          <div className="drawer-questions">
            {orderedItems.map((key) => renderItem(key))}

            {/* Activity Result — always shown (account of record), regardless of workflow */}
            <div className="q-block">
              <label className="q-label">Activity result</label>
              <select
                className="result-input"
                value={resultVal}
                onChange={(e) => saveResult(e.target.value)}
              >
                <option value="">— No result yet —</option>
                {options.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <div className={resultMsg.cls}>{resultStatusText}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
